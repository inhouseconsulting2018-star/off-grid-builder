export interface DesignNote {
  title: string;
  body: string;
  type: "info" | "warning" | "tip";
}

interface NotesInputs {
  systemType: string;
  annualKwh: number;
  dailyKwh: number;
  adjustedArraySizeKw: number;
  numPanels: number;
  panelWattage: number;
  peakSunHours: number;
  batteryUsableKwh: number;
  totalBatteryBankKwh: number;
  backupHours: number;
  customBackupHours?: number | null;
  totalSystemLossPct: number;
  shadeLossPct: number;
  shadeLevel: string;
  budgetTier: string;
  state: string;
  snowArea: boolean;
  highWindArea: boolean;
  installationType: string;
  inverterSizeKw: number;
  yearlyProductionKwh: number;
  paybackYears?: number | null;
  utilityRatePerKwh: number;
}

export function generateDesignNotes(p: NotesInputs): DesignNote[] {
  const notes: DesignNote[] = [];
  const backupHrs = p.customBackupHours && p.customBackupHours > 0 ? p.customBackupHours : p.backupHours;
  const hasBattery = backupHrs > 0;

  // 1. Why this system size?
  notes.push({
    title: "Why This System Size Was Selected",
    type: "info",
    body: `Your property uses approximately ${p.dailyKwh.toFixed(1)} kWh per day (${p.annualKwh.toLocaleString()} kWh/year). Using ${p.peakSunHours} peak sun hours and the required 0.78 performance factor, the design rounds up to a ${p.adjustedArraySizeKw.toFixed(2)} kW array — ${p.numPanels} panels at ${p.panelWattage}W each — to meet the preliminary annual energy target.`,
  });

  // 2. Battery backup explanation
  if (hasBattery) {
    notes.push({
      title: `Battery Backup: ${backupHrs}-Hour Runtime`,
      type: "info",
      body: `The battery bank is sized to provide ${p.batteryUsableKwh.toFixed(1)} kWh of usable energy, supporting approximately ${backupHrs} hours of your average daily load (${p.dailyKwh.toFixed(1)} kWh/day). The total bank is ${p.totalBatteryBankKwh.toFixed(1)} kWh at 80% depth of discharge (DoD). LiFePO4 chemistry is recommended — it maintains flat voltage discharge and supports 3,000–6,000 cycles at 80% DoD, translating to 10–15 years of daily cycling.`,
    });
  } else {
    notes.push({
      title: "No Battery Storage Selected",
      type: "info",
      body: `This design does not include battery storage. For a ${p.systemType} system with no backup, all excess production feeds to the grid and power is drawn from the grid at night or during low-production periods. If backup power is important, consider adding at least 12–24 hours of battery capacity in a future phase.`,
    });
  }

  // 3. System type explanation
  const systemDescriptions: Record<string, string> = {
    "off-grid": `This is a fully off-grid design — there is no utility grid connection. All power must be generated and stored on-site. The inverter/charger operates in island mode, regulating voltage and frequency independently. Critical considerations: the battery bank must be large enough to carry loads through consecutive cloudy days, and a backup generator is strongly recommended for extended low-production periods (winter, storms).`,
    "grid-tied": `This is a grid-tied design — solar production offsets your utility consumption and excess generation exports to the grid (where net metering applies). The system does not operate during a utility outage unless a battery + automatic transfer switch is added later. Grid-tied systems have the lowest equipment cost and simplest installation.`,
    "hybrid": `This is a hybrid design — the system can store energy in batteries and interact with the utility grid. During grid outages, the inverter seamlessly switches to battery backup. The battery bank can be charged by solar, the grid, or both. This is the most flexible option and supports future expansion.`,
  };

  notes.push({
    title: `System Configuration: ${p.systemType.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("-")}`,
    type: "info",
    body: systemDescriptions[p.systemType] || "Contact a licensed solar professional for system type guidance.",
  });

  // 4. Assumptions used
  notes.push({
    title: "Design Assumptions",
    type: "info",
    body: [
      `• Peak sun hours: ${p.peakSunHours} hrs/day (based on ${p.state} average)`,
      `• Panel wattage: ${p.panelWattage}W`,
      `• Proposal performance factor: 0.78 (${p.totalSystemLossPct.toFixed(1)}% aggregate allowance)`,
      `• Battery depth of discharge: 80% usable capacity`,
      `• Utility rate used: $${p.utilityRatePerKwh.toFixed(3)}/kWh`,
      `• Equipment tier: ${p.budgetTier.charAt(0).toUpperCase() + p.budgetTier.slice(1)}`,
      `• Estimated production: ${p.yearlyProductionKwh.toLocaleString()} kWh/year`,
      p.paybackYears ? `• Estimated payback: ${p.paybackYears.toFixed(1)} years (installed cost basis)` : "",
    ].filter(Boolean).join("\n"),
  });

  // 5. What needs professional verification
  notes.push({
    title: "What a Licensed Professional Must Verify",
    type: "warning",
    body: [
      "• Structural load capacity of roof or ground for racking system",
      "• Electrical service panel size and available backfeed breaker space",
      "• Local utility interconnection requirements and net metering rules",
      "• AHJ (Authority Having Jurisdiction) permit requirements",
      "• Local building, electrical, and fire codes (NEC 690, IFC)",
      p.installationType === "roof" ? "• Roof condition, age, and waterproofing requirements before racking penetrations" : "",
      p.snowArea ? "• Snow load ratings for racking — engineering stamp may be required" : "",
      p.highWindArea ? "• Wind load compliance — structural engineer review recommended" : "",
      hasBattery ? "• Battery enclosure ventilation, thermal management, and fire separation" : "",
      "• Final equipment selection, conductor sizing, and protection device ratings",
    ].filter(Boolean).join("\n"),
  });

  // 6. Shading note
  if (p.shadeLossPct > 0) {
    notes.push({
      title: `Shading Impact: ${p.shadeLossPct}% Production Loss`,
      type: p.shadeLossPct >= 15 ? "warning" : "tip",
      body: p.shadeLossPct >= 15
        ? `Your site has ${p.shadeLevel} shading, causing an estimated ${p.shadeLossPct}% reduction in production. This is significant. Consider microinverters (Enphase IQ8) or DC power optimizers (SolarEdge) instead of a string inverter — these mitigate the impact of partial shading by independently maximizing each panel's output. A shading analysis tool such as SunEye or SolarPathfinder should be used during site assessment.`
        : `Your site has light shading (${p.shadeLossPct}% loss). This is manageable, but optimal panel placement to avoid even partial shading during peak sun hours (10am–3pm) will improve yield. Consider microinverters or optimizers if any panels are shaded for more than 1 hour during peak times.`,
    });
  }

  // 7. Payback / financial note
  if (p.systemType !== "off-grid" && p.paybackYears) {
    notes.push({
      title: "Financial Return Estimate",
      type: "tip",
      body: `At $${p.utilityRatePerKwh.toFixed(3)}/kWh, this system is estimated to generate approximately ${p.yearlyProductionKwh.toLocaleString()} kWh/year in savings. The estimated payback period is ${p.paybackYears.toFixed(1)} years based on installed pricing. Actual payback may be improved by federal Investment Tax Credit (ITC — currently 30%), state incentives, SREC markets, and utility rate escalation. Consult a tax professional for ITC eligibility.`,
    });
  }

  return notes;
}
