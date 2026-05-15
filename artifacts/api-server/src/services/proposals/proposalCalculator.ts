/**
 * Proposal Calculator — equipment catalogs and sizing calculation utilities.
 *
 * Covers the major solar panel and battery chemistry types available in 2024/2025.
 * All chemistry-specific parameters (DoD, RTE, cycle life) use conservative
 * industry-standard values. Real product specs vary — these are reliable defaults
 * for preliminary estimates and should be refined during final system design.
 *
 * Formulas:
 *   Required Size (kW) = Annual kWh ÷ (PSH × 365 × AC derate)
 *   Panel Count        = ceil(Required kW × 1000 ÷ panel wattage)
 *   Final Size (kW)    = Panel Count × panel wattage ÷ 1000
 *   Annual Production  = Final Size × PSH × 365 × AC derate
 *   Battery Usable     = max(10 kWh, 50% of average daily use)
 *   Battery Total      = Usable kWh ÷ (DoD% ÷ 100)
 */

// ─── Core constants ───────────────────────────────────────────────────────────

export const EFFICIENCY_FACTOR = 0.86;     // AC derate: PVWatts default-style 14% total losses
export const DAYS_PER_YEAR = 365;
export const DEFAULT_PEAK_SUN_HOURS = 4.7; // national fallback when state is unknown

// State-level peak sun hour estimates (annual average, optimally-tilted surface)
// Source: NREL PVWatts state averages. Overridden at runtime by live PVWatts data.
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

// ─── Panel Catalog ────────────────────────────────────────────────────────────

export type CostTier = "budget" | "standard" | "premium" | "ultra_premium";

export interface PanelSpec {
  label: string;
  wattage: number;           // STC rated power, watts
  efficiencyPct: number;     // STC module efficiency, %
  tempCoeffPct: number;      // Power loss per °C above STC 25°C (negative, e.g. -0.35)
  bifacial: boolean;         // Captures reflected light from rear surface
  bifacialGainPct: number;   // Typical rear-side gain % (0 for monofacial panels)
  costTier: CostTier;
  description: string;
}

/**
 * Solar panel type catalog.
 *
 * Wattages reflect common residential-grade modules (2024/2025 market):
 *   - Standard rooftop modules: 340–490 W
 *   - High-power / commercial modules: 500–600 W
 *   - Bifacial gain applied to effective production, not STC nameplate rating
 *
 * Future: pull live specs from Aurora Solar or manufacturer APIs.
 */
export const PANEL_CATALOG: Record<string, PanelSpec> = {
  poly: {
    label: "Polycrystalline (Standard)",
    wattage: 340,
    efficiencyPct: 17.0,
    tempCoeffPct: -0.40,
    bifacial: false,
    bifacialGainPct: 0,
    costTier: "budget",
    description:
      "Older multi-crystal technology. Lower cost per watt, good for large unshaded roofs where space is not a concern. Best for budget-conscious projects.",
  },
  mono_perc: {
    label: "Monocrystalline PERC",
    wattage: 415,
    efficiencyPct: 21.0,
    tempCoeffPct: -0.35,
    bifacial: false,
    bifacialGainPct: 0,
    costTier: "standard",
    description:
      "The most popular residential panel today. Single-crystal silicon with PERC cell technology delivers excellent efficiency and value for most homes.",
  },
  bifacial: {
    label: "Bifacial Mono PERC",
    wattage: 450,
    efficiencyPct: 22.0,
    tempCoeffPct: -0.35,
    bifacial: true,
    bifacialGainPct: 10,
    costTier: "premium",
    description:
      "Front and rear surfaces both generate power. Best on light-colored roofs, carports, and ground mounts where reflected light reaches the back of the panel. ~10% bonus production.",
  },
  topcon: {
    label: "TOPCon N-Type",
    wattage: 480,
    efficiencyPct: 22.5,
    tempCoeffPct: -0.30,
    bifacial: true,
    bifacialGainPct: 12,
    costTier: "premium",
    description:
      "Latest N-type silicon technology. Lower temperature coefficient means less output drop on hot days. Better morning, evening, and overcast performance than PERC.",
  },
  hjt: {
    label: "HJT Heterojunction",
    wattage: 490,
    efficiencyPct: 23.5,
    tempCoeffPct: -0.24,
    bifacial: true,
    bifacialGainPct: 15,
    costTier: "ultra_premium",
    description:
      "Highest residential efficiency available. Exceptional low-temperature-coefficient makes it ideal for hot climates. Best choice when roof space is very limited.",
  },
  high_power: {
    label: "High-Power Commercial (500–600 W)",
    wattage: 555,
    efficiencyPct: 21.5,
    tempCoeffPct: -0.35,
    bifacial: true,
    bifacialGainPct: 8,
    costTier: "standard",
    description:
      "Large-format panels (72-cell or 144 half-cell). Fewer panels needed for the same kW. Common in commercial rooftops, large residential, and ground-mount arrays.",
  },
};

