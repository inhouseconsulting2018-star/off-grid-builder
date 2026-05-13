import type { Settings } from "@workspace/db";

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

export interface ProjectData {
  annualKwh: number;
  systemType: string;
  shadeLevel: string;
  backupHours: number;
  customBackupHours?: number | null;
  budgetTier: string;
  utilityRatePerKwh: number;
  state: string;
  installationType: string;
}

export function runCalculations(project: ProjectData, settings: Settings) {
  const panelW = settings.panelWattage;

  const shadeMap: Record<string, number> = {
    none: 0, light: 5, medium: 15, heavy: 30,
  };

  const shadeLossPct = shadeMap[project.shadeLevel] ?? 0;
  const peakSunHours = STATE_PEAK_SUN_HOURS[project.state?.toUpperCase()] ?? DEFAULT_PEAK_SUN_HOURS;

  const hasBattery = project.backupHours > 0;
  const batteryLossPct = hasBattery ? settings.batteryRoundTripLossPct : 0;

  const totalSystemLossPct =
    settings.inverterLossPct +
    settings.wireLossPct +
    shadeLossPct +
    settings.tempLossPct +
    settings.dirtLossPct +
    batteryLossPct;

  const lossMultiplier = 1 - totalSystemLossPct / 100;

  const dailyKwh = project.annualKwh / 365;

  const arraySizeKw = dailyKwh / peakSunHours;

  const adjustedArraySizeKw = arraySizeKw / lossMultiplier;

  const numPanels = Math.ceil((adjustedArraySizeKw * 1000) / panelW);

  const inverterSizeKw = Math.ceil(adjustedArraySizeKw * 1.25 * 2) / 2;

  const backupHrs = project.customBackupHours ?? project.backupHours;
  const batteryUsableKwh = hasBattery ? dailyKwh * (backupHrs / 24) : 0;
  const totalBatteryBankKwh = hasBattery ? batteryUsableKwh / (settings.batteryDod / 100) : 0;

  const yearlyProductionKwh = adjustedArraySizeKw * peakSunHours * 365 * lossMultiplier;

  const utilityRate = project.utilityRatePerKwh > 0 ? project.utilityRatePerKwh : settings.defaultUtilityRate;
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
    diyPerWattLow = settings.midRangeDiyPerWatt * 0.9;
    diyPerWattHigh = settings.midRangeDiyPerWatt;
    installedPerWattLow = settings.midRangeInstalledPerWatt * 0.9;
    installedPerWattHigh = settings.midRangeInstalledPerWatt;
  }

  const diyEquipmentCostLow = systemWatts * diyPerWattLow;
  const diyEquipmentCostHigh = systemWatts * diyPerWattHigh;
  const installedCostLow = systemWatts * installedPerWattLow;
  const installedCostHigh = systemWatts * installedPerWattHigh;

  const paybackYears = project.systemType !== "off-grid" && estimatedYearlySavings > 0
    ? (installedCostLow + installedCostHigh) / 2 / estimatedYearlySavings
    : null;

  // Equipment recommendations
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

  const batteryBrands: Record<string, string> = {
    economy: "EG4 LiFePower4",
    "mid-range": "EG4 PowerPro or Fortress",
    premium: "Tesla Powerwall or Simpliphi",
    custom: "EG4 PowerPro or Fortress",
  };

  const mountingBrands: Record<string, string> = {
    roof: "IronRidge or Unirac",
    ground: "IronRidge Ground Mount or Sinclair",
    pole: "Tamarack or MT Solar",
    carport: "Commercial Solar Carport Structure",
  };

  const notes: string[] = [];

  if (project.shadeLevel === "heavy") {
    notes.push("Heavy shading significantly reduces production — consider microinverters or power optimizers.");
  }
  if (project.highWindArea) {
    notes.push("High wind area: ensure mounting hardware meets local wind load requirements.");
  }
  if (project.systemType === "off-grid") {
    notes.push("Off-grid systems may benefit from a backup generator for extended low-production periods.");
    notes.push("Consider a fuel-based generator (propane or diesel) as emergency backup.");
  }
  if (adjustedArraySizeKw > 50) {
    notes.push("Large system — utility interconnection study and permitting may be required.");
  }
  if (batteryUsableKwh > 40) {
    notes.push("Large battery bank — consider DC-coupled battery systems for efficiency.");
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
    batteryLossPct,
    diyEquipmentCostLow: round2(diyEquipmentCostLow),
    diyEquipmentCostHigh: round2(diyEquipmentCostHigh),
    installedCostLow: round2(installedCostLow),
    installedCostHigh: round2(installedCostHigh),
    estimatedYearlySavings: round2(estimatedYearlySavings),
    paybackYears: paybackYears !== null ? round2(paybackYears) : null,
    recommendedPanelBrand: panelBrands[project.budgetTier] ?? "Qcells",
    recommendedInverterBrand: inverterBrands[project.systemType] ?? "SolarEdge",
    recommendedBatteryBrand: hasBattery ? (batteryBrands[project.budgetTier] ?? "EG4 LiFePower4") : "No battery selected",
    recommendedMountingBrand: mountingBrands[project.installationType] ?? "IronRidge",
    notes,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
