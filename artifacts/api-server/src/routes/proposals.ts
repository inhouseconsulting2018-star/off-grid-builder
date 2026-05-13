import { Router, type IRouter } from "express";
import { fetchPVWatts } from "../lib/pvwatts";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Constants matching the proposal spec ────────────────────────────────────
const DEFAULT_PANEL_W = 440;
const EFFICIENCY_FACTOR = 0.78;
const DAYS_PER_YEAR = 365;
const DEFAULT_PEAK_SUN_HOURS = 5.5;

// State peak sun hours — same table used by solar-calculator.ts
const STATE_PEAK_SUN_HOURS: Record<string, number> = {
  AZ: 6.5, CA: 5.8, NV: 6.4, NM: 6.3, TX: 5.5, FL: 5.3, CO: 5.7,
  UT: 5.6, HI: 5.8, GA: 5.2, SC: 5.1, NC: 5.0, VA: 4.8, MD: 4.7,
  DE: 4.6, NJ: 4.6, NY: 4.5, CT: 4.5, MA: 4.5, RI: 4.5, NH: 4.5,
  VT: 4.4, ME: 4.4, PA: 4.6, OH: 4.4, IN: 4.5, IL: 4.5, MI: 4.3,
  WI: 4.4, MN: 4.5, IA: 4.6, MO: 4.7, KS: 5.0, NE: 5.0, SD: 5.0,
  ND: 4.8, MT: 5.2, ID: 5.0, WY: 5.5, OR: 4.5, WA: 4.0, AK: 3.5,
  AL: 5.0, AR: 5.0, KY: 4.5, LA: 5.2, MS: 5.1, OK: 5.2, TN: 5.0,
  WV: 4.5,
};

interface EstimateInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  annualKwh?: number | null;
  monthlyKwh?: number | null;
  panelWattage?: number;
  efficiencyFactor?: number;
  includeBattery?: boolean;
  batteryBackupHours?: number;
}

function parseInput(body: unknown): { ok: true; data: EstimateInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body required" };
  const b = body as Record<string, unknown>;

  if (typeof b["address"] !== "string" || !b["address"]) return { ok: false, error: "address is required" };
  if (typeof b["city"] !== "string" || !b["city"]) return { ok: false, error: "city is required" };
  if (typeof b["state"] !== "string" || b["state"].length !== 2) return { ok: false, error: "state must be a 2-letter code (e.g. CA)" };
  if (typeof b["zip"] !== "string" || !/^\d{5}$/.test(b["zip"])) return { ok: false, error: "zip must be a 5-digit ZIP code" };

  const hasAnnual = typeof b["annualKwh"] === "number" && (b["annualKwh"] as number) > 0;
  const hasMonthly = typeof b["monthlyKwh"] === "number" && (b["monthlyKwh"] as number) > 0;
  if (!hasAnnual && !hasMonthly) return { ok: false, error: "Provide annualKwh or monthlyKwh" };

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
      includeBattery: b["includeBattery"] === true,
      batteryBackupHours: typeof b["batteryBackupHours"] === "number" ? b["batteryBackupHours"] : 8,
    },
  };
}

/**
 * POST /api/proposals/estimate
 * Stateless quick proposal calculation — no DB write.
 * Accepts address + usage, returns a customer-facing solar estimate.
 */
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
  // Try PVWatts first (real TMY irradiance); fall back to state table, then default.
  let peakSunHours = STATE_PEAK_SUN_HOURS[input.state.toUpperCase()] ?? DEFAULT_PEAK_SUN_HOURS;
  let pvwattsSource: "pvwatts" | "state" | "default" =
    STATE_PEAK_SUN_HOURS[input.state.toUpperCase()] != null ? "state" : "default";
  let pvwattsMonthlyKwh: number[] | null = null;
  let pvwattsAnnualAt5kw: number | null = null;

  try {
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
      peakSunHours = pv.solradAnnual;
      pvwattsSource = "pvwatts";
      pvwattsMonthlyKwh = pv.acMonthly;
      pvwattsAnnualAt5kw = pv.acAnnual;
      logger.info({ peakSunHours, zip: input.zip }, "Proposal: PVWatts irradiance resolved");
    }
  } catch {
    logger.warn({ state: input.state }, "Proposal: PVWatts failed, using state PSH fallback");
  }

  // ── Core formulas (spec §4 and §5) ─────────────────────────────────────
  // Required kW = annualKwh ÷ (PSH × 365 × eff)
  const requiredSystemKw = annualKwh / (peakSunHours * DAYS_PER_YEAR * eff);

  // Panel count: round UP to nearest whole panel
  const panelCount = Math.ceil((requiredSystemKw * 1000) / panelW);

  // Final system size after rounding to whole panels
  const finalSystemKw = (panelCount * panelW) / 1000;

  // Annual production = finalSystemKw × PSH × 365 × eff
  const estimatedAnnualKwh = Math.round(finalSystemKw * peakSunHours * DAYS_PER_YEAR * eff);
  const estimatedMonthlyKwh = Math.round(estimatedAnnualKwh / 12);

  // Offset = production ÷ usage
  const offsetPct = Math.round((estimatedAnnualKwh / annualKwh) * 100);

  // ── Optional battery sizing (LiFePO4, 80% DoD) ─────────────────────────
  let batteryKwh: number | null = null;
  if (input.includeBattery) {
    const dailyKwh = annualKwh / 365;
    const backupHrs = input.batteryBackupHours ?? 8;
    batteryKwh = Math.round((dailyKwh * (backupHrs / 24)) / 0.8 * 10) / 10;
  }

  // ── Scale PVWatts monthly to actual final system size ───────────────────
  // PVWatts was called at 5 kW; scale proportionally to finalSystemKw.
  let scaledMonthlyKwh: number[] | null = null;
  if (pvwattsMonthlyKwh && pvwattsAnnualAt5kw && pvwattsAnnualAt5kw > 0) {
    const sizeScaleFactor = finalSystemKw / 5;
    scaledMonthlyKwh = pvwattsMonthlyKwh.map(v => Math.round(v * sizeScaleFactor));
  }

  res.json({
    // Input echo
    address: input.address,
    city: input.city,
    state: input.state,
    zip: input.zip,
    annualKwhUsage: Math.round(annualKwh),
    monthlyKwhUsage: Math.round(annualKwh / 12),

    // Irradiance
    peakSunHours: Math.round(peakSunHours * 100) / 100,
    peakSunHoursSource: pvwattsSource,

    // System sizing
    panelWattage: panelW,
    efficiencyFactor: eff,
    requiredSystemKw: Math.round(requiredSystemKw * 100) / 100,
    panelCount,
    finalSystemKw: Math.round(finalSystemKw * 100) / 100,

    // Production
    estimatedAnnualKwh,
    estimatedMonthlyKwh,
    offsetPct,

    // Monthly breakdown (PVWatts-scaled, or null)
    monthlyProductionKwh: scaledMonthlyKwh,

    // Battery
    batteryRecommendedKwh: batteryKwh,

    // Standard disclaimer notes
    notes: [
      "This estimate is based on standard assumptions and should be used for preliminary planning only.",
      "Final design requires on-site roof measurements, shading analysis, utility bill review, and electrical panel inspection.",
      "System size may change after engineering review, local code compliance, and utility interconnection requirements.",
      "Battery recommendation assumes LiFePO4 chemistry at 80% depth of discharge.",
    ],
  });
});

export default router;