export const DEFAULT_PANEL_TYPE = "mono_perc";
export const DEFAULT_PANEL_W = PANEL_CATALOG[DEFAULT_PANEL_TYPE]!.wattage; // 415W

// ─── Battery Catalog ──────────────────────────────────────────────────────────

export interface BatterySpec {
  label: string;
  chemistry: string;
  dodPct: number;                  // Maximum recommended depth of discharge (%)
  roundTripEffPct: number;         // AC-to-AC round-trip efficiency (%)
  selfDischargePerMonthPct: number; // Capacity lost per month while idle (%)
  estimatedCycleLife: number;      // Discharge cycles at rated DoD before 80% capacity remains
  maintenanceRequired: boolean;    // Requires periodic water topping / equalization
  requiresVentilation: boolean;    // Must NOT be installed in sealed enclosures
  safetyNotes: string | null;      // null = no special warning
  costTier: "budget" | "standard" | "premium";
  description: string;
}

/**
 * Battery chemistry catalog.
 *
 * Lead-acid types (AGM, Gel, Flooded) have significantly lower DoD than lithium —
 * a 200 Ah 12V (2.4 kWh) AGM bank only delivers 1.2 kWh usably.
 * This is why total capacity calculations must always account for DoD.
 *
 * DoD reference (conservative industry recommendations):
 *   LiFePO4 / NMC  → 80% DoD (20% reserve)
 *   Gel             → 60% DoD (40% reserve)
 *   AGM / Flooded   → 50% DoD (50% reserve)
 *
 * Temperature note: Lead-acid batteries lose 1% capacity per °C below 25°C.
 *   At 0°C → ~25% capacity loss. At -20°C → ~50% capacity loss.
 *   Cold-climate installs should derate or heat the battery bank.
 */
