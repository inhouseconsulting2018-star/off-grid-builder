/**
 * Proposals router — stateless Quick Proposal estimate endpoint.
 *
 * POST /api/proposals/estimate
 *   No DB write. Accepts address + annual usage, returns a customer-facing
 *   solar sizing estimate with optional PVWatts irradiance enrichment.
 *
 * Future API integration points are marked with TODO comments.
 */

import { Router, type IRouter } from "express";
import { fetchPVWatts } from "../lib/pvwatts";
import {
  runProposalCalc,
  verifyTestScenario,
  STATE_PSH,
  DEFAULT_PEAK_SUN_HOURS,
  DEFAULT_PANEL_W,
  EFFICIENCY_FACTOR,
} from "../lib/proposal-calculator";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Input parsing ────────────────────────────────────────────────────────────

interface EstimateInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  annualKwh?: number | null;
  monthlyKwh?: number | null;
  panelWattage?: number;
  efficiencyFactor?: number;
  // TODO: future inputs — roofAzimuth, roofPitch, shading, utilityRate, financeType
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

  return {
    ok: true,
    data: {
      address: b["address"] as string,
      city: b["city"] as string,
      state: (b["state"] as string).toUpperCase(),
      zip: b["zip"] as string,
      annualKwh: typeof b["annualKwh"] === "number" ? b["annualKwh"] : null,
      monthlyKwh: typeof b["monthlyKwh"] === "number" ? b["monthlyKwh"] : null,
      panelWattage: typeof b["panelWattage"] === "number" ? b["panelWattage"] : DEFAULT_PANEL_W,
      efficiencyFactor: typeof b["efficiencyFactor"] === "number" ? b["efficiencyFactor"] : EFFICIENCY_FACTOR,
    },
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/proposals/estimate", async (req, res): Promise<void> => {
  const parsed = parseInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const input = parsed.data;
  const panelW = input.panelWattage ?? DEFAULT_PANEL_W;
  const eff = input.efficiencyFactor ?? EFFICIENCY_FACTOR;

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
    // TODO: swap fetchPVWatts for Aurora Solar or OpenSolar irradiance API here
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

  // ── Run core calculation using extracted utility functions ──────────────
  const calc = runProposalCalc(annualKwh, psh, eff, panelW);

  // ── Scale PVWatts monthly output to actual final system size ────────────
  // PVWatts was called at 5 kW reference; scale linearly to actual system kW.
  let scaledMonthlyKwh: number[] | null = null;
  if (pvwattsMonthlyKwh && pvwattsAnnualAt5kw && pvwattsAnnualAt5kw > 0) {
    const scale = calc.finalSystemKw / 5;
    scaledMonthlyKwh = pvwattsMonthlyKwh.map((v) => Math.round(v * scale));
  }

  // ── Spec verification (for test/demo panel) ─────────────────────────────
  // Runs the same formulas with spec-assumed PSH (5.5) so the UI can show
  // expected numbers from the spec alongside the real PVWatts results.
  const specVerification = verifyTestScenario();

  // TODO: Future enrichment hooks:
  //   - Utility rate lookup → estimatedSavingsPerYear
  //   - Financing API → monthly payment estimate
  //   - Permit/AHJ lookup → permitFee, setbackRequirements
  //   - CRM auto-create lead → leadId

  res.json({
    // ── Input echo ────────────────────────────────────────────────────────
    address: input.address,
    city: input.city,
    state: input.state,
    zip: input.zip,
    annualKwhUsage: Math.round(annualKwh),
    monthlyKwhUsage: Math.round(annualKwh / 12),

    // ── Irradiance ────────────────────────────────────────────────────────
    peakSunHours: Math.round(psh * 100) / 100,
    peakSunHoursSource: pshSource,   // "pvwatts" | "state" | "default"

    // ── System sizing (from proposal-calculator.ts) ───────────────────────
    panelWattage: panelW,
    efficiencyFactor: eff,
    requiredSystemKw: calc.requiredSystemKw,   // before rounding to whole panels
    panelCount: calc.panelCount,
    finalSystemKw: calc.finalSystemKw,         // after rounding

    // ── Production ────────────────────────────────────────────────────────
    estimatedAnnualKwh: calc.estimatedAnnualKwh,
    estimatedMonthlyKwh: calc.estimatedMonthlyKwh,
    offsetPct: calc.offsetPct,

    // ── Monthly breakdown (PVWatts-scaled to actual system size) ──────────
    monthlyProductionKwh: scaledMonthlyKwh,

    // ── Battery recommendation (v2 spec rule: >12k → 20 kWh, else → 10 kWh)
    battery: {
      recommendedKwh: calc.battery.kwh,
      rule: calc.battery.rule,
      reason: calc.battery.reason,
      chemistry: "LiFePO4",
      depthOfDischarge: 0.8,
    },

    // ── Test/spec verification numbers (spec §9 with 5.5 PSH) ────────────
    specVerification: {
      psh: 5.5,
      pass: specVerification.pass,
      requiredSystemKw: specVerification.requiredSystemKw,
      panelCount: specVerification.panelCount,
      finalSystemKw: specVerification.finalSystemKw,
      estimatedAnnualKwh: specVerification.estimatedAnnualKwh,
      estimatedMonthlyKwh: specVerification.estimatedMonthlyKwh,
      offsetPct: specVerification.offsetPct,
      batteryKwh: specVerification.battery.kwh,
    },

    // ── Disclaimer ────────────────────────────────────────────────────────
    notes: [
      "This estimate is for preliminary planning only and should not be used for contract or permit purposes.",
      "Final design requires on-site roof measurements, shading analysis, utility bill review, and electrical panel inspection.",
      "System size may change after engineering review, local code compliance, and utility interconnection requirements.",
      "Battery recommendation is based on annual usage; actual backup time depends on which loads are connected.",
      "Production estimates assume a south-facing roof at 20° tilt with standard losses. Results vary with roof orientation and shading.",
    ],
  });
});

export default router;
