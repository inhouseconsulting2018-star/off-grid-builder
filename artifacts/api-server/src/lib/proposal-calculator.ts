/**
 * Proposal Calculator — pure calculation utilities for Quick Proposal estimates.
 *
 * All functions are stateless and can be unit-tested independently.
 * Import and call these from route handlers — never add side effects here.
 *
 * Formulas match the v2 spec exactly:
 *   Annual Production  = System Size kW × PSH × 365 × 0.78
 *   Required Size      = Annual Usage ÷ (PSH × 365 × 0.78)
 *   Panel Count        = ceil(Required kW × 1000 ÷ panelW)
 *   Final System Size  = Panel Count × panelW ÷ 1000
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_PANEL_W = 440;       // watts per panel (spec default)
export const EFFICIENCY_FACTOR = 0.78;   // system efficiency including inverter, wire, temp losses
export const DAYS_PER_YEAR = 365;
export const DEFAULT_PEAK_SUN_HOURS = 5.5; // California/national default fallback

// State-level peak sun hour estimates (used when PVWatts API unavailable)
export const STATE_PSH: Record<string, number> = {
  AK: 3.5, AL: 5.0, AR: 5.0, AZ: 6.5, CA: 5.8, CO: 5.7,
  CT: 4.5, DE: 4.6, FL: 5.3, GA: 5.2, HI: 5.8, IA: 4.6,
  ID: 5.0, IL: 4.5, IN: 4.5, KS: 5.0, KY: 4.5, LA: 5.2,
  MA: 4.5, MD: 4.7, ME: 4.4, MI: 4.3, MN: 4.5, MO: 4.7,
  MS: 5.1, MT: 5.2, NC: 5.0, ND: 4.8, NE: 5.0, NH: 4.5,
  NJ: 4.6, NM: 6.3, NV: 6.4, NY: 4.5, OH: 4.4, OK: 5.2,
  OR: 4.5, PA: 4.6, RI: 4.5, SC: 5.1, SD: 5.0, TN: 5.0,
  TX: 5.5, UT: 5.6, VA: 4.8, VT: 4.4, WA: 4.0, WI: 4.4,
  WV: 4.5, WY: 5.5,
};

// ─── Individual formula functions ─────────────────────────────────────────────

/**
 * Required system size (kW) before rounding to whole panels.
 * Formula: annualKwh ÷ (PSH × DAYS × efficiency)
 */
export function calcRequiredSystemKw(
  annualKwh: number,
  psh: number,
  efficiency: number = EFFICIENCY_FACTOR,
): number {
  return annualKwh / (psh * DAYS_PER_YEAR * efficiency);
}

/**
 * Panel count — always rounds UP so production meets or exceeds usage.
 * Formula: ceil(requiredKw × 1000 ÷ panelW)
 */
export function calcPanelCount(requiredKw: number, panelW: number = DEFAULT_PANEL_W): number {
  return Math.ceil((requiredKw * 1000) / panelW);
}

/**
 * Final system size (kW) after rounding to whole panels.
 * Formula: panelCount × panelW ÷ 1000
 */
export function calcFinalSystemKw(panelCount: number, panelW: number = DEFAULT_PANEL_W): number {
  return (panelCount * panelW) / 1000;
}

/**
 * Estimated annual AC production (kWh/yr).
 * Formula: finalKw × PSH × DAYS × efficiency
 */
export function calcAnnualProduction(
  finalKw: number,
  psh: number,
  efficiency: number = EFFICIENCY_FACTOR,
): number {
  return Math.round(finalKw * psh * DAYS_PER_YEAR * efficiency);
}

/**
 * Battery storage recommendation — v2 spec rule:
 *   ≥ 12,000 kWh/yr  →  20 kWh battery
 *   < 12,000 kWh/yr  →  10 kWh battery
 */
export function calcBatteryRecommendation(annualKwh: number): {
  kwh: 10 | 20;
  rule: string;
  reason: string;
} {
  if (annualKwh >= 12000) {
    return {
      kwh: 20,
      rule: "Annual usage ≥ 12,000 kWh → 20 kWh recommended",
      reason:
        "High-usage home. A 20 kWh LiFePO4 battery provides meaningful backup for essential loads during an outage.",
    };
  }
  return {
    kwh: 10,
    rule: "Annual usage ≤ 12,000 kWh → 10 kWh recommended",
    reason:
      "Standard home usage. A 10 kWh LiFePO4 battery handles essential loads overnight and during short outages.",
  };
}