export const BATTERY_CATALOG: Record<string, BatterySpec> = {
  lifepo4: {
    label: "LiFePO4 (Lithium Iron Phosphate)",
    chemistry: "Lithium Iron Phosphate",
    dodPct: 80,
    roundTripEffPct: 95,
    selfDischargePerMonthPct: 2,
    estimatedCycleLife: 4000,
    maintenanceRequired: false,
    requiresVentilation: false,
    safetyNotes: null,
    costTier: "premium",
    description:
      "The safest lithium chemistry — no thermal runaway risk. Long cycle life, zero maintenance, no ventilation required. Best long-term value for most residential systems.",
  },
  nmc: {
    label: "NMC Lithium (Powerwall-style)",
    chemistry: "Lithium Nickel Manganese Cobalt",
    dodPct: 80,
    roundTripEffPct: 97,
    selfDischargePerMonthPct: 1,
    estimatedCycleLife: 4000,
    maintenanceRequired: false,
    requiresVentilation: false,
    safetyNotes:
      "Requires active thermal management (BMS). Install per manufacturer's temperature and clearance specifications. Avoid installation in high-heat locations.",
    costTier: "premium",
    description:
      "Higher energy density than LiFePO4 — more kWh per cubic foot. Used in Tesla Powerwall and similar products. Excellent round-trip efficiency. Best for space-constrained installs.",
  },
  agm: {
    label: "AGM Lead-Acid",
    chemistry: "Absorbent Glass Mat (Lead-Acid)",
    dodPct: 50,
    roundTripEffPct: 82,
    selfDischargePerMonthPct: 3,
    estimatedCycleLife: 600,
    maintenanceRequired: false,
    requiresVentilation: true,
    safetyNotes:
      "Must be installed in a vented location. Do not discharge below 50% DoD. Use AGM-compatible charge controller (do not use flooded or gel charge profiles).",
    costTier: "budget",
    description:
      "Sealed, valve-regulated lead-acid. No water topping required. Good entry-level option for smaller off-grid systems with tighter budgets. Note the 50% DoD limit — the battery bank must be twice the usable capacity.",
  },
  gel: {
    label: "Gel Lead-Acid",
    chemistry: "Gel Electrolyte (Lead-Acid)",
    dodPct: 60,
    roundTripEffPct: 85,
    selfDischargePerMonthPct: 2,
    estimatedCycleLife: 800,
    maintenanceRequired: false,
    requiresVentilation: true,
    safetyNotes:
      "⚠ Overcharging permanently destroys gel cells. You MUST use a gel-compatible charge controller with the correct voltage profile (max 14.1V for 12V bank). Incompatible chargers will ruin the battery.",
    costTier: "budget",
    description:
      "Better high-temperature performance than AGM — good for hot climates like desert Southwest. Sealed. Requires a dedicated gel-compatible charge controller.",
  },
  flooded: {
    label: "Flooded Lead-Acid (FLA)",
    chemistry: "Flooded Lead-Acid",
    dodPct: 50,
    roundTripEffPct: 80,
    selfDischargePerMonthPct: 5,
    estimatedCycleLife: 500,
    maintenanceRequired: true,
    requiresVentilation: true,
    safetyNotes:
      "⚠ Produces hydrogen gas during charging — MUST be installed in a well-vented, non-enclosed space away from all ignition sources. Requires monthly distilled water topping and regular equalization charging (high-voltage charge cycle).",
    costTier: "budget",
    description:
      "Lowest upfront cost per kWh. Proven, robust technology. Requires significant maintenance. Not suitable for enclosed spaces, homes, or RVs without proper ventilation. Best for remote off-grid cabins or outbuildings where maintenance is acceptable.",
  },
};

export const DEFAULT_BATTERY_TYPE = "lifepo4";

// ─── Core formula functions ────────────────────────────────────────────────────

/**
 * Required DC array size (kW) before rounding to whole panels.
 *
 * Formula:
 *   requiredDcKw = annualLoadKwh ÷ (peakSunHours × 365 × acDerate)
 *
 * acDerate defaults to 0.86, matching a common residential PVWatts-style loss
 * stack near 14% total losses (inverter, wiring, soiling, mismatch, temperature).
 */
export function calcRequiredSystemKw(
  annualKwh: number,
  psh: number,
  efficiency: number = EFFICIENCY_FACTOR,
): number {
  return annualKwh / (psh * DAYS_PER_YEAR * efficiency);
}

/**
 * Panel count — rounds UP so production meets or exceeds load.
 * Formula: ceil(requiredKw × 1000 ÷ panelW)
 */
export function calcPanelCount(requiredKw: number, panelW: number): number {
  return Math.ceil((requiredKw * 1000) / panelW);
}

/**
 * Final system size (kW) after rounding to whole panels.
 * Formula: panelCount × panelW ÷ 1000
 */
export function calcFinalSystemKw(panelCount: number, panelW: number): number {
  return (panelCount * panelW) / 1000;
}

/**
 * Estimated annual AC production (kWh/yr).
 *
 * Formula:
 *   annualAcKwh = finalDcKw × peakSunHours × 365 × acDerate × bifacialMultiplier
 *
 * Bifacial gain is a planning estimate and should be validated against mounting
 * height, ground reflectivity, and rear-side shading before final design.
 */
