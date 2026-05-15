/**
 * Proposals router — stateless Quick Proposal estimate endpoint.
 *
 * POST /api/proposals/estimate  (no DB write)
 * GET  /api/proposals/equipment  — returns panel and battery catalogs for the UI
 *
 * All calculation logic lives in lib/proposal-calculator.ts.
 * All external geocoding/irradiance calls stay server-side.
 */

import { Router, type IRouter } from "express";
import { fetchPVWatts } from "../services/solar/pvwattsService";
import {
  runProposalCalc,
  verifyTestScenario,
  STATE_PSH,
  DEFAULT_PEAK_SUN_HOURS,
  DEFAULT_PANEL_TYPE,
  DEFAULT_BATTERY_TYPE,
  EFFICIENCY_FACTOR,
  PANEL_CATALOG,
  BATTERY_CATALOG,
} from "../services/proposals/proposalCalculator";
import { logger } from "../utils/logger";

const router: IRouter = Router();

// ─── GET /api/proposals/equipment ────────────────────────────────────────────
// Returns the panel and battery catalogs so the frontend can render selectors
// without embedding any business data client-side.

router.get("/proposals/equipment", (_req, res) => {
  res.json({
    panels: Object.entries(PANEL_CATALOG).map(([key, spec]) => ({
      key,
      label: spec.label,
      wattage: spec.wattage,
      efficiencyPct: spec.efficiencyPct,
      tempCoeffPct: spec.tempCoeffPct,
      bifacial: spec.bifacial,
      bifacialGainPct: spec.bifacialGainPct,
      costTier: spec.costTier,
      description: spec.description,
    })),
    batteries: Object.entries(BATTERY_CATALOG).map(([key, spec]) => ({
      key,
      label: spec.label,
      chemistry: spec.chemistry,
      dodPct: spec.dodPct,
      roundTripEffPct: spec.roundTripEffPct,
      estimatedCycleLife: spec.estimatedCycleLife,
      maintenanceRequired: spec.maintenanceRequired,
      requiresVentilation: spec.requiresVentilation,
      hasSafetyNotes: spec.safetyNotes !== null,
      costTier: spec.costTier,
      description: spec.description,
    })),
    defaults: {
      panelType: DEFAULT_PANEL_TYPE,
      batteryType: DEFAULT_BATTERY_TYPE,
    },
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

interface EstimateInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  annualKwh?: number | null;
  monthlyKwh?: number | null;
  panelType?: string;
  batteryType?: string;
  efficiencyFactor?: number;
  // TODO: future — roofAzimuth, roofTiltDeg, shadingPct, utilityRate, financeType
}

function parseInput(body: unknown): { ok: true; data: EstimateInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body required" };
  const b = body as Record<string, unknown>;

  if (typeof b["address"] !== "string" || !b["address"])
    return { ok: false, error: "address is required" };
  if (typeof b["city"] !== "string" || !b["city"])
    return { ok: false, error: "city is required" };
  if (typeof b["state"] !== "string" || b["state"].length !== 2)
    return { ok: false, error: "state must be a 2-letter code (e.g. CA)" };
  if (typeof b["zip"] !== "string" || !/^\d{5}$/.test(b["zip"]))
    return { ok: false, error: "zip must be a 5-digit ZIP code" };

  const hasAnnual = typeof b["annualKwh"] === "number" && (b["annualKwh"] as number) > 0;
  const hasMonthly = typeof b["monthlyKwh"] === "number" && (b["monthlyKwh"] as number) > 0;
  if (!hasAnnual && !hasMonthly)
    return { ok: false, error: "Provide annualKwh or monthlyKwh (must be positive)" };

  // Validate panel/battery type keys if provided
  if (b["panelType"] !== undefined && !PANEL_CATALOG[b["panelType"] as string])
    return { ok: false, error: `Unknown panelType. Valid options: ${Object.keys(PANEL_CATALOG).join(", ")}` };
  if (b["batteryType"] !== undefined && !BATTERY_CATALOG[b["batteryType"] as string])
    return { ok: false, error: `Unknown batteryType. Valid options: ${Object.keys(BATTERY_CATALOG).join(", ")}` };

  return {
    ok: true,
    data: {
      address: b["address"] as string,
      city: b["city"] as string,
      state: (b["state"] as string).toUpperCase(),
      zip: b["zip"] as string,
      annualKwh: typeof b["annualKwh"] === "number" ? b["annualKwh"] : null,
      monthlyKwh: typeof b["monthlyKwh"] === "number" ? b["monthlyKwh"] : null,
      panelType: typeof b["panelType"] === "string" ? b["panelType"] : DEFAULT_PANEL_TYPE,
      batteryType: typeof b["batteryType"] === "string" ? b["batteryType"] : DEFAULT_BATTERY_TYPE,
      efficiencyFactor:
        typeof b["efficiencyFactor"] === "number" ? b["efficiencyFactor"] : EFFICIENCY_FACTOR,
    },
  };
}

// ─── POST /api/proposals/estimate ─────────────────────────────────────────────

router.post("/proposals/estimate", async (req, res): Promise<void> => {
  const parsed = parseInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const input = parsed.data;
  const eff = input.efficiencyFactor ?? EFFICIENCY_FACTOR;
  const panelType = input.panelType ?? DEFAULT_PANEL_TYPE;
  const batteryType = input.batteryType ?? DEFAULT_BATTERY_TYPE;

  // ── Resolve annual kWh ──────────────────────────────────────────────────
  const annualKwh =
    input.annualKwh != null && input.annualKwh > 0
      ? input.annualKwh
      : (input.monthlyKwh ?? 0) * 12;

  // ── Resolve peak sun hours ──────────────────────────────────────────────
  // Priority: 1) NREL PVWatts (real TMY data)  2) State average  3) Default
  let psh = STATE_PSH[input.state] ?? DEFAULT_PEAK_SUN_HOURS;
  let pshSource: "pvwatts" | "state" | "default" =
    STATE_PSH[input.state] != null ? "state" : "default";
  let pvwattsMonthlyKwh: number[] | null = null;
  let pvwattsAnnualAt5kw: number | null = null;

  try {
    // TODO: swap for Aurora Solar / OpenSolar irradiance API when available
    const pv = await fetchPVWatts({
      systemCapacityKw: 5,
      losses: 14,
      installationType: "roof",
      roofPitch: "20",
      roofDirection: "South",
      address: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
    });
    if (pv) {
      psh = pv.solradAnnual;
      pshSource = "pvwatts";
      pvwattsMonthlyKwh = pv.acMonthly;
      pvwattsAnnualAt5kw = pv.acAnnual;
      logger.info({ psh, zip: input.zip, source: "pvwatts" }, "Proposal: irradiance resolved");
    }
  } catch {
    logger.warn({ state: input.state }, "Proposal: PVWatts unavailable, using state fallback");
  }

  // ── Run core calculation ────────────────────────────────────────────────
  const calc = runProposalCalc(annualKwh, psh, eff, panelType, batteryType);

  // ── Scale PVWatts monthly output to actual final system size ────────────
  // PVWatts was called at 5 kW reference; scale linearly to actual system kW.
  // Bifacial gain is also applied to the monthly values.
  let scaledMonthlyKwh: number[] | null = null;
  if (pvwattsMonthlyKwh && pvwattsAnnualAt5kw && pvwattsAnnualAt5kw > 0) {
    const scale = (calc.finalSystemKw / 5) * (1 + calc.panel.bifacialGainPct / 100);
    scaledMonthlyKwh = pvwattsMonthlyKwh.map((v) => Math.round(v * scale));
  }

  // ── Spec verification (5.5 PSH, 440W) for the formula-check panel ──────
  const specVerification = verifyTestScenario();

  // TODO future enrichment:
  //   utilityRate → estimatedAnnualSavings
  //   financeType → monthlyPaymentEstimate
  //   permitAhj → permitFee, setbackRequirements
  //   crm → leadId

  res.json({
    // Input echo
    address: input.address,
    city: input.city,
    state: input.state,
    zip: input.zip,
    annualKwhUsage: Math.round(annualKwh),
    monthlyKwhUsage: Math.round(annualKwh / 12),

    // Irradiance
    peakSunHours: Math.round(psh * 100) / 100,
    peakSunHoursSource: pshSource,

    // Panel details (from catalog)
    panel: {
      type: panelType,
      label: calc.panel.label,
      wattage: calc.panel.wattage,
      efficiencyPct: calc.panel.efficiencyPct,
      tempCoeffPct: calc.panel.tempCoeffPct,
      bifacial: calc.panel.bifacial,
      bifacialGainPct: calc.panel.bifacialGainPct,
      costTier: calc.panel.costTier,
      description: calc.panel.description,
    },

    // System sizing
    efficiencyFactor: eff,
    requiredSystemKw: calc.requiredSystemKw,
    panelCount: calc.panelCount,
    finalSystemKw: calc.finalSystemKw,

    // Production
    estimatedAnnualKwh: calc.estimatedAnnualKwh,
    estimatedMonthlyKwh: calc.estimatedMonthlyKwh,
    offsetPct: calc.offsetPct,

    // Monthly breakdown (PVWatts-scaled)
    monthlyProductionKwh: scaledMonthlyKwh,

    // Battery details (from catalog + sizing rule)
    battery: {
      type: batteryType,
      label: calc.battery.label,
      chemistry: calc.battery.chemistry,
      usableKwh: calc.battery.usableKwh,         // What you can actually use
      totalKwh: calc.battery.totalKwh,            // Rated capacity needed at this DoD
      dodPct: calc.battery.dodPct,
      roundTripEffPct: calc.battery.roundTripEffPct,
      estimatedCycleLife: calc.battery.estimatedCycleLife,
      maintenanceRequired: calc.battery.maintenanceRequired,
      requiresVentilation: calc.battery.requiresVentilation,
      safetyNotes: calc.battery.safetyNotes,
      rule: calc.battery.rule,
      description: calc.battery.description,
    },

    // Spec formula verification (§9 test scenario with 5.5 PSH, 440W)
    specVerification,

    // Disclaimer
    notes: [
      "This estimate is for preliminary planning only and should not be used for contracts or permits.",
      "Final design requires on-site roof measurements, shading analysis, utility bill review, and electrical panel inspection.",
      "System size may change after engineering review, local code compliance, and utility interconnection requirements.",
      "Battery sizing is based on annual usage rules. Actual backup time depends on which loads are connected.",
      "Production assumes a south-facing roof at 20° tilt with standard losses. Results vary with roof orientation and shading.",
      calc.panel.bifacial
        ? `Bifacial gain of ${calc.panel.bifacialGainPct}% is applied. Actual gain depends on mounting height, albedo (ground reflectivity), and local conditions.`
        : null,
      calc.battery.maintenanceRequired
        ? "Selected battery requires ongoing maintenance. Review safety notes with your installer before purchase."
        : null,
    ].filter((n): n is string => n !== null),
  });
});

export default router;
