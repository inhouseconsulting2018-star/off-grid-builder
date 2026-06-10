import type { Project } from "@workspace/db";
import { generateBom } from "./bom";

type Calc = Record<string, any>;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function range(value: unknown, spreadPct: number, minSpread: number, decimals = 0) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const spread = Math.max(Math.abs(numeric) * spreadPct, minSpread);
  const factor = 10 ** decimals;
  return {
    low: Math.max(0, Math.floor((numeric - spread) * factor) / factor),
    high: Math.ceil((numeric + spread) * factor) / factor,
  };
}

function systemRecommendation(systemType: unknown, installationType: unknown) {
  const system = typeof systemType === "string" ? systemType : "solar";
  const mount = installationType === "ground" ? "ground-mount" : "roof-mount";
  if (system === "off-grid") return `Off-grid ${mount} solar with battery storage`;
  if (system === "hybrid") return `Hybrid ${mount} solar with battery backup`;
  return `Grid-tied ${mount} solar`;
}

export function buildPreview(project: Project) {
  const calc = project.calculationResult as Calc | null;
  return {
    id: project.id,
    name: project.name,
    address: project.address,
    city: project.city,
    state: project.state,
    zip: project.zip,
    installationType: project.installationType,
    systemType: project.systemType,
    budgetTier: project.budgetTier,
    createdAt: project.createdAt,
    paidAt: project.paidAt,
    purchaserEmail: project.purchaserEmail,
    reportDeliveryStatus: project.reportDeliveryStatus,
    lat: project.lat,
    lon: project.lon,
    arrayLat: project.arrayLat,
    arrayLon: project.arrayLon,
    locationAccuracy: project.locationAccuracy,
    preview: calc
      ? {
          systemSizeKwRange: range(calc.adjustedArraySizeKw, 0.12, 0.5, 1),
          panelCountRange: range(calc.numPanels, 0.12, 2),
          yearlyProductionKwhRange: range(calc.yearlyProductionKwh, 0.15, 750),
          costRange: {
            low: Math.max(0, Math.round(calc.installedCostLow ?? 0)),
            high: Math.max(0, Math.round(calc.installedCostHigh ?? 0)),
          },
          estimatedYearlySavingsRange: range(calc.estimatedYearlySavings, 0.2, 250),
          basicSystemRecommendation: systemRecommendation(project.systemType, project.installationType),
          productionEstimateLabel: calc.productionEstimateLabel,
        }
      : null,
  };
}

export function buildPaidReport(project: Project) {
  const calc = project.calculationResult as Calc | null;
  if (!calc) return null;
  const { accessToken: _accessToken, ...safeProject } = project;

  const bom = generateBom({
    systemType: project.systemType,
    installationType: project.installationType,
    budgetTier: project.budgetTier,
    numPanels: calc.numPanels,
    adjustedArraySizeKw: calc.adjustedArraySizeKw,
    inverterSizeKw: calc.inverterSizeKw,
    totalBatteryBankKwh: calc.totalBatteryBankKwh,
    batteryUsableKwh: calc.batteryUsableKwh,
    batteryChemistry: project.batteryChemistry,
    hasGenerator: project.hasGenerator,
    generatorKw: project.generatorKw,
    wantsGenerator: project.wantsGenerator,
    snowArea: project.snowArea,
    recommendedPanelBrand: calc.recommendedPanelBrand,
    recommendedInverterBrand: calc.recommendedInverterBrand,
    recommendedBatteryBrand: calc.recommendedBatteryBrand,
    recommendedMountingBrand: calc.recommendedMountingBrand,
    diyEquipmentCostLow: calc.diyEquipmentCostLow,
    diyEquipmentCostHigh: calc.diyEquipmentCostHigh,
  });

  const pvwattsMonthly = Array.isArray(calc.pvwattsMonthlyKwh) ? calc.pvwattsMonthlyKwh : null;
  const monthlyChartData = pvwattsMonthly?.map((kwh: number, i: number) => ({
    month: MONTH_NAMES[i],
    kwh,
    solrad: Array.isArray(calc.pvwattsSolradMonthly) ? Math.round(calc.pvwattsSolradMonthly[i] * 10) / 10 : null,
  })) ?? null;

  return {
    project: safeProject,
    calculation: calc,
    bom,
    bomCategories: Array.from(new Set(bom.map((item) => item.category))),
    monthlyChartData,
    entitlement: {
      paidAt: project.paidAt,
      stripeSessionId: project.stripeSessionId,
      reportDeliveryStatus: project.reportDeliveryStatus,
      reportDeliveredAt: project.reportDeliveredAt,
    },
  };
}