export function calcAnnualProduction(
  finalKw: number,
  psh: number,
  efficiency: number = EFFICIENCY_FACTOR,
  bifacialGainPct: number = 0,
): number {
  const bifacialMultiplier = 1 + bifacialGainPct / 100;
  return Math.round(finalKw * psh * DAYS_PER_YEAR * efficiency * bifacialMultiplier);
}

// ─── Battery sizing ────────────────────────────────────────────────────────────

export interface BatteryResult extends BatterySpec {
  batteryType: string;
  usableKwh: number;    // Recommended usable energy (kWh)
  totalKwh: number;     // Total rated capacity to achieve usable target at rated DoD
  rule: string;         // Human-readable rule that drove the usable target
}

/**
 * Battery recommendation for the quick proposal.
 *
 * The quick proposal has no detailed backup-load schedule, so it assumes a
 * typical residential backup panel serving essential loads at roughly 50% of
 * the home's average daily energy. A 10 kWh minimum keeps the recommendation in
 * the range of a real single-home battery product instead of suggesting tiny
 * banks that would not carry normal overnight loads.
 *
 * Formula:
 *   averageDailyKwh = annualKwh ÷ 365
 *   usableKwh       = max(10, averageDailyKwh × 0.50)
 *   totalKwh        = usableKwh ÷ (DoD% ÷ 100)
 *
 * Detailed off-grid/autonomy sizing lives in the full project calculation
 * engine, where backup hours and chemistry-specific DoD are known.
 */
export function calcBatteryRecommendation(
  annualKwh: number,
  batteryTypeKey: string = DEFAULT_BATTERY_TYPE,
): BatteryResult {
  const spec = BATTERY_CATALOG[batteryTypeKey] ?? BATTERY_CATALOG[DEFAULT_BATTERY_TYPE]!;
  const averageDailyKwh = annualKwh / DAYS_PER_YEAR;
  const usableKwh = Math.round(Math.max(10, averageDailyKwh * 0.5) * 10) / 10;
  const rule = "Essential-load backup estimate: max(10 kWh, 50% of average daily use)";

  // Total rated capacity needed to provide usableKwh at this battery's DoD
  const totalKwh = Math.round((usableKwh / (spec.dodPct / 100)) * 10) / 10;

  return {
    batteryType: batteryTypeKey,
    ...spec,
    usableKwh,
    totalKwh,
    rule,
  };
}

// ─── Full proposal calculation ─────────────────────────────────────────────────

export interface ProposalCalc {
  annualKwh: number;
  psh: number;
  efficiency: number;
  panel: PanelSpec & { panelType: string };
  panelCount: number;
  requiredSystemKw: number;   // Before rounding to whole panels
  finalSystemKw: number;      // After rounding
  estimatedAnnualKwh: number;
  estimatedMonthlyKwh: number;
  offsetPct: number;
  battery: BatteryResult;
}

/**
 * Run all proposal formulas in one call.
 * Returns rounded display values suitable for the proposal output card.
 */
export function runProposalCalc(
  annualKwh: number,
  psh: number,
  efficiency: number = EFFICIENCY_FACTOR,
  panelTypeKey: string = DEFAULT_PANEL_TYPE,
  batteryTypeKey: string = DEFAULT_BATTERY_TYPE,
): ProposalCalc {
  const panelSpec = PANEL_CATALOG[panelTypeKey] ?? PANEL_CATALOG[DEFAULT_PANEL_TYPE]!;
  const panel = { ...panelSpec, panelType: panelTypeKey };

  const requiredKwRaw = calcRequiredSystemKw(annualKwh, psh, efficiency);
  const panelCount = calcPanelCount(requiredKwRaw, panel.wattage);
  const finalSystemKw = calcFinalSystemKw(panelCount, panel.wattage);
  const estimatedAnnualKwh = calcAnnualProduction(finalSystemKw, psh, efficiency, panel.bifacialGainPct);
  const estimatedMonthlyKwh = Math.round(estimatedAnnualKwh / 12);
  const offsetPct = Math.round((estimatedAnnualKwh / annualKwh) * 100);
  const battery = calcBatteryRecommendation(annualKwh, batteryTypeKey);

  return {
    annualKwh,
    psh,
    efficiency,
    panel,
    panelCount,
    requiredSystemKw: Math.round(requiredKwRaw * 100) / 100,
    finalSystemKw: Math.round(finalSystemKw * 100) / 100,
    estimatedAnnualKwh,
    estimatedMonthlyKwh,
    offsetPct,
    battery,
  };
}

