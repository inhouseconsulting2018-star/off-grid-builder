// ─── Bill of Materials — Real Equipment Catalog ─────────────────────────────
// All prices are 2024/2025 US market rates (DIY / direct-to-consumer).
// Prices reflect equipment only; installation labor is separate.

export interface BomAlternative {
  brand: string;
  model: string;
  specs: string;
  unitPriceLow: number;
  unitPriceHigh: number;
  brandLink?: string;
}

export interface BomItem {
  category: string;
  item: string;
  model: string;
  specs: string;
  brand: string;
  brandLink?: string;
  qty: string;
  unitPriceLow: number;
  unitPriceHigh: number;
  totalPriceLow: number;
  totalPriceHigh: number;
  unitPrice: string;
  totalPrice: string;
  reason: string;
  alternatives?: BomAlternative[];
}

export interface BomInputs {
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
  snowArea?: boolean | null;
  recommendedPanelBrand: string;
  recommendedInverterBrand: string;
  recommendedBatteryBrand: string;
  recommendedMountingBrand: string;
  diyEquipmentCostLow: number;
  diyEquipmentCostHigh: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(low: number, high: number) {
  return `$${Math.round(low).toLocaleString()} – $${Math.round(high).toLocaleString()}`;
}

function item(
  category: string,
  description: string,
  model: string,
  specs: string,
  brand: string,
  brandLink: string | undefined,
  qty: string,
  unitLow: number,
  unitHigh: number,
  count: number,
  reason: string,
  alternatives?: BomAlternative[],
): BomItem {
  return {
    category,
    item: description,
    model,
    specs,
    brand,
    brandLink,
    qty,
    unitPriceLow: unitLow,
    unitPriceHigh: unitHigh,
    totalPriceLow: unitLow * count,
    totalPriceHigh: unitHigh * count,
    unitPrice: fmt(unitLow, unitHigh),
    totalPrice: fmt(unitLow * count, unitHigh * count),
    reason,
    alternatives,
  };
}

// ─── Equipment Catalog ────────────────────────────────────────────────────────

// ── Solar Panels ─────────────────────────────────────────────────────────────

interface PanelSpec { brand: string; model: string; wattage: number; eff: number; voc: number; isc: number; priceLow: number; priceHigh: number; link: string; }

const PANELS: Record<string, PanelSpec[]> = {
  economy: [
    { brand: "Canadian Solar", model: "CS6L-400MS HiKu6", wattage: 400, eff: 20.4, voc: 41.3, isc: 12.5, priceLow: 85, priceHigh: 105, link: "https://www.canadiansolar.com" },
    { brand: "Jinko Solar",    model: "JKM400M-54HL4-V Tiger Neo", wattage: 400, eff: 21.3, voc: 38.5, isc: 13.2, priceLow: 80, priceHigh: 100, link: "https://www.jinkosolar.com" },
    { brand: "LONGi",          model: "LR5-54HPH-405M Hi-MO 5", wattage: 405, eff: 21.0, voc: 39.5, isc: 13.1, priceLow: 85, priceHigh: 108, link: "https://longi.com" },
  ],
  "mid-range": [
    { brand: "Q CELLS",        model: "Q.PEAK DUO BLK ML-G10+ 405W", wattage: 405, eff: 20.6, voc: 41.6, isc: 12.59, priceLow: 110, priceHigh: 135, link: "https://www.q-cells.us" },
    { brand: "Aptos Solar",    model: "DNA-144-MF26-390W Black Series", wattage: 390, eff: 20.1, voc: 40.3, isc: 12.3, priceLow: 100, priceHigh: 125, link: "https://aptossolar.com" },
    { brand: "Canadian Solar", model: "CS6W-415MS HiKu7", wattage: 415, eff: 21.4, voc: 41.8, isc: 12.7, priceLow: 105, priceHigh: 130, link: "https://www.canadiansolar.com" },
  ],
  premium: [
    { brand: "REC Group",  model: "REC Alpha Pure-R 430AA", wattage: 430, eff: 22.3, voc: 42.0, isc: 13.1, priceLow: 185, priceHigh: 230, link: "https://www.recgroup.com" },
    { brand: "Panasonic",  model: "EverVolt EVPV410H HIT", wattage: 410, eff: 22.2, voc: 51.6, isc: 10.8, priceLow: 165, priceHigh: 210, link: "https://na.panasonic.com/us/energy-solutions/solar" },
    { brand: "Q CELLS",    model: "Q.PEAK DUO XL-G10.3 430W", wattage: 430, eff: 21.4, voc: 43.2, isc: 12.8, priceLow: 155, priceHigh: 195, link: "https://www.q-cells.us" },
  ],
};

// ── Inverters ─────────────────────────────────────────────────────────────────

interface InvSpec { brand: string; model: string; kw: number; specs: string; priceLow: number; priceHigh: number; link: string; }

const INVERTERS: Record<string, Record<string, InvSpec[]>> = {
  "off-grid": {
    economy: [
      { brand: "EG4",         model: "EG4 6000XP",               kw: 6,  specs: "48V, 6kW/120-240V split-phase, 120A MPPT built-in",     priceLow: 850,   priceHigh: 1050, link: "https://eg4electronics.com" },
      { brand: "Growatt",     model: "Growatt SPF 6000T DVM-MPV", kw: 6,  specs: "48V, 6kW, 120A MPPT, 6kW PV input",                    priceLow: 700,   priceHigh: 900,  link: "https://www.growatt.com" },
      { brand: "Signature Solar", model: "EG4 3000EHV",          kw: 3,  specs: "48V, 3kW/120V, 80A MPPT, 2kW PV input",                priceLow: 550,   priceHigh: 700,  link: "https://signaturesolar.com" },
    ],
    "mid-range": [
      { brand: "Sol-Ark",     model: "Sol-Ark 12K",               kw: 12, specs: "48V, 12kW/120-240V split-phase, 160A MPPT",            priceLow: 2800,  priceHigh: 3300, link: "https://www.sol-ark.com" },
      { brand: "EG4",         model: "EG4 18KPV-12LV",            kw: 18, specs: "48V, 18kW, dual MPPT 500A total, 120-240V",            priceLow: 2200,  priceHigh: 2700, link: "https://eg4electronics.com" },
      { brand: "Victron",     model: "MultiPlus-II 48/5000/70",   kw: 5,  specs: "48V, 5kW/120V, requires separate MPPT",               priceLow: 1500,  priceHigh: 1900, link: "https://www.victronenergy.com" },
    ],
    premium: [
      { brand: "Victron",     model: "Quattro 48/8000/110",        kw: 8,  specs: "48V, 8kW/120-240V, dual AC-in for generator",         priceLow: 2400,  priceHigh: 2900, link: "https://www.victronenergy.com" },
      { brand: "Schneider",   model: "XW Pro 6848NA",              kw: 6.8, specs: "48V, 6.8kW/120-240V, 80A MPPT, 99.1% peak eff",     priceLow: 3000,  priceHigh: 3700, link: "https://www.se.com/us/en/work/products/solar/" },
      { brand: "Sol-Ark",     model: "Sol-Ark 15K",                kw: 15, specs: "48V, 15kW/120-240V, 200A MPPT, 15kW PV input",       priceLow: 3600,  priceHigh: 4400, link: "https://www.sol-ark.com" },
    ],
  },
  hybrid: {
    economy: [
      { brand: "Growatt",     model: "Growatt SPH 6000TL3-BH",    kw: 6,  specs: "48V, 6kW, grid-tie + battery, 2× MPPT",               priceLow: 1100,  priceHigh: 1500, link: "https://www.growatt.com" },
      { brand: "EG4",         model: "EG4 6000XP (Hybrid mode)",  kw: 6,  specs: "48V, 6kW hybrid, 120A MPPT, AC coupling",             priceLow: 900,   priceHigh: 1200, link: "https://eg4electronics.com" },
    ],
    "mid-range": [
      { brand: "Sol-Ark",     model: "Sol-Ark 15K-2P",            kw: 15, specs: "48V, 15kW, 2-phase, grid-tie + off-grid, 200A MPPT",  priceLow: 3500,  priceHigh: 4200, link: "https://www.sol-ark.com" },
      { brand: "SolarEdge",   model: "SE10000H-US StorEdge",      kw: 10, specs: "240V, 10kW, StorEdge hybrid, HD-Wave",                 priceLow: 2000,  priceHigh: 2600, link: "https://www.solaredge.com" },
    ],
    premium: [
      { brand: "Victron",     model: "MultiPlus-II GX 48/5000",   kw: 5,  specs: "48V, 5kW, built-in GX controller, CAN BMS ready",    priceLow: 2200,  priceHigh: 2800, link: "https://www.victronenergy.com" },
      { brand: "Schneider",   model: "XW Pro 6848 Hybrid",        kw: 6.8, specs: "48V, 6.8kW, true hybrid, UPS-grade transfer",        priceLow: 3200,  priceHigh: 4000, link: "https://www.se.com/us/en/work/products/solar/" },
      { brand: "Sol-Ark",     model: "Sol-Ark 15K",               kw: 15, specs: "15kW hybrid, 2× MPPT, 200A, whole-home backup",       priceLow: 3800,  priceHigh: 4600, link: "https://www.sol-ark.com" },
    ],
  },
  "grid-tied": {
    economy: [
      { brand: "Growatt",     model: "Growatt MIN 6000TL-X",      kw: 6,  specs: "240V single-phase, 6kW, 2× MPPT, 97.8% eff",          priceLow: 600,   priceHigh: 900,  link: "https://www.growatt.com" },
      { brand: "Solis",       model: "Solis S6-GR1P6K-M 6kW",    kw: 6,  specs: "240V, 6kW, 2× MPPT, 98.1% CEC eff",                  priceLow: 650,   priceHigh: 950,  link: "https://ginlongsolis.com" },
    ],
    "mid-range": [
      { brand: "SolarEdge",   model: "SE6000H-US HD-Wave",        kw: 6,  specs: "240V, 6kW, HD-Wave, 99% CEC eff, EV-ready port",      priceLow: 1300,  priceHigh: 1700, link: "https://www.solaredge.com" },
      { brand: "SMA",         model: "Sunny Boy 7.7-US",          kw: 7.7, specs: "240V, 7.7kW, ShadeFix, 97.5% CEC eff",              priceLow: 1200,  priceHigh: 1600, link: "https://www.sma-america.com" },
      { brand: "Enphase",     model: "IQ8A Microinverter (ea.)",  kw: 0.366, specs: "240V, 366VA ea., per-panel MPPT, CEC 97.6%",       priceLow: 155,   priceHigh: 195,  link: "https://enphase.com" },
    ],
    premium: [
      { brand: "Enphase",     model: "IQ8M Microinverter (ea.)",  kw: 0.384, specs: "240V, 384VA, per-panel, Ensemble ready, 97.6%",    priceLow: 190,   priceHigh: 240,  link: "https://enphase.com" },
      { brand: "SolarEdge",   model: "SE10000H-US HD-Wave",       kw: 10, specs: "240V, 10kW, 99% CEC eff, HD-Wave technology",        priceLow: 1900,  priceHigh: 2500, link: "https://www.solaredge.com" },
      { brand: "SMA",         model: "Sunny Tripower 10.0-US",    kw: 10, specs: "208-240V, 10kW, OptiTrac Global Peak, 98.0%",        priceLow: 1800,  priceHigh: 2400, link: "https://www.sma-america.com" },
    ],
  },
};

// ── Batteries ─────────────────────────────────────────────────────────────────

interface BatSpec { brand: string; model: string; kwh: number; voltage: number; specs: string; priceLow: number; priceHigh: number; link: string; }

const BATTERIES: Record<string, Record<string, BatSpec[]>> = {
  lifepo4: {
    economy: [
      { brand: "EG4",        model: "EG4 LiFePower4 48V 100Ah",      kwh: 5.12,  voltage: 48, specs: "5.12kWh, 48V 100Ah, BMS built-in, wall/rack mount, 6,000 cycles", priceLow: 780,  priceHigh: 950,  link: "https://eg4electronics.com" },
      { brand: "Ampere Time", model: "Ampere Time 48V 100Ah Plus",   kwh: 5.12,  voltage: 48, specs: "5.12kWh, 48V 100Ah, 200A BMS, stackable, IP65",                    priceLow: 720,  priceHigh: 880,  link: "https://www.amperepower.com" },
    ],
    "mid-range": [
      { brand: "EG4",         model: "EG4 PowerPro 48V 200Ah",       kwh: 10.24, voltage: 48, specs: "10.24kWh, 48V 200Ah, CAN BUS BMS, rack-mount, 6,000 cycles",      priceLow: 1900, priceHigh: 2400, link: "https://eg4electronics.com" },
      { brand: "Fortress Power", model: "eFlex 5.4 48V",             kwh: 5.4,   voltage: 48, specs: "5.4kWh, 48V 112.5Ah, stackable to 43.2kWh, modular BMS",          priceLow: 1400, priceHigh: 1750, link: "https://www.fortresspower.com" },
      { brand: "Jakiper",     model: "JK-B200A48 48V 200Ah",         kwh: 10.24, voltage: 48, specs: "10.24kWh, 48V, low-temp charging protection, 6,000 cycles",       priceLow: 1700, priceHigh: 2100, link: "https://www.jakipower.com" },
    ],
    premium: [
      { brand: "Tesla",       model: "Powerwall 3",                   kwh: 13.5,  voltage: 50, specs: "13.5kWh, 11.5kW continuous, 100% DoD, built-in inverter",        priceLow: 7500, priceHigh: 9500, link: "https://www.tesla.com/powerwall" },
      { brand: "SimpliPhi",   model: "PHI 3.8 kWh 48V",              kwh: 3.8,   voltage: 48, specs: "3.8kWh, 48V, 15+ yr life, –40°C to 60°C, no passive cooling",    priceLow: 1500, priceHigh: 1900, link: "https://www.simpliphi.com" },
      { brand: "Pytes",       model: "Pytes E-BOX-48100R",            kwh: 5.12,  voltage: 48, specs: "5.12kWh, 48V 100Ah, rack-mount, CAN/RS485, 6,000 cycles",        priceLow: 1100, priceHigh: 1400, link: "https://www.pytess.com" },
    ],
  },
  agm: {
    economy: [
      { brand: "Renogy",      model: "Renogy 12V 200Ah Deep Cycle AGM", kwh: 2.4, voltage: 12, specs: "2.4kWh, 12V 200Ah, sealed, 500 cycles @ 50% DoD",              priceLow: 250,  priceHigh: 310,  link: "https://www.renogy.com" },
      { brand: "VMAXTANKS",   model: "VMAX SLR200 12V 200Ah",          kwh: 2.4, voltage: 12, specs: "2.4kWh, 12V 200Ah, military grade plates, 500-700 cycles",       priceLow: 280,  priceHigh: 360,  link: "https://vmaxtanks.com" },
    ],
    "mid-range": [
      { brand: "Trojan",      model: "Trojan SPRE 12 225 12V 225Ah",  kwh: 2.7, voltage: 12, specs: "2.7kWh, 12V 225Ah, sealed, 700+ cycles @ 50% DoD, 10-yr design", priceLow: 350,  priceHigh: 440,  link: "https://www.trojanbattery.com" },
      { brand: "Crown Battery", model: "Crown 12CRV110 12V 110Ah",    kwh: 1.32, voltage: 12, specs: "1.32kWh, 12V 110Ah, AGM, 600 cycles, deep cycle",               priceLow: 200,  priceHigh: 260,  link: "https://crownbattery.com" },
    ],
    premium: [
      { brand: "Discover Battery", model: "Discover AES 48V 100Ah",   kwh: 4.8, voltage: 48, specs: "4.8kWh, 48V 100Ah, thin-plate pure lead, 1,500 cycles @ 50%",   priceLow: 850,  priceHigh: 1100, link: "https://discoverbattery.com" },
      { brand: "Lifeline",    model: "Lifeline GPL-L16 6V 400Ah",     kwh: 2.4, voltage: 6,  specs: "2.4kWh, 6V 400Ah, pure lead tin, aviation grade, 800 cycles",    priceLow: 420,  priceHigh: 550,  link: "https://lifelinebatteries.com" },
    ],
  },
  "lead-acid": {
    economy: [
      { brand: "US Battery",  model: "US Battery USB 2200XC 6V 232Ah", kwh: 1.39, voltage: 6, specs: "1.39kWh, 6V 232Ah flooded, Express C3 formula, 750 cycles",     priceLow: 120,  priceHigh: 160,  link: "https://usbattery.com" },
      { brand: "Trojan",      model: "Trojan T-105 6V 225Ah",          kwh: 1.35, voltage: 6, specs: "1.35kWh, 6V 225Ah flooded, deep-cycle, 750+ cycles @ 50%",      priceLow: 145,  priceHigh: 185,  link: "https://www.trojanbattery.com" },
    ],
    "mid-range": [
      { brand: "Trojan",      model: "Trojan L16H-AC 6V 435Ah",       kwh: 2.61, voltage: 6, specs: "2.61kWh, 6V 435Ah flooded, L16 size, 1,500 cycles @ 50%",       priceLow: 280,  priceHigh: 360,  link: "https://www.trojanbattery.com" },
      { brand: "Crown Battery", model: "Crown CR235 6V 235Ah",        kwh: 1.41, voltage: 6, specs: "1.41kWh, 6V 235Ah flooded, 900 cycles @ 50% DoD",               priceLow: 150,  priceHigh: 200,  link: "https://crownbattery.com" },
    ],
    premium: [
      { brand: "Rolls Surrette", model: "Rolls 4-KS-25PS 6V 428Ah",  kwh: 2.57, voltage: 6, specs: "2.57kWh, 6V 428Ah flooded, 1,600+ cycles @ 50%, 20-yr design",  priceLow: 340,  priceHigh: 430,  link: "https://rollsbattery.com" },
      { brand: "Trojan",      model: "Trojan IND17-6V 6V 545Ah",     kwh: 3.27, voltage: 6, specs: "3.27kWh, 6V 545Ah, industrial deep cycle, 2,000+ cycles",       priceLow: 450,  priceHigh: 580,  link: "https://www.trojanbattery.com" },
    ],
  },
};

// ── MPPT Charge Controllers ───────────────────────────────────────────────────

interface MpptSpec { brand: string; model: string; amps: number; maxPvV: number; specs: string; priceLow: number; priceHigh: number; link: string; }

const MPPT_CONTROLLERS: MpptSpec[] = [
  { brand: "Victron",     model: "SmartSolar MPPT 100/30",       amps: 30,  maxPvV: 100, specs: "30A, 12/24/48V auto, Bluetooth, VE.Direct, IP43",                   priceLow: 130,  priceHigh: 165,  link: "https://www.victronenergy.com/solar-charge-controllers" },
  { brand: "Victron",     model: "SmartSolar MPPT 100/50",       amps: 50,  maxPvV: 100, specs: "50A, 12/24/48V auto, Bluetooth, VE.Direct, IP43",                   priceLow: 165,  priceHigh: 210,  link: "https://www.victronenergy.com/solar-charge-controllers" },
  { brand: "Victron",     model: "SmartSolar MPPT 150/70",       amps: 70,  maxPvV: 150, specs: "70A, 12-48V, 150V PV input, Bluetooth, VE.Direct",                  priceLow: 280,  priceHigh: 350,  link: "https://www.victronenergy.com/solar-charge-controllers" },
  { brand: "Victron",     model: "SmartSolar MPPT 150/100",      amps: 100, maxPvV: 150, specs: "100A, 12-48V, 150V PV input, Bluetooth, VE.Direct",                 priceLow: 370,  priceHigh: 460,  link: "https://www.victronenergy.com/solar-charge-controllers" },
  { brand: "Victron",     model: "SmartSolar MPPT 250/100",      amps: 100, maxPvV: 250, specs: "100A, 48V, 250V PV input, Bluetooth, for large strings",            priceLow: 480,  priceHigh: 590,  link: "https://www.victronenergy.com/solar-charge-controllers" },
  { brand: "MidNite Solar", model: "Classic 150",                amps: 96,  maxPvV: 150, specs: "96A MPPT, 12-72V, 150V PV, HyperVOC, Arc Fault detection",         priceLow: 500,  priceHigh: 660,  link: "https://midnitesolar.com" },
  { brand: "Outback",     model: "FLEXmax 80",                   amps: 80,  maxPvV: 150, specs: "80A MPPT, 12-60V, 150V PV input, MATE3s compatible",               priceLow: 430,  priceHigh: 540,  link: "https://www.outbackpower.com" },
  { brand: "Epever",      model: "Tracer AN 4210A 40A",          amps: 40,  maxPvV: 100, specs: "40A, 12/24/36/48V auto, 100V PV, RS485, 98% MPPT eff",             priceLow: 90,   priceHigh: 130,  link: "https://epever.com" },
];

function pickMppt(arraySizeKw: number): MpptSpec {
  const arrayAmps = (arraySizeKw * 1000) / 48; // amps at 48V nominal
  const required  = arrayAmps * 1.25;          // 25% headroom
  const sorted    = [...MPPT_CONTROLLERS].sort((a, b) => a.amps - b.amps);
  return sorted.find(c => c.amps >= required) ?? sorted[sorted.length - 1];
}

// ─── Main generator function ──────────────────────────────────────────────────

export function generateBom(p: BomInputs): BomItem[] {
  const bom: BomItem[] = [];
  const tier = p.budgetTier in PANELS ? p.budgetTier : "mid-range";
  const chem = (p.batteryChemistry ?? "lifepo4").toLowerCase();
  const chemKey = (chem in BATTERIES) ? chem as keyof typeof BATTERIES : "lifepo4";
  const sysType = p.systemType in INVERTERS ? p.systemType : "grid-tied";

  // ── 1. Solar Panels ────────────────────────────────────────────────────────
  const panelCatalog = PANELS[tier] ?? PANELS["mid-range"];
  const primaryPanel = panelCatalog[0];
  const altPanels    = panelCatalog.slice(1).map(alt => ({
    brand: alt.brand, model: alt.model,
    specs: `${alt.wattage}W, ${alt.eff}% eff, Voc ${alt.voc}V`,
    unitPriceLow: alt.priceLow, unitPriceHigh: alt.priceHigh, brandLink: alt.link,
  }));
  bom.push(item(
    "Solar Panels",
    `${primaryPanel.wattage}W Monocrystalline Solar Panel`,
    primaryPanel.model,
    `${primaryPanel.wattage}W, ${primaryPanel.eff}% efficiency, Voc ${primaryPanel.voc}V, Isc ${primaryPanel.isc}A`,
    primaryPanel.brand, primaryPanel.link,
    `${p.numPanels} panels`,
    primaryPanel.priceLow, primaryPanel.priceHigh, p.numPanels,
    `${p.numPanels} × ${primaryPanel.wattage}W = ${(p.numPanels * primaryPanel.wattage / 1000).toFixed(1)} kW DC array. ` +
    `Covers your ${p.adjustedArraySizeKw.toFixed(2)} kW adjusted system size with standard panel-to-panel string wiring.`,
    altPanels,
  ));

  // ── 2. Inverter ────────────────────────────────────────────────────────────
  const invCatalog = (INVERTERS[sysType] ?? INVERTERS["grid-tied"])[tier] ?? (INVERTERS[sysType] ?? INVERTERS["grid-tied"])["mid-range"];
  // Pick the closest kW match (equal to or next size up)
  const sortedInv = [...invCatalog].sort((a, b) => a.kw - b.kw);
  const primaryInv = sortedInv.find(i => i.kw >= p.inverterSizeKw) ?? sortedInv[sortedInv.length - 1];
  const altInvs = sortedInv.filter(i => i.model !== primaryInv.model).map(alt => ({
    brand: alt.brand, model: alt.model, specs: alt.specs,
    unitPriceLow: alt.priceLow, unitPriceHigh: alt.priceHigh, brandLink: alt.link,
  }));

  // For grid-tied microinverter (Enphase) — scale by panel count
  const isEnphase = primaryInv.brand === "Enphase";
  const invCount   = isEnphase ? p.numPanels : 1;
  const invDesc    = p.systemType === "off-grid" ? "Off-Grid Inverter/Charger" :
                     p.systemType === "hybrid"   ? "Hybrid Inverter/Charger" : "Grid-Tie Inverter";
  bom.push(item(
    "Inverter",
    `${p.inverterSizeKw.toFixed(1)} kW ${invDesc}`,
    primaryInv.model,
    primaryInv.specs,
    primaryInv.brand, primaryInv.link,
    isEnphase ? `${invCount} microinverters (1 per panel)` : "1 unit",
    primaryInv.priceLow, primaryInv.priceHigh, invCount,
    `Rated ${p.inverterSizeKw.toFixed(1)} kW output. ` +
    (p.systemType === "off-grid"
      ? "All-in-one off-grid inverter/charger manages solar input, battery charging, and AC output. Handles motor surge loads."
      : p.systemType === "hybrid"
      ? "Hybrid unit provides backup power from battery and can export surplus to the grid."
      : isEnphase
      ? "Per-panel microinverters eliminate single-point failure and enable panel-level MPPT and monitoring."
      : "Grid-tie inverter maximizes self-consumption and grid feed-in."),
    altInvs,
  ));

  // ── 3. Batteries ──────────────────────────────────────────────────────────
  if (p.totalBatteryBankKwh > 0) {
    const batCatalog = (BATTERIES[chemKey] ?? BATTERIES["lifepo4"])[tier] ?? (BATTERIES[chemKey] ?? BATTERIES["lifepo4"])["mid-range"];
    const primaryBat = batCatalog[0];
    const numBat     = Math.ceil(p.totalBatteryBankKwh / primaryBat.kwh);
    const altBats    = batCatalog.slice(1).map(alt => {
      const n = Math.ceil(p.totalBatteryBankKwh / alt.kwh);
      return {
        brand: alt.brand, model: alt.model, specs: alt.specs,
        unitPriceLow: alt.priceLow * n, unitPriceHigh: alt.priceHigh * n, brandLink: alt.link,
      };
    });
    const dodPct = chem === "lifepo4" ? 80 : 50;
    bom.push(item(
      "Battery Storage",
      `${primaryBat.kwh} kWh ${chem === "lifepo4" ? "LiFePO4" : chem === "agm" ? "AGM" : "Flooded Lead-Acid"} Battery Module`,
      primaryBat.model,
      primaryBat.specs,
      primaryBat.brand, primaryBat.link,
      `${numBat} unit${numBat > 1 ? "s" : ""} = ${(numBat * primaryBat.kwh).toFixed(1)} kWh bank`,
      primaryBat.priceLow, primaryBat.priceHigh, numBat,
      `${(numBat * primaryBat.kwh).toFixed(1)} kWh total bank / ${dodPct}% DoD = ${p.batteryUsableKwh.toFixed(1)} kWh usable. ` +
      (chem === "lifepo4"
        ? "LiFePO4 offers 6,000+ cycle life, built-in BMS, zero maintenance, safe for indoor installation."
        : chem === "agm"
        ? "AGM is sealed and maintenance-free. Limit to 50% DoD to reach 500–1,000 cycle life."
        : "Flooded lead-acid requires monthly electrolyte checks, equalization charging, and a ventilated enclosure."),
      altBats,
    ));

    // Battery Interconnect Cables, Bus Bars, Terminals
    const cableSet = chem === "lifepo4" ? "Battery interconnect cables, bus bars, terminal lugs, BMS CANbus wiring"
      : chem === "agm" ? "AGM interconnect cables, bus bars, terminal lugs, hydrometer"
      : "Flooded cell cables, bus bars, terminal lugs, hydrometer, vent caps";
    const cableLow  = chem === "lifepo4" ? 180 : 120;
    const cableHigh = chem === "lifepo4" ? 420 : 280;
    bom.push(item(
      "Battery Accessories",
      "Battery Interconnect Kit",
      cableSet,
      `2/0 AWG flexible cable, copper bus bars, lugs, ${chem === "lifepo4" ? "RS485/CAN BMS harness" : "cell vent kit"}`,
      chem === "lifepo4" ? "WindyNation / Signature Solar" : "Trojan / Crown",
      chem === "lifepo4" ? "https://signaturesolar.com" : "https://www.trojanbattery.com",
      "1 set",
      cableLow, cableHigh, 1,
      "Short, heavy-gauge cables between batteries and DC bus. 2/0 AWG rated for continuous high current with minimal voltage drop.",
      chem === "lifepo4" ? [{
        brand: "Victron", model: "Victron SmartShunt 500A + Wiring Kit",
        specs: "500A coulomb counter, Bluetooth SOC monitor, connects to VRM portal",
        unitPriceLow: 80, unitPriceHigh: 120, brandLink: "https://www.victronenergy.com",
      }] : undefined,
    ));

    // Generator integration (existing)
    if (p.hasGenerator) {
      const genKw = p.generatorKw ? ` (${p.generatorKw} kW)` : "";
      bom.push(item(
        "Generator Integration",
        `Generator AC-In Wiring & Auto-Start Relay${genKw}`,
        "AC-Input Transfer Relay + Auto-Start Harness",
        "120/240V AC-in port wiring, auto-start relay output, transfer switch bypass",
        "Victron / Sol-Ark", "https://www.victronenergy.com/inverters-chargers",
        "1 lot", 150, 500, 1,
        `Your existing generator${genKw} connects to the inverter AC-input port. ` +
        "Configure auto-start at 20–30% SOC and auto-stop at 90% SOC to extend generator life and minimize runtime.",
      ));
    }
  }

  // ── 4. Generator purchase (if requested) ──────────────────────────────────
  if (p.wantsGenerator && !p.hasGenerator) {
    const recKw = Math.max(4, Math.ceil(p.inverterSizeKw * 0.5));
    const isSmall = recKw <= 8;
    bom.push(item(
      "Backup Generator",
      `${recKw}–${recKw + 2} kW Propane / Diesel Generator`,
      isSmall ? "Kohler 8RESV or Champion 7500W" : "Generac XD5000E or Kohler 20RESCL",
      isSmall
        ? `${recKw}–${recKw + 2} kW, electric start, auto-start capable, LP/NG/diesel`
        : `${recKw}–${recKw + 2} kW, automatic standby, 200A transfer switch`,
      isSmall ? "Kohler / Champion" : "Generac / Kohler",
      isSmall ? "https://www.kohlerpower.com/generators" : "https://www.generac.com/generators",
      "1 unit",
      isSmall ? 2000 : 4500, isSmall ? 4500 : 9000, 1,
      `Minimum ${recKw} kW required (≥50% of ${p.inverterSizeKw.toFixed(1)} kW inverter to charge batteries while running loads). ` +
      "Propane preferred for long-term fuel storage; diesel for heavy-duty applications. Includes transfer switch wiring to inverter AC-in.",
      isSmall ? [{
        brand: "Champion", model: "Champion 100520 8500W Dual Fuel",
        specs: "8.5kW peak, 7.5kW run, LP/Gas, electric start, CO Shield",
        unitPriceLow: 1200, unitPriceHigh: 1600, brandLink: "https://www.championpowerequipment.com",
      }] : [{
        brand: "Generac", model: "Generac GP15000E 15kW",
        specs: "15kW, electric start, OHVI engine, CO-Sense",
        unitPriceLow: 3000, unitPriceHigh: 4200, brandLink: "https://www.generac.com/generators",
      }],
    ));
  }

  // ── 5. MPPT Charge Controller (separate — off-grid without built-in MPPT) ─
  // Note: most modern all-in-one off-grid inverters include MPPT. We add a
  // standalone controller for hybrid/standalone PV array expansion scenarios
  // or when user has a separate battery + inverter setup.
  if ((p.systemType === "off-grid" || p.systemType === "hybrid") && p.totalBatteryBankKwh > 0) {
    const ctrl = pickMppt(p.adjustedArraySizeKw);
    const altCtrls = MPPT_CONTROLLERS
      .filter(c => c.model !== ctrl.model && Math.abs(c.amps - ctrl.amps) <= 30)
      .slice(0, 2)
      .map(alt => ({
        brand: alt.brand, model: alt.model, specs: alt.specs,
        unitPriceLow: alt.priceLow, unitPriceHigh: alt.priceHigh, brandLink: alt.link,
      }));
    bom.push(item(
      "Charge Controller",
      `MPPT Solar Charge Controller — ${ctrl.amps}A`,
      ctrl.model,
      ctrl.specs,
      ctrl.brand, ctrl.link,
      "1 unit",
      ctrl.priceLow, ctrl.priceHigh, 1,
      `Array of ${p.adjustedArraySizeKw.toFixed(1)} kW at 48V requires ${((p.adjustedArraySizeKw * 1000) / 48).toFixed(0)}A DC. ` +
      `${ctrl.amps}A controller includes 25% headroom per NEC 690.8. ` +
      "Note: many all-in-one off-grid inverters include built-in MPPT — confirm before ordering separately.",
      altCtrls,
    ));
  }

  // ── 6. Racking & Mounting ──────────────────────────────────────────────────
  const mountType =
    p.installationType === "ground"  ? "Ground Mount"  :
    p.installationType === "pole"    ? "Top-of-Pole Mount" :
    p.installationType === "carport" ? "Solar Carport Structure" :
    "Roof Mount Rail System";
  const mountModels: Record<string, { model: string; brand: string; link: string; specs: string; low: number; high: number; alts: BomAlternative[] }> = {
    roof: {
      model: "IronRidge XR100 Rail + UFO L-Foot Flashing Kit",
      brand: "IronRidge", link: "https://www.ironridge.com",
      specs: "Extruded 6005-T5 aluminum rail, adjustable L-feet, EPDM flashings, mill finish or black",
      low: 35, high: 65,
      alts: [
        { brand: "Unirac", model: "Unirac SolarMount Pro", specs: "Mill or anodized rail, rubber-gasketed clamps, UL 2703 listed", unitPriceLow: 32, unitPriceHigh: 60, brandLink: "https://www.unirac.com" },
        { brand: "Quick Mount PV", model: "Quick Mount PV Classic Composition Mount", specs: "Low-profile, self-flashing, 150 mph wind rated, 25-yr warranty", unitPriceLow: 30, unitPriceHigh: 55, brandLink: "https://www.quickmountpv.com" },
      ],
    },
    ground: {
      model: "IronRidge GFT Ground Mount System",
      brand: "IronRidge", link: "https://www.ironridge.com",
      specs: "Driven or ballasted footings, XR100 rails, galvanized steel uprights, tilt angle 5°–45° adjustable",
      low: 50, high: 85,
      alts: [
        { brand: "Schletter", model: "Schletter EcoMini Ground Mount", specs: "Hot-dip galvanized steel, driven ground screws, 60 mph wind rated", unitPriceLow: 55, unitPriceHigh: 90, brandLink: "https://www.schletter-group.com" },
        { brand: "GameChange Solar", model: "Genius Tracker Ground Mount", specs: "Single-axis tracker, 25% production gain, self-powered drive", unitPriceLow: 120, unitPriceHigh: 180, brandLink: "https://www.gamechangesolar.com" },
      ],
    },
    pole: {
      model: "Tamarack Solar Top-of-Pole Mount",
      brand: "Tamarack Solar", link: "https://www.tamaracksolar.com",
      specs: "4–9 panel single-arm, hot-dip galvanized, tilt angle adjustable every 5°, fits 4\"–6\" schedule 40 pipe",
      low: 60, high: 100,
      alts: [
        { brand: "MT Solar", model: "MT Solar Multi-Pole Top Mount", specs: "12–24 panel capacity, 3\" pipe, corrosion proof hardware, winter-tilt capable", unitPriceLow: 55, unitPriceHigh: 90, brandLink: "https://mtsolar.us" },
      ],
    },
    carport: {
      model: "Hsat Commercial Solar Carport Canopy",
      brand: "Commercial Structure / Custom Fab", link: "https://www.solarcarporthub.com",
      specs: "Single-row canopy, 12′–16′ clear height, HSS steel columns, integrated conduit channels, engineered stamped drawings",
      low: 250, high: 450,
      alts: [],
    },
  };
  const mountInfo = mountModels[p.installationType] ?? mountModels.roof;
  bom.push(item(
    "Racking & Mounting",
    mountType,
    mountInfo.model,
    mountInfo.specs,
    mountInfo.brand, mountInfo.link,
    `${p.numPanels} panel positions`,
    mountInfo.low, mountInfo.high, p.numPanels,
    `${p.installationType.charAt(0).toUpperCase() + p.installationType.slice(1)} mount for ${p.numPanels} panels. Includes rails, clamps, hardware, fasteners, and all flashings. ` +
    (p.installationType === "ground" ? "Footing type (driven screw vs concrete) depends on soil conditions — driven screws avoid concrete where frost-free." : "") +
    (p.installationType === "pole"   ? "Pole and concrete footing are separate from this kit (size pipe per manufacturer spec for wind zone)." : ""),
    mountInfo.alts,
  ));

  // ── 7. DC Combiner Box ────────────────────────────────────────────────────
  if (p.numPanels >= 4) {
    const circuits = Math.ceil(p.numPanels / 3);
    const combModel = circuits <= 6 ? "MidNite Solar MNPV6 6-Circuit Combiner" : "MidNite Solar MNPV12 12-Circuit Combiner";
    const combSpec  = circuits <= 6
      ? "6 circuits, MNEPV 10–15A string fuses, NEMA 3R enclosure, DIN rail"
      : "12 circuits, MNEPV 10–15A string fuses, NEMA 3R, wire management";
    bom.push(item(
      "Electrical Protection",
      `DC String Combiner Box — ${circuits}-Circuit`,
      combModel,
      combSpec,
      "MidNite Solar", "https://midnitesolar.com",
      "1 unit",
      circuits <= 6 ? 190 : 280, circuits <= 6 ? 280 : 400, 1,
      `${p.numPanels} panels across ${circuits} string${circuits > 1 ? "s" : ""} requires a combiner with overcurrent protection per NEC 690.9. ` +
      "MNEPV string fuses (10–15A per string) protect the wiring from reverse current.",
      [{
        brand: "SolarBOS", model: "SolarBOS 12-Circuit PV Combiner",
        specs: "12 circuits, DIN-rail fusing, NEMA 3R, surge protection optional",
        unitPriceLow: 200, unitPriceHigh: 320, brandLink: "https://www.solarbos.com",
      }],
    ));

    // String fuses (inside combiner)
    const strings = circuits;
    bom.push(item(
      "Electrical Protection",
      "DC String Fuses — MNEPV Series",
      `MidNite Solar MNEPV${String(Math.ceil(primaryPanel?.isc ?? 13) <= 13 ? 15 : 20)} Fuse (per string)`,
      `Rated ${Math.ceil((primaryPanel?.isc ?? 13) * 1.56)}A, 600VDC, DIN rail mount, UL listed`,
      "MidNite Solar", "https://midnitesolar.com",
      `${strings} fuses (1 per string)`,
      10, 18, strings,
      `One fuse per string sized to 156% of Isc per NEC 690.8. Protects array wiring from reverse-current damage.`,
    ));
  }

  // ── 8. DC Disconnect ──────────────────────────────────────────────────────
  bom.push(item(
    "Electrical Protection",
    "DC Solar Array Disconnect",
    "MidNite Solar MNCB-60 60A DC Disconnect",
    "60A, 600VDC, NEMA 3R, lockable handle, manual load-break",
    "MidNite Solar", "https://midnitesolar.com",
    "1 unit", 90, 140, 1,
    "Required by NEC 690.13 for rapid shutdown and service access. Mounted within sight of the array for code compliance.",
    [{
      brand: "Square D", model: "Square D DU222RB 60A Non-Fusible Safety Switch",
      specs: "60A, 240VAC/250VDC, NEMA 3R rainproof, lockable, load-break",
      unitPriceLow: 65, unitPriceHigh: 100, brandLink: "https://www.se.com",
    }],
  ));

  // ── 9. AC Disconnect / Load Center ────────────────────────────────────────
  bom.push(item(
    "Electrical Protection",
    "AC Output Disconnect & Breakers",
    "Square D QO Load Center + QO2xx Breaker",
    "Main lug or main breaker sub-panel, QO double-pole breaker for inverter output",
    "Square D (Schneider Electric)", "https://www.se.com",
    "1 lot",
    120, 280, 1,
    "AC disconnect between inverter and load panel per NEC 690.15. Includes sub-panel if back-feeding main service panel. " +
    "Back-feed breaker sized at 125% of inverter rated output per NEC 705.12.",
    [{
      brand: "Siemens", model: "Siemens P1224L1125CU + QP260 Breaker",
      specs: "125A main lug, 12-space, 24-circuit, with 60A 2-pole QP breaker",
      unitPriceLow: 140, unitPriceHigh: 250, brandLink: "https://usa.siemens.com",
    }],
  ));

  // ── 10. Rapid Shutdown (roof only) ────────────────────────────────────────
  if (p.installationType === "roof") {
    bom.push(item(
      "Safety Equipment",
      "Rapid Shutdown System",
      "Tigo TS4-A-O Transmitter + Receiver Kit",
      "NEC 2017/2020 690.12 compliant, per-module shutdown, Tigo cloud monitoring included",
      "Tigo Energy", "https://www.tigoenergy.com",
      `${p.numPanels} optimizers + 1 transmitter`,
      55, 85, p.numPanels,
      "Required by NEC 690.12 for all roof-mounted systems installed after January 2019. " +
      "Reduces PV conductor voltage to <30V within 30 seconds for firefighter safety.",
      [{
        brand: "Enphase", model: "Enphase IQ System Controller 2",
        specs: "Ensemble rapid shutdown, sunspec compliant, whole-home management",
        unitPriceLow: 320, unitPriceHigh: 480, brandLink: "https://enphase.com",
      }],
    ));
  }

  // ── 11. Wiring & Conduit ───────────────────────────────────────────────────
  // Estimate run distances: roof ~50ft DC + 30ft AC; ground ~100ft DC + 40ft AC; pole ~80ft DC + 40ft AC
  const dcRunFt    = p.installationType === "roof" ? 60 : p.installationType === "ground" ? 120 : 90;
  const acRunFt    = p.installationType === "roof" ? 35 : 50;
  const batCableFt = 15; // battery ↔ inverter

  // DC array wire: 10 AWG USE-2 PV wire, two conductors (+ and -)
  const dcWireTotal = dcRunFt * 2 * (p.numPanels <= 8 ? 1 : Math.ceil(p.numPanels / 8));
  const dcWireLow   = dcWireTotal * 0.28;
  const dcWireHigh  = dcWireTotal * 0.42;

  // AC output wire: gauge depends on inverter kW
  const acGauge   = p.inverterSizeKw <= 3.8 ? "10" : p.inverterSizeKw <= 7.6 ? "8" : "6";
  const acWireLow  = acRunFt * 3 * (acGauge === "10" ? 0.40 : acGauge === "8" ? 0.60 : 0.90);
  const acWireHigh = acRunFt * 3 * (acGauge === "10" ? 0.60 : acGauge === "8" ? 0.90 : 1.30);

  // Battery cables: 2/0 AWG or 4/0 AWG
  const batGauge     = p.inverterSizeKw <= 6 ? "2/0" : "4/0";
  const batWireLow   = batCableFt * 2 * (batGauge === "2/0" ? 3.20 : 5.50);
  const batWireHigh  = batCableFt * 2 * (batGauge === "2/0" ? 4.80 : 7.50);

  // MC4 connectors
  const mc4Pairs    = p.numPanels + 4; // extra for branch tees
  const mc4Low      = mc4Pairs * 1.50;
  const mc4High     = mc4Pairs * 3.00;

  // Conduit and fittings allowance
  const conduitLow  = (dcRunFt + acRunFt) * 0.80;
  const conduitHigh = (dcRunFt + acRunFt) * 1.60;

  const totalWireLow  = dcWireLow  + acWireLow  + batWireLow  + mc4Low  + conduitLow;
  const totalWireHigh = dcWireHigh + acWireHigh + batWireHigh + mc4High + conduitHigh;

  bom.push(item(
    "Wiring & Conduit",
    "Full System Wiring Package",
    `${dcWireTotal}ft 10 AWG USE-2 PV Wire + ${acGauge} AWG THWN-2 + ${batGauge} AWG Battery Cables`,
    `DC: ${dcWireTotal}ft 10 AWG USE-2/PV wire · AC: ${acGauge} AWG THWN-2 × ${acRunFt}ft · Battery: ${batGauge} AWG × ${batCableFt * 2}ft · MC4 connectors × ${mc4Pairs} pairs · EMT conduit & fittings`,
    "USE-2 / THWN-2 / UL Listed",
    undefined,
    "1 lot",
    Math.round(totalWireLow), Math.round(totalWireHigh), 1,
    `DC home run ~${dcRunFt}ft, AC output ~${acRunFt}ft, battery cables ~${batCableFt}ft each way. ` +
    `All conductors sized for 1.25× continuous duty per NEC 690.8. ${batGauge} AWG for battery bank minimizes voltage drop at high charge/discharge currents.`,
  ));

  // ── 12. Breakers & Fusing (array + battery side) ──────────────────────────
  const arrayCBamps  = Math.ceil(((primaryPanel?.isc ?? 13) * p.numPanels) / Math.max(1, Math.ceil(p.numPanels / 3)) * 1.56 / 5) * 5;
  const invACamps    = Math.ceil(p.inverterSizeKw * 1000 / 240 * 1.25 / 5) * 5;
  bom.push(item(
    "Electrical Protection",
    "Main Breakers & Fusing",
    `Square D QO ${invACamps}A 2-Pole + DC Busbar Fuse Set`,
    `${invACamps}A 2-pole AC breaker for inverter output · ${arrayCBamps}A DC branch circuit protection · 400–600VDC rated fuse holder`,
    "Square D / Eaton",
    "https://www.se.com",
    "1 lot",
    95, 280, 1,
    `AC breaker: ${invACamps}A = 125% × ${(p.inverterSizeKw * 1000 / 240).toFixed(0)}A inverter output per NEC 705.12. ` +
    `DC fusing per NEC 690.8 at 156% of short-circuit current (${arrayCBamps}A per string).`,
    [{
      brand: "Eaton", model: `Eaton BR ${invACamps}A Breaker + Bussmann GMT Series`,
      specs: `${invACamps}A 2-pole, 120/240VAC, type BR, 10kAIC + DC fuse holders`,
      unitPriceLow: 80, unitPriceHigh: 200, brandLink: "https://www.eaton.com",
    }],
  ));

  // ── 13. Grounding & Bonding ────────────────────────────────────────────────
  const groundRods   = 2;
  const gecFt        = 30; // grounding electrode conductor
  bom.push(item(
    "Grounding & Bonding",
    "Equipment Grounding System",
    `Erico Eritech ${groundRods}× 5/8″×8′ Copper Ground Rod + #6 AWG GEC`,
    `${groundRods} × 5/8″ × 8′ UL listed copper-clad ground rods · #6 AWG solid bare copper GEC ~${gecFt}ft · ILSCO GBL-4/0 grounding lugs · IronRidge bonding clips`,
    "Erico / ILSCO / IronRidge",
    "https://www.erico.com",
    "1 lot",
    120, 260, 1,
    `Two ground rods ≥6ft apart per NEC 250.53 creates a multi-rod grounding electrode system. ` +
    `#6 AWG GEC bonds array frame, inverter chassis, and battery enclosure per NEC 690.43. Module frames bonded with listed bonding hardware.`,
    [{
      brand: "Burndy", model: "Burndy YGHC Series + Cadweld XA Welds",
      specs: "Exothermic welds at rod-to-wire connections, waterproof, permanent bond",
      unitPriceLow: 140, unitPriceHigh: 300, brandLink: "https://burndy.com",
    }],
  ));

  // ── 14. Monitoring / Gateway ──────────────────────────────────────────────
  const monitorModel =
    p.systemType === "off-grid" || p.systemType === "hybrid"
      ? { model: "Victron Cerbo GX + Touch 70 Display", specs: "MQTT/Modbus/VE.Can hub, 7″ color touch display, VRM portal cloud monitoring", brand: "Victron", link: "https://www.victronenergy.com/panel-systems-remote-monitoring/cerbo-gx", low: 320, high: 430 }
      : { model: "Enphase IQ Gateway (Envoy-S)", specs: "Real-time panel-level production data, Enphase Enlighten cloud, ANSI C12.20 revenue grade meter", brand: "Enphase", link: "https://enphase.com/homeowners/monitoring", low: 150, high: 260 };
  bom.push(item(
    "Monitoring",
    "System Monitor / Gateway",
    monitorModel.model,
    monitorModel.specs,
    monitorModel.brand, monitorModel.link,
    "1 unit",
    monitorModel.low, monitorModel.high, 1,
    "Real-time visibility into production, consumption, battery SOC, and grid import/export. " +
    "Remote alerts for faults or underperformance. " +
    (p.systemType === "off-grid" ? "Cerbo GX integrates with Victron MPPT, MultiPlus/Quattro, and BMS via VE.Direct / VE.Can." : "Envoy tracks per-panel output and feeds Enphase Enlighten cloud portal."),
    p.systemType !== "off-grid" ? [{
      brand: "Victron", model: "Victron Cerbo GX",
      specs: "Universal gateway for Victron ecosystem, VRM portal, touch display optional",
      unitPriceLow: 220, unitPriceHigh: 320, brandLink: "https://www.victronenergy.com/panel-systems-remote-monitoring/cerbo-gx",
    }] : [{
      brand: "Enphase", model: "Enphase IQ Combiner 4C",
      specs: "Combiner + gateway in one unit, production CT sensor included",
      unitPriceLow: 180, unitPriceHigh: 300, brandLink: "https://enphase.com",
    }],
  ));

  return bom;
}
