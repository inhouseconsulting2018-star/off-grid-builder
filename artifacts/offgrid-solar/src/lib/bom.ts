export interface BomItem {
  category: string;
  item: string;
  brand: string;
  qty: string;
  unitPrice: string;
  totalPrice: string;
  reason: string;
}

interface BomInputs {
  systemType: string;
  installationType: string;
  budgetTier: string;
  numPanels: number;
  panelWattage?: number;
  adjustedArraySizeKw: number;
  inverterSizeKw: number;
  totalBatteryBankKwh: number;
  batteryUsableKwh: number;
  batteryChemistry?: string | null;
  hasGenerator?: boolean | null;
  generatorKw?: number | null;
  wantsGenerator?: boolean | null;
  recommendedPanelBrand: string;
  recommendedInverterBrand: string;
  recommendedBatteryBrand: string;
  recommendedMountingBrand: string;
  diyEquipmentCostLow: number;
  diyEquipmentCostHigh: number;
}

function priceRange(low: number, high: number): string {
  return `$${Math.round(low).toLocaleString()} – $${Math.round(high).toLocaleString()}`;
}

export function generateBom(p: BomInputs): BomItem[] {
  const bom: BomItem[] = [];
  const panelW = panelWattage(p.budgetTier);

  // 1. Solar Panels
  const panelUnitLow = panelW * panelUnitCostPerW(p.budgetTier, "panel");
  const panelUnitHigh = panelUnitLow * 1.15;
  bom.push({
    category: "Solar Panels",
    item: `${panelW}W Monocrystalline Solar Panel`,
    brand: p.recommendedPanelBrand,
    qty: `${p.numPanels} panels`,
    unitPrice: priceRange(panelUnitLow, panelUnitHigh),
    totalPrice: priceRange(panelUnitLow * p.numPanels, panelUnitHigh * p.numPanels),
    reason: `${p.numPanels} × ${panelW}W panels = ${(p.numPanels * panelW / 1000).toFixed(1)} kW array to meet your adjusted system size of ${p.adjustedArraySizeKw.toFixed(2)} kW.`,
  });

  // 2. Inverter
  const invUnitLow = p.inverterSizeKw * inverterCostPerKw(p.budgetTier, p.systemType, "low");
  const invUnitHigh = p.inverterSizeKw * inverterCostPerKw(p.budgetTier, p.systemType, "high");
  const invType = p.systemType === "off-grid" ? "Off-Grid Inverter/Charger" : p.systemType === "hybrid" ? "Hybrid Inverter/Charger" : "Grid-Tie Inverter";
  bom.push({
    category: "Inverter",
    item: `${p.inverterSizeKw.toFixed(1)} kW ${invType}`,
    brand: p.recommendedInverterBrand,
    qty: "1 unit",
    unitPrice: priceRange(invUnitLow, invUnitHigh),
    totalPrice: priceRange(invUnitLow, invUnitHigh),
    reason: `Sized at ${p.inverterSizeKw.toFixed(1)} kW (125% of array) to handle peak production and surge loads. ${p.systemType === "off-grid" ? "Off-grid inverter includes built-in charge controller." : p.systemType === "hybrid" ? "Hybrid unit can export to grid and charge batteries." : "Grid-tie inverter maximizes feed-in energy."}`,
  });

  // 3. Batteries (if selected)
  if (p.totalBatteryBankKwh > 0) {
    const chem = p.batteryChemistry ?? "lifepo4";
    const chemLabels: Record<string, string> = {
      "lifepo4": "LiFePO4 (Lithium Iron Phosphate)",
      "agm": "AGM (Absorbed Glass Mat)",
      "lead-acid": "Flooded Lead-Acid",
    };
    const chemDod: Record<string, number> = { "lifepo4": 80, "agm": 50, "lead-acid": 50 };
    const dodPct = chemDod[chem] ?? 80;
    const chemLabel = chemLabels[chem] ?? "LiFePO4";

    const batteryModuleKwh = batterySize(p.budgetTier, chem);
    const numBatteries = Math.ceil(p.totalBatteryBankKwh / batteryModuleKwh);
    const batUnitLow = batteryCostPerKwh(p.budgetTier, chem, "low") * batteryModuleKwh;
    const batUnitHigh = batteryCostPerKwh(p.budgetTier, chem, "high") * batteryModuleKwh;
    bom.push({
      category: "Battery Storage",
      item: `${batteryModuleKwh} kWh ${chemLabel} Battery`,
      brand: p.recommendedBatteryBrand,
      qty: `${numBatteries} unit${numBatteries > 1 ? "s" : ""} (${p.totalBatteryBankKwh.toFixed(1)} kWh total)`,
      unitPrice: priceRange(batUnitLow, batUnitHigh),
      totalPrice: priceRange(batUnitLow * numBatteries, batUnitHigh * numBatteries),
      reason: `${p.totalBatteryBankKwh.toFixed(1)} kWh total bank provides ${p.batteryUsableKwh.toFixed(1)} kWh usable at ${dodPct}% DoD. ${
        chem === "lifepo4"
          ? "LiFePO4 offers the best cycle life (3,000–6,000 cycles), built-in BMS, and requires no maintenance."
          : chem === "agm"
          ? "AGM is sealed, maintenance-free, and a cost-effective alternative to lithium. Limit to 50% DoD to maximize lifespan (500–1,000 cycles)."
          : "Flooded lead-acid is the lowest upfront cost option. Requires ventilation, monthly electrolyte checks, and periodic equalization charging."
      }`,
    });

    // Battery cables & BMS (lithium only — lead-acid uses external BMS/controller)
    bom.push({
      category: "Battery Accessories",
      item: chem === "lifepo4"
        ? "Battery Interconnect Cables, BMS, Bus Bars & Terminals"
        : chem === "agm"
        ? "AGM Interconnect Cables, Bus Bars, Terminals & Hydrometer"
        : "Flooded Cell Cables, Bus Bars, Terminals, Hydrometer & Vent Caps",
      brand: "Listed / UL Approved",
      qty: "1 set",
      unitPrice: "$150 – $400",
      totalPrice: "$150 – $400",
      reason: chem === "lead-acid"
        ? "Includes all battery-side wiring plus maintenance supplies: hydrometer, distilled water access, and anti-corrosion terminal spray."
        : "Required battery-side wiring, busbar connections, and BMS integration for safe operation.",
    });

    // Generator integration interface (if existing generator)
    if (p.hasGenerator) {
      const genKw = p.generatorKw ? ` (${p.generatorKw} kW)` : "";
      bom.push({
        category: "Generator Integration",
        item: `AC Coupling / Generator Integration for Existing Generator${genKw}`,
        brand: "Victron MultiPlus or Sol-Ark (AC-in port)",
        qty: "1 lot",
        unitPrice: "$0 – $500",
        totalPrice: "$0 – $500",
        reason: `Your existing generator${genKw} will connect to the inverter/charger AC input. Most off-grid and hybrid inverters include a generator input port with auto-start relay output. Programming and wiring for auto-start when battery SOC drops below 30% is included.`,
      });
    }
  }

  // Generator purchase (if user wants to add one)
  if (p.wantsGenerator && !p.hasGenerator) {
    const recKw = Math.max(4, Math.ceil(p.inverterSizeKw * 0.5));
    bom.push({
      category: "Backup Generator",
      item: `${recKw}–${recKw + 2} kW Propane or Diesel Generator`,
      brand: "Kohler, Generac, or Champion",
      qty: "1 unit",
      unitPrice: recKw <= 6 ? "$2,000 – $4,500" : "$4,500 – $9,000",
      totalPrice: recKw <= 6 ? "$2,000 – $4,500" : "$4,500 – $9,000",
      reason: `Sized at ${recKw} kW minimum (≥50% of ${p.inverterSizeKw.toFixed(1)} kW inverter). Auto-start via inverter relay when battery reaches ~30% SOC. Propane is preferred for long-term storage; diesel for heavy loads. Includes transfer switch wiring to inverter AC input.`,
    });
  }

  // 4. Charge Controller (off-grid without integrated inverter)
  if (p.systemType === "off-grid" && p.totalBatteryBankKwh > 0) {
    bom.push({
      category: "Charge Controller",
      item: `MPPT Charge Controller (${Math.ceil(p.adjustedArraySizeKw * 1000 / 48)}A @ 48V)`,
      brand: "Victron SmartSolar or MidNite Solar",
      qty: "1 unit",
      unitPrice: "$300 – $800",
      totalPrice: "$300 – $800",
      reason: "MPPT controller maximizes harvest from the solar array into the battery bank. Size is based on array current at 48V nominal battery voltage.",
    });
  }

  // 5. Racking / Mounting
  const rackCostLow = p.numPanels * 30;
  const rackCostHigh = p.numPanels * 65;
  const mountLabel =
    p.installationType === "roof" ? "Roof Mount Rail & Clamp System" :
    p.installationType === "ground" ? "Ground Mount Racking System" :
    p.installationType === "pole" ? "Top-of-Pole Mount" :
    "Commercial Carport Structure";
  bom.push({
    category: "Racking & Mounting",
    item: mountLabel,
    brand: p.recommendedMountingBrand,
    qty: `${p.numPanels} panel positions`,
    unitPrice: `$30 – $65 / panel`,
    totalPrice: priceRange(rackCostLow, rackCostHigh),
    reason: `${p.installationType.charAt(0).toUpperCase() + p.installationType.slice(1)} mount selected based on your installation type. Includes rails, clamps, hardware, and flashings.`,
  });

  // 6. Combiner Box / String Combiner
  if (p.numPanels >= 4) {
    bom.push({
      category: "Electrical Protection",
      item: "DC Combiner Box with Fusing",
      brand: "MidNite Solar or Bussmann",
      qty: "1 unit",
      unitPrice: "$150 – $350",
      totalPrice: "$150 – $350",
      reason: "Combines multiple string inputs with fuse protection. Required when using more than one string of panels.",
    });
  }

  // 7. AC / DC Disconnects
  bom.push({
    category: "Electrical Protection",
    item: "AC & DC Disconnect Switches (NEC Compliant)",
    brand: "Square D or Siemens",
    qty: "2 units",
    unitPrice: "$75 – $200 each",
    totalPrice: "$150 – $400",
    reason: "Required by NEC 690 for rapid shutdown and safe service access. Includes solar DC disconnect and AC output disconnect.",
  });

  // 8. Rapid Shutdown (if roof mount)
  if (p.installationType === "roof") {
    bom.push({
      category: "Safety Equipment",
      item: "Rapid Shutdown System (NEC 2017+)",
      brand: "Tigo, SunSpec, or Enphase IQ",
      qty: "1 system",
      unitPrice: "$200 – $600",
      totalPrice: "$200 – $600",
      reason: "Required by NEC 690.12 for roof-mounted systems. Reduces conductor voltage within 30 seconds for firefighter safety.",
    });
  }

  // 9. Wiring Allowance
  const wireAllowLow = Math.round(p.adjustedArraySizeKw * 80);
  const wireAllowHigh = Math.round(p.adjustedArraySizeKw * 180);
  bom.push({
    category: "Wiring & Conduit",
    item: "PV Wire, MC4 Connectors, Conduit & Conduit Bodies",
    brand: "USE-2 / THWN-2 / Listed PV Wire",
    qty: "1 lot (system sized)",
    unitPrice: "Per run",
    totalPrice: priceRange(wireAllowLow, wireAllowHigh),
    reason: `Wiring allowance covers DC home runs, AC output conductors, conduit, junction boxes, and connectors. Sized for ${p.adjustedArraySizeKw.toFixed(1)} kW system at 1.25× continuous duty NEC requirement.`,
  });

  // 10. Breakers / Fuses
  bom.push({
    category: "Electrical Protection",
    item: "Circuit Breakers, Fuses, Busbar",
    brand: "Square D QO or Siemens",
    qty: "1 lot",
    unitPrice: "$100 – $250",
    totalPrice: "$100 – $250",
    reason: "Breaker sizing is per NEC 690.8 at 156% of Isc. Includes main service panel back-feed breaker or subpanel.",
  });

  // 11. Grounding
  bom.push({
    category: "Grounding & Bonding",
    item: "Ground Rods, Bonding Wire, Grounding Lugs",
    brand: "Erico Cadweld or Listed Hardware",
    qty: "1 lot",
    unitPrice: "$75 – $200",
    totalPrice: "$75 – $200",
    reason: "Equipment grounding and bonding per NEC 690.43 and 250. Includes ground rod(s), grounding electrode conductor, and module frame bonding.",
  });

  // 12. Monitoring
  bom.push({
    category: "Monitoring",
    item: "Solar Production Monitor / Gateway",
    brand: "Enphase Envoy, SolarEdge, or Victron VRM",
    qty: "1 unit",
    unitPrice: "$150 – $400",
    totalPrice: "$150 – $400",
    reason: "Real-time monitoring of production, consumption, and battery state. Most inverters include basic monitoring; this covers a gateway or data logger for cloud access.",
  });

  return bom;
}

