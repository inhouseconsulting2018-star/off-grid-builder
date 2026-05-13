import type { Settings } from "@workspace/db";

// ─── State peak sun hours (annual average, optimally-tilted surface) ──────────
// Source: NREL PVWatts state-level averages. PVWatts overrides these at runtime.
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
const DEFAULT_PEAK_SUN_HOURS = 4.7;

// ─── Engineering constants ────────────────────────────────────────────────────

/**
 * Panel-to-panel mismatch and manufacturing tolerance loss (%).
 * Real panels vary ±3-5% from rated power; string mismatch pulls down weakest panel.
 * Industry standard: 1.5–3%. We use 2%.
 */
const MISMATCH_LOSS_PCT = 2.0;

/**
 * Typical panel footprint including racking rails, inter-row spacing, and a
 * 6-inch service clearance. A 400W 60-cell module is roughly 19.5 sqft;
 * add ~15% for framing/clearance → 22–24 sqft. We use 23 sqft.
 */
const SQFT_PER_PANEL = 23;

/**
 * Off-grid array design margin.
 * Off-grid must work during the worst winter month. Winter PSH is typically
 * 60–80% of the annual average. Sizing 15% above the annual-average-derived
 * array covers this production deficit and maintains battery float in winter.
 */
const OFF_GRID_DESIGN_FACTOR = 1.15;

/**
 * Hybrid array design margin.
 * Hybrid grid-tied systems benefit from modest oversizing for resiliency and
 * self-consumption, but the grid covers shortfalls. 8% is appropriate.
 */
const HYBRID_DESIGN_FACTOR = 1.08;

/**
 * Off-grid battery autonomy reserve factor.
 * Battery bank is sized 15% larger than the raw load calculation to provide
 * headroom for partial cloudy days between full-sun recharge cycles.
 */
const OFF_GRID_BATTERY_RESERVE = 1.15;

/**
 * Cold-climate lead-acid / AGM temperature derating.
 * At 0°C, flooded and AGM batteries deliver ~20–30% less capacity than their
 * 25°C rating. We oversize the bank by 25% when snowArea is true and battery
 * chemistry is lead-based.
 */
const COLD_BATTERY_DERATING = 1.25;

/**
 * Standard AC inverter sizes (kW) commonly stocked by distributors.
 * We round the required inverter size up to the next available unit.
 */
const STANDARD_INVERTER_KW = [
  2.5, 3.0, 3.8, 5.0, 5.7, 6.0, 7.6, 8.0,
  10.0, 11.4, 12.0, 15.0, 20.0, 24.0, 30.0, 36.0, 48.0,
];

function nextStandardInverterKw(kw: number): number {
  const found = STANDARD_INVERTER_KW.find(s => s >= kw);
  // For very large systems not in the table, round to nearest 5 kW
  return found ?? Math.ceil(kw / 5) * 5;
}

// ─── Project data interface ───────────────────────────────────────────────────

export interface ProjectData {
  annualKwh: number;
  systemType: string;
  shadeLevel: string;
  backupHours: number;
  customBackupHours?: number | null;
  batteryChemistry?: string | null;
  hasGenerator?: boolean | null;
  generatorKw?: number | null;
  wantsGenerator?: boolean | null;
  highWindArea?: boolean | null;
  snowArea?: boolean | null;
  availableSqft?: number | null;
  budgetTier: string;
  utilityRatePerKwh: number;
  state: string;
  installationType: string;
}

// ─── Main calculation function ────────────────────────────────────────────────