// ─── Spec test scenario ────────────────────────────────────────────────────────

/**
 * TEST SCENARIO — run with explicit 440W/5.5PSH formula inputs.
 * Note: spec was written assuming 440W panels. None of our catalog types is 440W,
 * so verification uses the raw formula functions directly.
 *
 * Expected:
 *   Required  ≈ 6.95 kW    Panels  = 16
 *   Final     ≈ 7.04 kW    Annual  ≈ 12,154 kWh
 *   Monthly   ≈ 1,013 kWh  Offset  ≈ 101%
 *   Battery   ≈ 16.4 kWh usable
 */
export const TEST_SCENARIO = {
  address: "7408 Mamba Ct",
  city: "Rancho Murieta",
  state: "CA",
  zip: "95683",
  annualKwh: 12000,
  psh: 5.5,
  efficiency: EFFICIENCY_FACTOR,
  panelW: 440, // spec value — not in catalog
  expected: {
    requiredSystemKw: 6.95,
    panelCount: 16,
    finalSystemKw: 7.04,
    estimatedAnnualKwh: 12154,
    estimatedMonthlyKwh: 1013,
    offsetPct: 101,
    batteryUsableKwh: 16.4,
  },
} as const;

export interface SpecVerification {
  pass: boolean;
  psh: number;
  panelW: number;
  requiredSystemKw: number;
  panelCount: number;
  finalSystemKw: number;
  estimatedAnnualKwh: number;
  estimatedMonthlyKwh: number;
  offsetPct: number;
  batteryUsableKwh: number;
  batteryTotalKwh: number;
}

export function verifyTestScenario(): SpecVerification {
  const { annualKwh, psh, efficiency, panelW, expected } = TEST_SCENARIO;
  const requiredKwRaw = calcRequiredSystemKw(annualKwh, psh, efficiency);
  const panelCount = calcPanelCount(requiredKwRaw, panelW);
  const finalSystemKw = calcFinalSystemKw(panelCount, panelW);
  const estimatedAnnualKwh = calcAnnualProduction(finalSystemKw, psh, efficiency, 0);
  const estimatedMonthlyKwh = Math.round(estimatedAnnualKwh / 12);
  const offsetPct = Math.round((estimatedAnnualKwh / annualKwh) * 100);
  const battery = calcBatteryRecommendation(annualKwh, DEFAULT_BATTERY_TYPE);

  const requiredSystemKw = Math.round(requiredKwRaw * 100) / 100;

  const pass =
    Math.abs(requiredSystemKw - expected.requiredSystemKw) < 0.1 &&
    panelCount === expected.panelCount &&
    Math.abs(finalSystemKw - expected.finalSystemKw) < 0.05 &&
    Math.abs(estimatedAnnualKwh - expected.estimatedAnnualKwh) < 50 &&
    battery.usableKwh === expected.batteryUsableKwh;

  return {
    pass,
    psh,
    panelW,
    requiredSystemKw,
    panelCount,
    finalSystemKw: Math.round(finalSystemKw * 100) / 100,
    estimatedAnnualKwh,
    estimatedMonthlyKwh,
    offsetPct,
    batteryUsableKwh: battery.usableKwh,
    batteryTotalKwh: battery.totalKwh,
  };
}