function panelWattage(tier: string): number {
  if (tier === "premium") return 430;
  if (tier === "economy") return 380;
  return 400;
}

function panelUnitCostPerW(tier: string, _type: string): number {
  if (tier === "premium") return 0.55;
  if (tier === "economy") return 0.35;
  return 0.45;
}

function inverterCostPerKw(tier: string, systemType: string, bound: "low" | "high"): number {
  const base =
    systemType === "off-grid" ? (tier === "premium" ? 350 : tier === "economy" ? 180 : 250) :
    systemType === "hybrid" ? (tier === "premium" ? 400 : tier === "economy" ? 200 : 280) :
    (tier === "premium" ? 220 : tier === "economy" ? 100 : 150);
  return bound === "high" ? base * 1.25 : base;
}

function batterySize(tier: string, chem = "lifepo4"): number {
  if (chem === "agm") return tier === "premium" ? 12 : tier === "economy" ? 6 : 9.6;
  if (chem === "lead-acid") return tier === "premium" ? 12 : tier === "economy" ? 6 : 6;
  // lifepo4
  if (tier === "premium") return 13.5;
  if (tier === "economy") return 9.6;
  return 10;
}

function batteryCostPerKwh(tier: string, chem: string, bound: "low" | "high"): number {
  let base: number;
  if (chem === "agm") {
    base = tier === "premium" ? 300 : tier === "economy" ? 180 : 230;
  } else if (chem === "lead-acid") {
    base = tier === "premium" ? 200 : tier === "economy" ? 100 : 150;
  } else {
    // lifepo4
    base = tier === "premium" ? 800 : tier === "economy" ? 400 : 550;
  }
  return bound === "high" ? base * 1.2 : base;
}