export function renderReportPdfHtml(report: NonNullable<ReturnType<typeof buildPaidReport>>): string {
  const { project, calculation: calc, bom, monthlyChartData } = report;
  const annualProduction = calc.pvwattsAnnualKwh ?? calc.yearlyProductionKwh;
  const equipmentRows = bom.map((item) => `
    <tr>
      <td>${escapeHtml(item.category)}</td>
      <td><strong>${escapeHtml(item.model)}</strong><br><span>${escapeHtml(item.specs)}</span></td>
      <td>${escapeHtml(item.qty)}</td>
      <td>${escapeHtml(item.totalPrice)}</td>
    </tr>
  `).join("");
  const chartBars = (monthlyChartData ?? []).map((row) => `
    <div class="bar"><div style="height:${Math.max(8, row.kwh / Math.max(1, annualProduction / 8) * 100)}%"></div><span>${row.month}</span></div>
  `).join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(project.name)} Solar Proposal</title>
      <style>
        body { font-family: Inter, Arial, sans-serif; color: #172033; margin: 36px; line-height: 1.45; }
        h1 { font-size: 32px; margin: 0 0 6px; }
        h2 { font-size: 18px; margin-top: 28px; border-bottom: 2px solid #f97316; padding-bottom: 6px; }
        .brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .logo { border: 2px solid #f97316; padding: 10px 14px; font-weight: 800; color: #f97316; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
        .metric { background: #fff7ed; border: 1px solid #fed7aa; padding: 14px; border-radius: 8px; }
        .metric span { display: block; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; }
        .metric strong { display: block; font-size: 18px; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: 8px; vertical-align: top; }
        th { background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; }
        .chart { display: flex; align-items: end; height: 160px; gap: 8px; border: 1px solid #e5e7eb; padding: 10px; }
        .bar { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: end; align-items: center; gap: 4px; font-size: 10px; }
        .bar div { width: 100%; background: #f97316; border-radius: 4px 4px 0 0; }
        .disclaimer { font-size: 11px; color: #64748b; background: #f8fafc; padding: 12px; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div class="brand">
        <div>
          <div style="font-size:12px;color:#f97316;text-transform:uppercase;letter-spacing:.08em;font-weight:800;">Contractor-Grade Solar Proposal</div>
          <h1>${escapeHtml(project.name)}</h1>
          <div>${escapeHtml(project.address)}, ${escapeHtml(project.city)}, ${escapeHtml(project.state)} ${escapeHtml(project.zip)}</div>
        </div>
        <div class="logo">OFFGRID SOLAR BUILDER</div>
      </div>
      <div class="grid">
        <div class="metric"><span>Array</span><strong>${calc.adjustedArraySizeKw.toFixed(2)} kW DC</strong></div>
        <div class="metric"><span>Panels</span><strong>${calc.numPanels}</strong></div>
        <div class="metric"><span>Annual Production</span><strong>${Math.round(annualProduction).toLocaleString()} kWh</strong></div>
        <div class="metric"><span>Payback</span><strong>${calc.paybackYears ? `${calc.paybackYears.toFixed(1)} yrs` : "N/A"}</strong></div>
      </div>
      <h2>Monthly Production</h2>
      <div class="chart">${chartBars}</div>
      <h2>Equipment List</h2>
      <table><thead><tr><th>Category</th><th>Equipment</th><th>Qty</th><th>Total</th></tr></thead><tbody>${equipmentRows}</tbody></table>
      <h2>Battery, Inverter, Losses, and ROI</h2>
      <table><tbody>
        <tr><td>Battery usable capacity</td><td>${calc.batteryUsableKwh?.toFixed?.(1) ?? "0.0"} kWh</td></tr>
        <tr><td>Total battery bank</td><td>${calc.totalBatteryBankKwh?.toFixed?.(1) ?? "0.0"} kWh</td></tr>
        <tr><td>Inverter sizing</td><td>${calc.inverterSizeKw.toFixed(1)} kW AC</td></tr>
        <tr><td>Total modeled losses</td><td>${calc.totalSystemLossPct.toFixed(1)}%</td></tr>
        <tr><td>Installed cost estimate</td><td>$${Math.round(calc.installedCostLow).toLocaleString()} - $${Math.round(calc.installedCostHigh).toLocaleString()}</td></tr>
        <tr><td>Annual savings</td><td>$${Math.round(calc.estimatedYearlySavings).toLocaleString()}</td></tr>
      </tbody></table>
      <h2>Assumptions and Disclaimers</h2>
      <p class="disclaimer">Preliminary planning estimate only. Final design should be verified by a licensed solar/electrical professional. This report is not a permit-ready engineering plan. Production, savings, equipment availability, incentives, and code requirements may vary.</p>
    </body>
  </html>`;
}

export function renderReportPdfBuffer(report: NonNullable<ReturnType<typeof buildPaidReport>>): Buffer {
  const { project, calculation: calc, bom, monthlyChartData } = report;
  const annualProduction = calc.pvwattsAnnualKwh ?? calc.yearlyProductionKwh;
  const bomTotal = bom.reduce(
    (total, item) => ({
      low: total.low + item.totalPriceLow,
      high: total.high + item.totalPriceHigh,
    }),
    { low: 0, high: 0 },
  );
  const lines: PdfLine[] = [];
  const add = (text: string, style: PdfLine["style"] = "body") => lines.push({ text, style });
  const heading = (text: string) => add(text, "heading");
  const subheading = (text: string) => add(text, "subheading");
  const detail = (label: string, value: unknown) => add(`${label}: ${value}`, "detail");

  add("OFFGRID SOLAR BUILDER", "brand");
  add("Detailed Solar Planning Report", "title");
  add(project.name, "subtitle");
  add(`${project.address}, ${project.city}, ${project.state} ${project.zip}`, "body");
  add(`Prepared ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, "muted");

  heading("Executive Summary");
  add(
    `This preliminary design recommends a ${calc.adjustedArraySizeKw.toFixed(2)} kW DC ${project.systemType} ` +
    `${project.installationType}-mount system using ${calc.numPanels} solar panels and a ` +
    `${calc.inverterSizeKw.toFixed(1)} kW AC inverter. Estimated annual production is ` +
    `${formatNumber(annualProduction)} kWh.`,
  );
  detail("System configuration", systemRecommendation(project.systemType, project.installationType));
  detail("Annual site energy use", `${formatNumber(project.annualKwh)} kWh`);
  detail("Average daily energy use", `${number(calc.dailyKwh, 1)} kWh/day`);
  detail("Recommended array", `${number(calc.adjustedArraySizeKw, 2)} kW DC`);
  detail("Solar panels", `${calc.numPanels} modules`);
  detail("Required mounting area", `${formatNumber(calc.squareFeetRequired)} sq ft`);
  detail("Recommended inverter", `${number(calc.inverterSizeKw, 1)} kW AC`);
  detail("Annual production estimate", `${formatNumber(annualProduction)} kWh`);
  detail("Production data source", calc.pvwattsSource === "pvwatts" ? "NREL PVWatts" : "State-level fallback estimate");
  detail("Installed cost range", `${money(calc.installedCostLow)} - ${money(calc.installedCostHigh)}`);
  detail("DIY equipment range", `${money(calc.diyEquipmentCostLow)} - ${money(calc.diyEquipmentCostHigh)}`);
  detail("Estimated annual savings", money(calc.estimatedYearlySavings));
  detail("Simple payback", calc.paybackYears ? `${number(calc.paybackYears, 1)} years` : "Not applicable");

  heading("Project Inputs and Design Basis");
  detail("System type", project.systemType);
  detail("Installation type", project.installationType);
  detail("Budget tier", project.budgetTier);
  detail("Roof direction", project.roofDirection || "Not provided");
  detail("Roof pitch", project.roofPitch || "Not provided");
  detail("Shade level", project.shadeLevel);
  detail("Utility rate", `$${number(project.utilityRatePerKwh, 3)}/kWh`);
  detail("Backup requirement", project.backupHours > 0 ? `${project.backupHours} hours` : "No battery backup selected");
  detail("Battery chemistry", project.batteryChemistry || "None");
  detail("Location accuracy", project.locationAccuracy || "Not recorded");
  add("Sizing is based on the submitted annual usage, site location, mounting choice, shading, backup requirement, and equipment tier.", "muted");

  heading("System Sizing Calculations");
  detail("Raw array requirement", `${number(calc.arraySizeKw, 2)} kW DC before design adjustments`);
  detail("Final adjusted array", `${number(calc.adjustedArraySizeKw, 2)} kW DC`);
  detail("Peak sun hours", `${number(calc.peakSunHours, 2)} hours/day`);
  detail("Design peak sun hours", `${number(calc.designPeakSunHours ?? calc.peakSunHours, 2)} hours/day`);
  detail("Panel count", `${calc.numPanels}`);
  detail("Inverter continuous rating", `${number(calc.inverterSizeKw, 1)} kW AC`);
  detail("DC-to-AC ratio", number(calc.adjustedArraySizeKw / Math.max(calc.inverterSizeKw, 0.1), 2));
  detail("Modeled total losses", `${number(calc.totalSystemLossPct, 1)}%`);
  detail("PV production losses", `${number(calc.pvProductionLossPct, 1)}%`);
  detail("Shade loss", `${number(calc.shadeLossPct, 1)}%`);
  detail("Wire loss", `${number(calc.wireLossPct, 1)}%`);
  detail("Inverter loss", `${number(calc.inverterLossPct, 1)}%`);
  detail("Temperature loss", `${number(calc.tempLossPct, 1)}%`);
  detail("Soiling loss", `${number(calc.dirtLossPct, 1)}%`);

  heading("Monthly Production Estimate");
  if (monthlyChartData?.length) {
    monthlyChartData.forEach((row) => {
      add(
        `${row.month.padEnd(3)}   ${formatNumber(row.kwh).padStart(7)} kWh` +
        `${row.solrad != null ? `   Solar resource ${number(row.solrad, 1)} kWh/m2/day` : ""}`,
        "mono",
      );
    });
  } else {
    add("Monthly production data was not available for this calculation.", "muted");
  }

  heading("Battery and Backup Design");
  if ((calc.totalBatteryBankKwh ?? 0) > 0) {
    detail("Usable battery capacity", `${number(calc.batteryUsableKwh, 1)} kWh`);
    detail("Total nameplate bank", `${number(calc.totalBatteryBankKwh, 1)} kWh`);
    detail("Autonomy", `${number(calc.batteryAutonomyDays, 1)} days`);
    detail("Effective depth of discharge", `${number(calc.batteryEffectiveDodPct, 0)}%`);
    detail("Energy reserve", `${number(calc.batteryEnergyReservePct, 0)}%`);
    detail("Inverter efficiency assumption", `${number(calc.batteryInverterEfficiencyPct, 1)}%`);
    detail("Cold-weather derating", `${number(calc.batteryColdDeratingPct, 0)}%`);
  } else {
    add("No battery storage was selected. This system will not provide backup power during a utility outage unless storage and transfer equipment are added.", "body");
  }

  heading("Cost and Financial Overview");
  detail("Solar equipment estimate", `${money(calc.solarArrayDiyCostLow)} - ${money(calc.solarArrayDiyCostHigh)}`);
  detail("Battery equipment estimate", `${money(calc.batteryDiyCostLow)} - ${money(calc.batteryDiyCostHigh)}`);
  detail("Complete BOM estimate", `${money(bomTotal.low)} - ${money(bomTotal.high)}`);
  detail("Installed project estimate", `${money(calc.installedCostLow)} - ${money(calc.installedCostHigh)}`);
  detail("Estimated annual savings", money(calc.estimatedYearlySavings));
  detail("Simple payback before incentives", calc.paybackYears ? `${number(calc.paybackYears, 1)} years` : "Not applicable");
  add("Equipment pricing is a planning range and excludes site-specific engineering, permitting, taxes, freight, trenching, roofing work, utility upgrades, and contractor labor unless explicitly included.", "muted");

  heading("Detailed Bill of Materials");
  add(`Estimated equipment total: ${money(bomTotal.low)} - ${money(bomTotal.high)}`, "callout");
  bom.forEach((item, index) => {
    subheading(`${index + 1}. ${item.category} - ${item.item}`);
    detail("Recommended", `${item.brand} ${item.model}`);
    detail("Quantity", item.qty);
    detail("Specifications", item.specs);
    detail("Estimated unit price", item.unitPrice);
    detail("Estimated total", item.totalPrice);
    add(`Why included: ${item.reason}`, "body");
    if (item.alternatives?.length) {
      add(
        `Alternatives: ${item.alternatives.map((alternative) => `${alternative.brand} ${alternative.model}`).join("; ")}`,
        "muted",
      );
    }
  });

  heading("Engineering Flags and Recommendations");
  const engineeringNotes = Array.isArray(calc.notes) ? calc.notes : [];
  if (engineeringNotes.length) {
    engineeringNotes.forEach((note: unknown) => add(String(note), "bullet"));
  } else {
    add("No additional calculation flags were generated.", "body");
  }
  add("Confirm final conductor sizes, overcurrent protection, rapid shutdown, grounding, structural loading, equipment compatibility, utility interconnection, and local code requirements with licensed professionals.", "bullet");

  heading("Recommended Next Steps");
  add("Obtain a site survey confirming usable roof or ground-mount area, azimuth, tilt, shading, structural capacity, and equipment locations.", "numbered");
  add("Have a licensed solar/electrical professional verify the final one-line diagram, string sizing, conductor ampacity, voltage drop, disconnects, grounding, and protection devices.", "numbered");
  add("Request itemized contractor quotes using this system size and equipment list so proposals can be compared on equal terms.", "numbered");
  add("Confirm utility interconnection, net-metering rules, permit requirements, incentives, and tax-credit eligibility before purchasing equipment.", "numbered");

  heading("Important Disclaimer");
  add("Preliminary planning estimate only. Final design should be verified by a licensed solar/electrical professional.", "callout");
  add("This report is not a permit-ready engineering plan. Equipment quantities, conductor sizing, protection-device ratings, structural requirements, pricing, production, savings, incentives, and code requirements must be verified for the actual site.", "body");

  return makeDetailedPdf(lines);
}

type PdfLineStyle =
  | "brand"
  | "title"
  | "subtitle"
  | "heading"
  | "subheading"
  | "body"
  | "detail"
  | "muted"
  | "callout"
  | "bullet"
  | "numbered"
  | "mono";

type PdfLine = { text: string; style: PdfLineStyle };

function makeDetailedPdf(lines: PdfLine[]): Buffer {
  const pageStreams: string[] = [];
  let commands: string[] = [];
  let y = 744;
  let pageNumber = 1;
  let numberedIndex = 0;

  const beginPage = () => {
    commands = [
      "0.96 0.97 0.98 rg",
      "0 760 612 32 re f",
      "0.97 0.36 0.06 rg",
      "0 756 612 4 re f",
      "0.10 0.13 0.20 rg",
    ];
    y = 736;
  };
  const endPage = () => {
    commands.push(
      "BT",
      "/F1 8 Tf",
      "0.40 0.45 0.53 rg",
      `48 24 Td`,
      `(OffGrid Solar Builder - Detailed Planning Report) Tj`,
      `450 0 Td`,
      `(Page ${pageNumber}) Tj`,
      "ET",
    );
    pageStreams.push(commands.join("\n"));
    pageNumber += 1;
  };

  const styleConfig: Record<PdfLineStyle, { size: number; font: "F1" | "F2" | "F3"; color: string; before: number; after: number; indent: number }> = {
    brand: { size: 10, font: "F2", color: "0.97 0.36 0.06", before: 0, after: 5, indent: 0 },
    title: { size: 25, font: "F2", color: "0.10 0.13 0.20", before: 0, after: 7, indent: 0 },
    subtitle: { size: 15, font: "F2", color: "0.20 0.25 0.33", before: 0, after: 4, indent: 0 },
    heading: { size: 15, font: "F2", color: "0.10 0.13 0.20", before: 15, after: 7, indent: 0 },
    subheading: { size: 11, font: "F2", color: "0.12 0.28 0.45", before: 9, after: 3, indent: 0 },
    body: { size: 9.5, font: "F1", color: "0.15 0.18 0.24", before: 1, after: 3, indent: 0 },
    detail: { size: 9, font: "F1", color: "0.15 0.18 0.24", before: 0, after: 2, indent: 8 },
    muted: { size: 8.5, font: "F3", color: "0.38 0.43 0.50", before: 1, after: 3, indent: 0 },
    callout: { size: 10, font: "F2", color: "0.70 0.25 0.03", before: 4, after: 5, indent: 8 },
    bullet: { size: 9, font: "F1", color: "0.15 0.18 0.24", before: 1, after: 3, indent: 14 },
    numbered: { size: 9, font: "F1", color: "0.15 0.18 0.24", before: 1, after: 3, indent: 14 },
    mono: { size: 8.5, font: "F1", color: "0.18 0.23 0.30", before: 0, after: 2, indent: 16 },
  };

  const writeLine = (text: string, config: (typeof styleConfig)[PdfLineStyle], prefix = "") => {
    const wrapped = wrapPdfText(prefix + text, config.size, 516 - config.indent);
    const lineHeight = config.size * 1.35;
    const required = config.before + wrapped.length * lineHeight + config.after;
    if (y - required < 48) {
      endPage();
      beginPage();
    }
    y -= config.before;
    wrapped.forEach((row) => {
      commands.push(
        "BT",
        `/${config.font} ${config.size} Tf`,
        `${config.color} rg`,
        `${48 + config.indent} ${y.toFixed(2)} Td`,
        `(${escapePdfText(row)}) Tj`,
        "ET",
      );
      y -= lineHeight;
    });
    y -= config.after;
  };

  beginPage();
  lines.forEach((line) => {
    const config = styleConfig[line.style];
    let prefix = "";
    if (line.style === "bullet") prefix = "- ";
    if (line.style === "numbered") {
      numberedIndex += 1;
      prefix = `${numberedIndex}. `;
    }
    writeLine(line.text, config, prefix);
  });
  endPage();

  const pageObjectNumbers = pageStreams.map((_, index) => 5 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  pageStreams.forEach((content, index) => {
    const pageObject = 5 + index * 2;
    const contentObject = pageObject + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 3 0 R >> >> /Contents ${contentObject} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function wrapPdfText(value: string, fontSize: number, width: number): string[] {
  const normalized = asciiText(value);
  const maxChars = Math.max(18, Math.floor(width / (fontSize * 0.52)));
  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (next.length <= maxChars) {
      row = next;
      continue;
    }
    if (row) rows.push(row);
    row = word.length > maxChars ? word.slice(0, maxChars) : word;
  }
  if (row) rows.push(row);
  return rows;
}

function escapePdfText(value: string): string {
  return asciiText(value).replace(/[\\()]/g, "\\$&");
}

function asciiText(value: unknown): string {
  return String(value ?? "")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("•", "-")
    .replaceAll("×", "x")
    .replaceAll("²", "2")
    .replace(/[^\x20-\x7E]/g, "");
}

function number(value: unknown, decimals = 0): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(decimals) : "0";
}

function formatNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "0";
}

function money(value: unknown): string {
  return `$${formatNumber(value)}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