export function runCalculations(project: ProjectData, settings: Settings) {
  const panelW = settings.panelWattage;

  // ── Shade losses (% production reduction) ───────────────────────────────
  // Calibrated to NREL SolarAnywhere shading study categories.
  // none  = clear array, no obstructions
  // light = <10% of daylight hours shaded (nearby trees, one chimney)
  // medium = 10–25% of daylight hours shaded (significant obstruction)
  // heavy = >25% of daylight hours shaded (multi-story building, dense canopy)
  const shadeMap: Record<string, number> = {
    none: 0,
    light: 3,
    medium: 10,
    heavy: 25,
  };
  const shadeLossPct = shadeMap[project.shadeLevel] ?? 0;

  // ── Peak sun hours (state estimate; PVWatts overrides at route level) ────
  const peakSunHours = STATE_PEAK_SUN_HOURS[project.state?.toUpperCase()] ?? DEFAULT_PEAK_SUN_HOURS;

  // ── Battery configuration ─────────────────────────────────────────────────
  // backupHours === 0 → no battery
  // backupHours === -1 → custom hours stored in customBackupHours
  // backupHours > 0 → standard preset
  const hasBattery =
    project.backupHours > 0 ||
    (project.backupHours === -1 && (project.customBackupHours ?? 0) > 0);

  // Battery round-trip loss only applies when energy flows through the battery
  const batteryLossPct = hasBattery ? settings.batteryRoundTripLossPct : 0;

  // Chemistry-specific depth of discharge (DoD %)
  // LiFePO4 tolerates 80% DoD routinely; lead-based chemistries degrade faster
  // beyond 50% DoD so we limit them to preserve cycle life.
  const chemistryDodMap: Record<string, number> = {
    lifepo4: 80,
    agm: 50,
    "lead-acid": 50,
    none: 80,
  };
  const effectiveDod = hasBattery
    ? (chemistryDodMap[project.batteryChemistry ?? "lifepo4"] ?? settings.batteryDod)
    : settings.batteryDod;

  // ── System loss model ─────────────────────────────────────────────────────
  // Losses are additive for design purposes (multiplicative chain differs by
  // <2% at typical loss levels, acceptable for sizing estimates).
  //
  // DC-side losses (before inverter):
  //   shade, temperature, soiling, panel mismatch
  // AC-side losses (after inverter):
  //   inverter conversion, wiring resistance
  // Storage losses (when energy cycles through battery):
  //   battery round-trip efficiency
  const totalSystemLossPct =
    settings.inverterLossPct +  // DC→AC conversion, typically 4–6%
    settings.wireLossPct +       // Conductor resistance, typically 2–3%
    shadeLossPct +               // Obstruction shading
    settings.tempLossPct +       // Temperature coefficient (hot panels produce less)
    settings.dirtLossPct +       // Soiling — dust, pollen, bird droppings
    MISMATCH_LOSS_PCT +          // String mismatch and manufacturing tolerance
    batteryLossPct;              // Battery charge/discharge round-trip

  const lossMultiplier = 1 - totalSystemLossPct / 100;

  // ── Daily demand ────────────────────────────────────────────────────────
  const dailyKwh = project.annualKwh / 365;

  // ── Array sizing ─────────────────────────────────────────────────────────
  // Gross array: DC kW required to deliver daily demand at 100% efficiency
  const arraySizeKw = dailyKwh / peakSunHours;

  // Design factor:
  //   Off-grid — size 15% larger to handle winter production deficit and
  //               maintain battery float without a grid backup.
  //   Hybrid   — size 8% larger for resiliency and self-consumption.
  //   Grid-tied — no extra margin; grid covers shortfalls.
  const offGridDesignFactor =
    project.systemType === "off-grid"
      ? OFF_GRID_DESIGN_FACTOR
      : project.systemType === "hybrid"
      ? HYBRID_DESIGN_FACTOR
      : 1.0;

  // Adjusted array: oversized to compensate for losses and design margin
  const adjustedArraySizeKw = (arraySizeKw / lossMultiplier) * offGridDesignFactor;

  // ── Panel count and footprint ────────────────────────────────────────────
  const numPanels = Math.ceil((adjustedArraySizeKw * 1000) / panelW);
  const squareFeetRequired = numPanels * SQFT_PER_PANEL;

  // ── Inverter sizing ───────────────────────────────────────────────────────
  // Grid-tied: inverter sized 1:1 to DC array (DC:AC ≈ 1.05).
  //   String inverters match the array closely; microinverters track each panel.
  //   A slight 5% oversize allows real-world DC clipping headroom.
  //
  // Off-grid / hybrid: sized for peak AC surge loads, not array output.
  //   Must handle motor starts (2–6× nameplate), water pumps, compressors.
  //   Rule of thumb: 1.25× adjusted array size, minimum 3.0 kW.
  //   Result is rounded UP to the next standard unit stocked by distributors.
  let targetInverterKw: number;
  if (project.systemType === "grid-tied") {
    targetInverterKw = adjustedArraySizeKw * 1.05;
  } else {
    targetInverterKw = Math.max(adjustedArraySizeKw * 1.25, 3.0);
  }
  const inverterSizeKw = nextStandardInverterKw(targetInverterKw);

  // ── Battery bank sizing ───────────────────────────────────────────────────
  // Resolve actual backup hours (handles the -1 "custom" sentinel)
  const backupHrs =
    project.backupHours === -1 &&
    project.customBackupHours != null &&
    project.customBackupHours > 0
      ? project.customBackupHours
      : Math.max(0, project.backupHours);

  // Usable energy: the fraction of a day's load the battery must supply
  let batteryUsableKwh = hasBattery ? dailyKwh * (backupHrs / 24) : 0;

  // Off-grid reserve: add 15% margin to ride through partial cloudy days
  // without hitting the low-battery cutoff before the next sunny period.
  // Grid-tied and hybrid can draw from the grid instead.
  if (hasBattery && project.systemType === "off-grid") {
    batteryUsableKwh *= OFF_GRID_BATTERY_RESERVE;
  }

  // Raw bank size based on depth of discharge
  let totalBatteryBankKwh = hasBattery
    ? batteryUsableKwh / (effectiveDod / 100)
    : 0;

  // Cold-climate derating for lead-acid and AGM chemistries.
  // These technologies lose 20–30% rated capacity at freezing temperatures.
  // We oversize the bank by 25% to compensate when snowArea is active.
  const isLeadChemistry =
    project.batteryChemistry === "lead-acid" ||
    project.batteryChemistry === "agm";
  const batteryTempDeratingPct =
    hasBattery && project.snowArea && isLeadChemistry ? 25 : 0;
  if (batteryTempDeratingPct > 0) {
    totalBatteryBankKwh *= COLD_BATTERY_DERATING;
  }

  // ── Annual production estimate (state-based fallback) ───────────────────
  // PVWatts replaces this in the route handler with real TMY-simulated data.
  // Math: adjustedArraySizeKw × peakSunHours × 365 × lossMultiplier
  //     = (arraySizeKw / lossMultiplier × designFactor) × PSH × 365 × lossMultiplier
  //     = arraySizeKw × PSH × 365 × designFactor
  //     = dailyKwh × 365 × designFactor = annualKwh × designFactor
  const yearlyProductionKwh = adjustedArraySizeKw * peakSunHours * 365 * lossMultiplier;

  // ── Financial estimates ───────────────────────────────────────────────────
  const utilityRate =
    project.utilityRatePerKwh > 0
      ? project.utilityRatePerKwh
      : settings.defaultUtilityRate;
  const estimatedYearlySavings = yearlyProductionKwh * utilityRate;

  const systemWatts = adjustedArraySizeKw * 1000;

  let diyPerWattLow: number;
  let diyPerWattHigh: number;
  let installedPerWattLow: number;
  let installedPerWattHigh: number;

  if (project.budgetTier === "economy") {
    diyPerWattLow = settings.economyDiyPerWatt * 0.9;
    diyPerWattHigh = settings.economyDiyPerWatt;
    installedPerWattLow = settings.economyInstalledPerWatt * 0.9;
    installedPerWattHigh = settings.economyInstalledPerWatt;
  } else if (project.budgetTier === "premium") {
    diyPerWattLow = settings.premiumDiyPerWatt;
    diyPerWattHigh = settings.premiumDiyPerWatt * 1.1;
    installedPerWattLow = settings.premiumInstalledPerWatt;
    installedPerWattHigh = settings.premiumInstalledPerWatt * 1.1;
  } else if (project.budgetTier === "custom") {
    diyPerWattLow = settings.midRangeDiyPerWatt;
    diyPerWattHigh = settings.midRangeDiyPerWatt * 1.15;
    installedPerWattLow = settings.midRangeInstalledPerWatt;
    installedPerWattHigh = settings.midRangeInstalledPerWatt * 1.15;
  } else {
    // mid-range (default)
    diyPerWattLow = settings.midRangeDiyPerWatt * 0.9;
    diyPerWattHigh = settings.midRangeDiyPerWatt;
    installedPerWattLow = settings.midRangeInstalledPerWatt * 0.9;
    installedPerWattHigh = settings.midRangeInstalledPerWatt;
  }

  // Solar array equipment cost (panels + inverter + racking + BOS wiring)
  const solarArrayDiyCostLow = systemWatts * diyPerWattLow;
  const solarArrayDiyCostHigh = systemWatts * diyPerWattHigh;
  const solarArrayInstalledCostLow = systemWatts * installedPerWattLow;
  const solarArrayInstalledCostHigh = systemWatts * installedPerWattHigh;

  // ── Battery equipment cost ────────────────────────────────────────────────
  // The per-watt rates above cover only panels + inverter + racking.
  // Batteries are priced separately per kWh of total bank capacity.
  // Rates match the BOM helper (bom.ts → batteryCostPerKwh) so both are consistent.
  //
  // Chemistry cost per kWh of total rated bank (2024/2025 US market):
  //   LiFePO4  — economy $400, mid $550, premium $800  (× 1.2 for high bound)
  //   AGM/Gel  — economy $180, mid $230, premium $300  (× 1.2 for high bound)
  //   Lead-acid — economy $100, mid $150, premium $200 (× 1.2 for high bound)
  //
  // Installation labor per kWh added to the installed total only:
  //   Lithium  — $100–$200/kWh (heavy lifting, DC bus wiring, BMS commissioning)
  //   Lead-acid — $60–$120/kWh (less BMS work but ventilation/equalization setup)
  const chem = (project.batteryChemistry ?? "lifepo4").toLowerCase();
  const tier = project.budgetTier ?? "mid-range";

  let batEquipBase: number;
  let batLaborLow: number;
  let batLaborHigh: number;

  if (chem === "agm" || chem === "gel") {
    batEquipBase = tier === "premium" ? 300 : tier === "economy" ? 180 : 230;
    batLaborLow = 75; batLaborHigh = 150;
  } else if (chem === "lead-acid" || chem === "flooded") {
    batEquipBase = tier === "premium" ? 200 : tier === "economy" ? 100 : 150;
    batLaborLow = 60; batLaborHigh = 120;
  } else {
    // lifepo4, nmc, default lithium
    batEquipBase = tier === "premium" ? 800 : tier === "economy" ? 400 : 550;
    batLaborLow = 100; batLaborHigh = 200;
  }

  const batteryDiyCostLow  = hasBattery ? totalBatteryBankKwh * batEquipBase : 0;
  const batteryDiyCostHigh = hasBattery ? totalBatteryBankKwh * batEquipBase * 1.2 : 0;
  const batteryInstalledCostLow  = batteryDiyCostLow  + (hasBattery ? totalBatteryBankKwh * batLaborLow  : 0);
  const batteryInstalledCostHigh = batteryDiyCostHigh + (hasBattery ? totalBatteryBankKwh * batLaborHigh : 0);

  const diyEquipmentCostLow  = solarArrayDiyCostLow  + batteryDiyCostLow;
  const diyEquipmentCostHigh = solarArrayDiyCostHigh + batteryDiyCostHigh;
  const installedCostLow  = solarArrayInstalledCostLow  + batteryInstalledCostLow;
  const installedCostHigh = solarArrayInstalledCostHigh + batteryInstalledCostHigh;

  const paybackYears =
    project.systemType !== "off-grid" && estimatedYearlySavings > 0
      ? (installedCostLow + installedCostHigh) / 2 / estimatedYearlySavings
      : null;

  // ── Equipment recommendations ────────────────────────────────────────────
  const panelBrands: Record<string, string> = {
    economy: "Canadian Solar or Qcells",
    "mid-range": "Qcells or Aptos",
    premium: "REC or Panasonic",
    custom: "Qcells or Aptos",
  };

  const inverterBrands: Record<string, string> = {
    "off-grid": "EG4, Victron, or Sol-Ark",
    hybrid: "Sol-Ark, EG4, or Schneider",
    "grid-tied": "Enphase, SMA, or SolarEdge",
  };

  const batteryBrandsByChemistry: Record<string, Record<string, string>> = {
    lifepo4: {
      economy: "EG4 LiFePower4 or Ampere Time",
      "mid-range": "EG4 PowerPro or Fortress Power",
      premium: "Tesla Powerwall or SimpliPhi",
      custom: "EG4 PowerPro or Fortress Power",
    },
    agm: {
      economy: "Battle Born or Renogy AGM",
      "mid-range": "Trojan or Crown AGM",
      premium: "Discover or Lifeline AGM",
      custom: "Trojan or Crown AGM",
    },
    "lead-acid": {
      economy: "Trojan T-105 or US Battery",
      "mid-range": "Trojan L16 or Crown",
      premium: "Rolls Surrette or Trojan IND",
      custom: "Trojan L16 or Crown",
    },
  };
  const chemKey = project.batteryChemistry ?? "lifepo4";
  const batteryBrands =
    batteryBrandsByChemistry[chemKey] ?? batteryBrandsByChemistry["lifepo4"];

  const mountingBrands: Record<string, string> = {
    roof: "IronRidge or Unirac",
    ground: "IronRidge Ground Mount or Schletter",
    pole: "Tamarack or MT Solar",
    carport: "Commercial Solar Carport Structure",
  };

  // ── Engineering notes ─────────────────────────────────────────────────────
  const notes: string[] = [];

  // Shading
  if (project.shadeLevel === "heavy") {
    notes.push(
      "Heavy shading significantly reduces production — strongly consider microinverters (Enphase) or DC optimizers (SolarEdge) to minimize mismatch losses across the string."
    );
  } else if (project.shadeLevel === "medium") {
    notes.push(
      "Moderate shading detected. Power optimizers or microinverters will improve output by preventing shaded panels from dragging down the whole string."
    );
  }

  // High wind area
  if (project.highWindArea) {
    notes.push(
      "High wind area: verify mounting hardware meets local wind load requirements (UL 2703 listed racking, minimum 90 mph wind rating). Consult a structural engineer for roof mounts."
    );
  }

  // Snow area with lead chemistry
  if (project.snowArea && isLeadChemistry && hasBattery) {
    notes.push(
      `Cold-climate derating applied: ${project.batteryChemistry === "agm" ? "AGM" : "Flooded lead-acid"} batteries lose 20–30% capacity at freezing temperatures. Battery bank sized 25% larger to compensate. Store batteries in a conditioned or insulated enclosure above 32°F when possible.`
    );
  }

  // Off-grid generator guidance
  if (project.systemType === "off-grid" && !project.hasGenerator && !project.wantsGenerator) {
    const autonomyDays = hasBattery ? (batteryUsableKwh / dailyKwh).toFixed(1) : "0";
    notes.push(
      `Off-grid system without a generator. Battery provides approximately ${autonomyDays} day(s) of autonomy. For reliable year-round operation, plan for extended cloudy periods (3–7 days in winter) and consider adding a backup generator.`
    );
  }

  if (project.hasGenerator) {
    const genKw = project.generatorKw ? ` (${project.generatorKw} kW)` : "";
    notes.push(
      `Existing generator${genKw} integrated. Configure your inverter/charger AC input to auto-start when battery SOC drops below 20–30% and auto-stop when charged to 90%. Ensure generator nameplate kW ≥ 50% of inverter continuous output.`
    );
  }

  if (project.wantsGenerator && !project.hasGenerator) {
    const recSize = Math.max(4, Math.ceil(inverterSizeKw * 0.5));
    notes.push(
      `Generator added to design. Recommended size: ${recSize}–${recSize + 2} kW. Propane or diesel preferred for off-grid reliability. Generator must supply at least 50% of inverter capacity (${(inverterSizeKw * 0.5).toFixed(1)} kW) to charge batteries while running essential loads.`
    );
  }

  // Battery chemistry notes
  if (project.batteryChemistry === "agm" || project.batteryChemistry === "lead-acid") {
    notes.push(
      `${project.batteryChemistry === "agm" ? "AGM" : "Flooded lead-acid"} batteries sized to 50% DoD to preserve cycle life (750–1,200 cycles at 50% vs 300–500 cycles at 80%). Keep batteries in a ventilated enclosure and avoid charging above 0°C / 32°F for flooded types.`
    );
  }
  if (project.batteryChemistry === "lead-acid") {
    notes.push(
      "Flooded lead-acid requires monthly equalization charges (15.5 V for 12V bank) and annual electrolyte level checks. Consider upgrading to LiFePO4 for maintenance-free operation and 3–5× more cycle life."
    );
  }

  // Grid-tied no battery
  if (project.systemType === "grid-tied" && !hasBattery) {
    notes.push(
      "Grid-tied without battery storage: system shuts down during utility outages (anti-islanding protection). Add a battery or transfer switch with a backup inverter if outage protection is needed."
    );
  }

  // Large system
  if (adjustedArraySizeKw > 50) {
    notes.push(
      "System over 50 kW — a utility interconnection study, engineering stamp, and additional permitting are typically required. Contact your utility early in the design process."
    );
  }

  // Large battery bank
  if (totalBatteryBankKwh > 40) {
    notes.push(
      "Large battery bank — consider a DC-coupled configuration (batteries on the DC bus) for higher round-trip efficiency vs AC-coupled, and evaluate whether a battery enclosure with thermal management is required."
    );
  }

  // Off-grid with very short backup
  if (project.systemType === "off-grid" && hasBattery && backupHrs < 24) {
    notes.push(
      `Battery autonomy is ${backupHrs}h — less than one full day. Off-grid systems are typically designed for 2–3 days of autonomy to ride through cloudy weather. Consider increasing backup hours or adding a generator.`
    );
  }

  // Panel area check
  if ((project.availableSqft ?? 0) > 0 && squareFeetRequired > (project.availableSqft ?? 0)) {
    notes.push(
      `Roof/mount area may be insufficient: ${numPanels} panels require ~${squareFeetRequired} sqft but only ${project.availableSqft} sqft was entered. Consider higher-wattage panels, a ground/pole mount expansion, or splitting across multiple roof faces.`
    );
  }

  // Off-grid design margin note
  if (project.systemType === "off-grid") {
    notes.push(
      `Off-grid design margin of ${((offGridDesignFactor - 1) * 100).toFixed(0)}% applied to array size to compensate for reduced winter production (shorter days, lower sun angle). This helps maintain battery charge through winter months.`
    );
  }

  return {
    dailyKwh: round2(dailyKwh),
    peakSunHours: round2(peakSunHours),
    arraySizeKw: round2(arraySizeKw),
    numPanels,
    adjustedArraySizeKw: round2(adjustedArraySizeKw),
    inverterSizeKw: round2(inverterSizeKw),
    batteryUsableKwh: round2(batteryUsableKwh),
    totalBatteryBankKwh: round2(totalBatteryBankKwh),
    yearlyProductionKwh: round2(yearlyProductionKwh),
    totalSystemLossPct: round2(totalSystemLossPct),
    inverterLossPct: settings.inverterLossPct,
    wireLossPct: settings.wireLossPct,
    shadeLossPct,
    tempLossPct: settings.tempLossPct,
    dirtLossPct: settings.dirtLossPct,
    misMatchLossPct: MISMATCH_LOSS_PCT,
    batteryLossPct,
    // Total costs (solar array + battery)
    diyEquipmentCostLow: round2(diyEquipmentCostLow),
    diyEquipmentCostHigh: round2(diyEquipmentCostHigh),
    installedCostLow: round2(installedCostLow),
    installedCostHigh: round2(installedCostHigh),
    // Breakdown for UI display
    solarArrayDiyCostLow: round2(solarArrayDiyCostLow),
    solarArrayDiyCostHigh: round2(solarArrayDiyCostHigh),
    solarArrayInstalledCostLow: round2(solarArrayInstalledCostLow),
    solarArrayInstalledCostHigh: round2(solarArrayInstalledCostHigh),
    batteryDiyCostLow: round2(batteryDiyCostLow),
    batteryDiyCostHigh: round2(batteryDiyCostHigh),
    batteryInstalledCostLow: round2(batteryInstalledCostLow),
    batteryInstalledCostHigh: round2(batteryInstalledCostHigh),
    estimatedYearlySavings: round2(estimatedYearlySavings),
    paybackYears: paybackYears !== null ? round2(paybackYears) : null,
    recommendedPanelBrand: panelBrands[project.budgetTier] ?? "Qcells",
    recommendedInverterBrand: inverterBrands[project.systemType] ?? "SolarEdge",
    recommendedBatteryBrand: hasBattery
      ? (batteryBrands[project.budgetTier] ?? "EG4 LiFePower4")
      : "No battery selected",
    recommendedMountingBrand: mountingBrands[project.installationType] ?? "IronRidge",
    squareFeetRequired,
    offGridDesignFactor: round2(offGridDesignFactor),
    batteryTempDeratingPct,
    notes,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