// ─── Full proposal calculation ────────────────────────────────────────────────

export interface ProposalCalc {
  annualKwh: number;
  psh: number;
  efficiency: number;
  panelW: number;
  requiredSystemKw: number;   // raw, before rounding
  panelCount: number;
  finalSystemKw: number;      // after rounding to whole panels
  estimatedAnnualKwh: number;
  estimatedMonthlyKwh: number;
  offsetPct: number;
  battery: ReturnType<typeof calcBatteryRecommendation>;
}

/**
 * Run all proposal formulas in one call.
 * Returns rounded display values suitable for the proposal output.
 */
export function runProposalCalc(
  annualKwh: number,
  psh: number,
  efficiency: number = EFFICIENCY_FACTOR,
  panelW: number = DEFAULT_PANEL_W,
): ProposalCalc {
  const requiredSystemKwRaw = calcRequiredSystemKw(annualKwh, psh, efficiency);
  const panelCount = calcPanelCount(requiredSystemKwRaw, panelW);
  const finalSystemKw = calcFinalSystemKw(panelCount, panelW);
  const estimatedAnnualKwh = calcAnnualProduction(finalSystemKw, psh, efficiency);
  const estimatedMonthlyKwh = Math.round(estimatedAnnualKwh / 12);
  const offsetPct = Math.round((estimatedAnnualKwh / annualKwh) * 100);
  const battery = calcBatteryRecommendation(annualKwh);

  return {
    annualKwh,
    psh,
    efficiency,
    panelW,
    requiredSystemKw: Math.round(requiredSystemKwRaw * 100) / 100,
    panelCount,
    finalSystemKw: Math.round(finalSystemKw * 100) / 100,
    estimatedAnnualKwh,
    estimatedMonthlyKwh,
    offsetPct,
    battery,
  };
}

// ─── Test / Spec verification ─────────────────────────────────────────────────

/**
 * TEST SCENARIO (v2 spec §9):
 *   Address:   7408 Mamba Ct, Rancho Murieta, CA 95683
 *   Usage:     12,000 kWh/yr
 *   PSH:       5.5 (spec assumed value — PVWatts may differ)
 *   Efficiency: 0.78
 *   Panel W:   440W
 *
 * Expected results:
 *   Required  ≈ 7.66 kW
 *   Panels    = 18
 *   Final     ≈ 7.92 kW
 *   Annual    ≈ 12,407 kWh
 *   Monthly   ≈ 1,034 kWh
 *   Offset    ≈ 103%
 *   Battery   = 20 kWh (usage > 12,000)
 */
export const TEST_SCENARIO = {
  address: "7408 Mamba Ct",
  city: "Rancho Murieta",
  state: "CA",
  zip: "95683",
  annualKwh: 12000,
  psh: 5.5,
  efficiency: EFFICIENCY_FACTOR,
  panelW: DEFAULT_PANEL_W,
  expected: {
    requiredSystemKw: 7.66,
    panelCount: 18,
    finalSystemKw: 7.92,
    estimatedAnnualKwh: 12407,
    estimatedMonthlyKwh: 1034,
    offsetPct: 103,
    batteryKwh: 20,
  },
} as const;

/**
 * Run the spec test scenario and return whether results match expected values.
 * Used in the proposal output "Formula Verification" panel.
 */
export function verifyTestScenario(): ProposalCalc & { pass: boolean } {
  const calc = runProposalCalc(
    TEST_SCENARIO.annualKwh,
    TEST_SCENARIO.psh,
    TEST_SCENARIO.efficiency,
    TEST_SCENARIO.panelW,
  );
  const exp = TEST_SCENARIO.expected;
  const pass =
    Math.abs(calc.requiredSystemKw - exp.requiredSystemKw) < 0.1 &&
    calc.panelCount === exp.panelCount &&
    Math.abs(calc.finalSystemKw - exp.finalSystemKw) < 0.05 &&
    Math.abs(calc.estimatedAnnualKwh - exp.estimatedAnnualKwh) < 50 &&
    calc.battery.kwh === exp.batteryKwh;
  return { ...calc, pass };
}
