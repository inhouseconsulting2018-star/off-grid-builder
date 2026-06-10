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
  const equipmentRows = bom.slice(0, 18).map((item) => `
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
        .logo { width: 86px; height: 54px; border: 2px solid #f97316; display: grid; place-items: center; font-weight: 800; color: #f97316; }
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
        <div class="logo">LOGO</div>
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

export function renderReportPdfBuffer(report: NonNullable<ReturnType<typeof buildPaidReport>>): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _pdfMod = require("pdfkit");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PDFDocument = (_pdfMod.default ?? _pdfMod) as any;
  const { project, calculation: calc, bom, monthlyChartData } = report;
  const annualProduction = calc.pvwattsAnnualKwh ?? calc.yearlyProductionKwh;

  const ORANGE = "#f97316";
  const DARK   = "#172033";
  const GRAY   = "#64748b";
  const LIGHT  = "#fff7ed";
  const BORDER = "#fed7aa";
  const L = 50;
  const R = 562;
  const W = R - L;

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 50, size: "LETTER", bufferPages: true });
  doc.on("data", (c: Buffer) => chunks.push(c));
  const pdfReady = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  function sectionHeader(title: string) {
    doc.moveDown(0.5);
    doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(ORANGE).lineWidth(1.5).stroke();
    doc.moveDown(0.3);
    doc.fontSize(13).fillColor(ORANGE).font("Helvetica-Bold").text(title.toUpperCase(), L, doc.y);
    doc.moveDown(0.4);
    doc.font("Helvetica").fillColor(DARK);
  }

  function row2(label: string, value: string, yPos?: number) {
    const y = yPos ?? doc.y;
    doc.fontSize(10).fillColor(GRAY).font("Helvetica").text(label, L, y, { width: W * 0.55 });
    doc.fontSize(10).fillColor(DARK).font("Helvetica-Bold").text(value, L + W * 0.57, y, { width: W * 0.43, align: "right" });
    doc.moveDown(0.4);
  }

  function metricBox(x: number, y: number, w: number, label: string, value: string) {
    doc.save();
    doc.rect(x, y, w, 52).fillAndStroke(LIGHT, BORDER);
    doc.fillColor(GRAY).fontSize(8).font("Helvetica").text(label.toUpperCase(), x + 8, y + 8, { width: w - 16 });
    doc.fillColor(DARK).fontSize(15).font("Helvetica-Bold").text(value, x + 8, y + 22, { width: w - 16 });
    doc.restore();
  }

  function pageFooter() {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fontSize(8).fillColor(GRAY).font("Helvetica")
        .text("OffGrid Solar Builder  •  offgridsolarbuilder.com  •  Preliminary planning estimate only",
          L, 740, { width: W, align: "center" })
        .text(`Page ${i + 1} of ${range.count}`, L, 752, { width: W, align: "center" });
    }
  }

  const systemLabel = (s: string) =>
    s === "off-grid" ? "Off-Grid with Battery Storage" :
    s === "hybrid"   ? "Hybrid Grid-Tie + Battery"     : "Grid-Tied";

  const mountLabel = (s: string) => s === "ground" ? "Ground Mount" : "Roof Mount";

  // ── PAGE 1: Header + Key Metrics + System Overview ─────────────────────────
  doc.rect(L - 10, 40, W + 20, 70).fill(ORANGE);
  doc.fontSize(22).fillColor("#ffffff").font("Helvetica-Bold")
     .text("OffGrid Solar Builder", L, 52, { width: W });
  doc.fontSize(11).fillColor("#ffe8d0").font("Helvetica")
     .text("Contractor-Grade Solar Proposal  •  offgridsolarbuilder.com", L, 76, { width: W });

  doc.y = 122;
  doc.fontSize(18).fillColor(DARK).font("Helvetica-Bold").text(String(project.name), L);
  doc.fontSize(11).fillColor(GRAY).font("Helvetica")
     .text(`${project.address}, ${project.city}, ${project.state} ${project.zip}  |  ${systemLabel(project.systemType ?? "")}  |  ${mountLabel(project.installationType ?? "")}`);
  doc.fontSize(9).fillColor(GRAY)
     .text(`Report generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}  •  Solar data: ${calc.pvwattsSource ?? "NREL PVWatts / state average"}`);

  doc.moveDown(1);
  const mw = (W - 18) / 4;
  const my = doc.y;
  metricBox(L,           my, mw, "Array Size",        `${calc.adjustedArraySizeKw.toFixed(2)} kW DC`);
  metricBox(L + mw + 6,  my, mw, "Panel Count",       `${calc.numPanels} panels`);
  metricBox(L + (mw+6)*2,my, mw, "Annual Production", `${Math.round(annualProduction).toLocaleString()} kWh`);
  metricBox(L + (mw+6)*3,my, mw, "Payback Est.",      calc.paybackYears ? `${calc.paybackYears.toFixed(1)} yrs` : "N/A");
  doc.y = my + 62;

  if (calc.batteryUsableKwh > 0) {
    const my2 = doc.y;
    metricBox(L,           my2, mw, "Battery Usable",    `${(calc.batteryUsableKwh ?? 0).toFixed(1)} kWh`);
    metricBox(L + mw + 6,  my2, mw, "Total Bank",        `${(calc.totalBatteryBankKwh ?? 0).toFixed(1)} kWh`);
    metricBox(L + (mw+6)*2,my2, mw, "Inverter Size",     `${calc.inverterSizeKw.toFixed(1)} kW AC`);
    metricBox(L + (mw+6)*3,my2, mw, "Autonomy Days",     calc.batteryAutonomyDays ? `${Number(calc.batteryAutonomyDays).toFixed(1)} days` : "—");
    doc.y = my2 + 62;
  }

  sectionHeader("System Overview");
  row2("System type",            systemLabel(project.systemType ?? ""));
  row2("Installation",           mountLabel(project.installationType ?? ""));
  row2("Budget tier",            String(project.budgetTier ?? "mid-range"));
  row2("Shade level",            String(project.shadeLevel ?? "none"));
  row2("Available area",         project.availableSqft ? `${project.availableSqft.toLocaleString()} sq ft` : "—");
  row2("Array required",         calc.squareFeetRequired ? `${Math.round(calc.squareFeetRequired).toLocaleString()} sq ft` : "—");
  row2("Annual load",            project.annualKwh ? `${project.annualKwh.toLocaleString()} kWh` : "—");
  row2("Daily average load",     `${(calc.dailyKwh ?? 0).toFixed(1)} kWh`);
  row2("Peak sun hours",         `${(calc.peakSunHours ?? calc.designPeakSunHours ?? 0).toFixed(2)} hrs/day`);
  if (calc.batteryUsableKwh > 0) {
    row2("Backup hours target",  project.backupHours ? `${project.backupHours} hrs` : "—");
    row2("Autonomy days",        calc.batteryAutonomyDays ? `${Number(calc.batteryAutonomyDays).toFixed(1)} days` : "—");
    row2("Battery chemistry",    String(project.batteryChemistry ?? "LiFePO4"));
  }

  // ── PAGE 2: Cost + Monthly Production ──────────────────────────────────────
  doc.addPage();

  sectionHeader("Cost Estimates");
  row2("Installed cost (professional)", `$${Math.round(calc.installedCostLow).toLocaleString()} – $${Math.round(calc.installedCostHigh).toLocaleString()}`);
  row2("DIY equipment only",            `$${Math.round(calc.diyEquipmentCostLow ?? 0).toLocaleString()} – $${Math.round(calc.diyEquipmentCostHigh ?? 0).toLocaleString()}`);
  if (calc.batteryUsableKwh > 0) {
    row2("Solar array (installed)",     `$${Math.round(calc.solarArrayInstalledCostLow ?? 0).toLocaleString()} – $${Math.round(calc.solarArrayInstalledCostHigh ?? 0).toLocaleString()}`);
    row2("Battery system (installed)",  `$${Math.round(calc.batteryInstalledCostLow ?? 0).toLocaleString()} – $${Math.round(calc.batteryInstalledCostHigh ?? 0).toLocaleString()}`);
  }
  row2("Used/refurb equipment est.",    `$${Math.round(calc.usedSolarEquipCostLow ?? 0).toLocaleString()} – $${Math.round(calc.usedSolarEquipCostHigh ?? 0).toLocaleString()}`);
  if (project.systemType !== "off-grid") {
    row2("Est. annual savings",         `$${Math.round(calc.estimatedYearlySavings ?? 0).toLocaleString()}/yr`);
    row2("Simple payback",              calc.paybackYears ? `${calc.paybackYears.toFixed(1)} years` : "N/A");
  }
  row2("Utility rate used",             `$${(project.utilityRatePerKwh ?? 0).toFixed(3)}/kWh`);

  sectionHeader("System Loss Breakdown");
  row2("Total modeled losses",          `${(calc.totalSystemLossPct ?? 0).toFixed(1)}%`);
  row2("Shade loss",                    `${(calc.shadeLossPct ?? 0).toFixed(1)}%`);
  row2("Temperature loss",              `${(calc.tempLossPct ?? 0).toFixed(1)}%`);
  row2("Wiring loss",                   `${(calc.wireLossPct ?? 0).toFixed(1)}%`);
  row2("Dirt/soiling loss",             `${(calc.dirtLossPct ?? 0).toFixed(1)}%`);
  row2("Inverter efficiency loss",      `${(calc.inverterLossPct ?? 0).toFixed(1)}%`);
  row2("Mismatch loss",                 `${(calc.misMatchLossPct ?? 0).toFixed(1)}%`);
  if (calc.batteryUsableKwh > 0) {
    row2("Battery round-trip loss",     `${(calc.batteryLossPct ?? 0).toFixed(1)}%`);
    row2("Battery effective DoD",       `${(calc.batteryEffectiveDodPct ?? 0).toFixed(0)}%`);
    row2("Cold derating",               `${(calc.batteryColdDeratingPct ?? 0).toFixed(0)}%`);
    row2("Temp derating",               `${(calc.batteryTempDeratingPct ?? 0).toFixed(0)}%`);
  }

  if (monthlyChartData && monthlyChartData.length === 12) {
    sectionHeader("Monthly Solar Production");
    const maxKwh = Math.max(...monthlyChartData.map((r) => r.kwh ?? 0), 1);
    const chartTop = doc.y;
    const chartH = 90;
    const barW = (W - 2) / 12;
    doc.rect(L, chartTop, W, chartH + 22).fillAndStroke("#f8fafc", "#e5e7eb");
    monthlyChartData.forEach((row, i) => {
      const barH = Math.max(4, ((row.kwh ?? 0) / maxKwh) * chartH * 0.85);
      const bx = L + 1 + i * barW;
      const by = chartTop + chartH - barH + 4;
      doc.rect(bx + 2, by, barW - 4, barH).fill(ORANGE);
      doc.fontSize(7).fillColor(GRAY).font("Helvetica")
         .text(row.month, bx, chartTop + chartH + 7, { width: barW, align: "center" });
      doc.fontSize(7).fillColor(DARK)
         .text(`${Math.round(row.kwh ?? 0)}`, bx, by - 11, { width: barW, align: "center" });
    });
    doc.y = chartTop + chartH + 22;
    doc.moveDown(0.5);
    const annualLabel = `Annual PVWatts production: ${Math.round(calc.pvwattsAnnualKwh ?? annualProduction).toLocaleString()} kWh  |  Annual solar radiation: ${(calc.pvwattsSolradAnnual ?? 0).toFixed(2)} kWh/m²/day`;
    doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(annualLabel, L, doc.y, { width: W, align: "center" });
    doc.moveDown(0.5);
  }

  // ── PAGE 3: Equipment BOM ───────────────────────────────────────────────────
  doc.addPage();
  sectionHeader("Equipment & Bill of Materials");

  const colX  = [L, L + 140, L + 310, L + 420, L + 490];
  const colW  = [140, 170, 110, 70, 72];
  const heads = ["Category", "Model / Description", "Specs", "Qty", "Est. Price"];

  doc.rect(L, doc.y, W, 18).fill("#f1f5f9");
  heads.forEach((h, i) => {
    doc.fontSize(8).fillColor(GRAY).font("Helvetica-Bold")
       .text(h, colX[i], doc.y - 14, { width: colW[i] });
  });
  doc.moveDown(0.1);
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
  doc.moveDown(0.3);

  bom.forEach((item, idx) => {
    if (doc.y > 680) { doc.addPage(); }
    const rowY = doc.y;
    if (idx % 2 === 0) doc.rect(L, rowY - 2, W, 30).fill("#fafafa");
    const cells = [item.category, item.model, item.specs, item.qty, item.totalPrice];
    cells.forEach((cell, i) => {
      doc.fontSize(8.5).fillColor(DARK).font(i === 1 ? "Helvetica-Bold" : "Helvetica")
         .text(String(cell ?? ""), colX[i], rowY, { width: colW[i] - 4, lineBreak: false });
    });
    doc.moveDown(1.0);
    doc.moveTo(L, doc.y - 2).lineTo(R, doc.y - 2).strokeColor("#f1f5f9").lineWidth(0.3).stroke();
  });

  // Recommended brands
  doc.moveDown(0.5);
  sectionHeader("Recommended Brands (for this system size & budget)");
  if (calc.recommendedPanelBrand)   row2("Solar panels",   String(calc.recommendedPanelBrand));
  if (calc.recommendedInverterBrand) row2("Inverter/charger", String(calc.recommendedInverterBrand));
  if (calc.recommendedBatteryBrand)  row2("Battery",        String(calc.recommendedBatteryBrand));
  if (calc.recommendedMountingBrand) row2("Mounting",       String(calc.recommendedMountingBrand));

  // ── PAGE 4: Planning Notes + Disclaimer ────────────────────────────────────
  if (Array.isArray(calc.notes) && calc.notes.length > 0) {
    doc.addPage();
    sectionHeader("Planning Notes & Assumptions");
    (calc.notes as string[]).forEach((note) => {
      doc.fontSize(9.5).fillColor(DARK).font("Helvetica")
         .text(`• ${note}`, L + 10, doc.y, { width: W - 10 });
      doc.moveDown(0.4);
    });
  }

  if (doc.y > 630) doc.addPage();
  sectionHeader("Disclaimers");
  doc.fontSize(9).fillColor(DARK).font("Helvetica").text(
    "Preliminary planning estimate only. This report is intended to support early-stage feasibility analysis and project scoping. " +
    "Final system design, sizing, equipment selection, structural loading, electrical code compliance, and permitting must be verified and " +
    "engineered by a licensed solar and electrical professional in your jurisdiction.\n\n" +
    "Production estimates are based on PVWatts v8 solar irradiance data (NREL) or state-average fallback values. Actual system " +
    "performance may vary due to local shading, weather, equipment degradation, installation quality, and other factors.\n\n" +
    "Cost estimates are indicative ranges based on typical market pricing as of the report date and may vary significantly by region, " +
    "installer, supply availability, and incentive programs. This report is not a quote, contract, or permit-ready engineering plan.\n\n" +
    "Battery autonomy and backup calculations assume average daily load. Actual backup performance depends on load profile, " +
    "temperature, battery state of health, and usage patterns.\n\n" +
    "Federal, state, and local incentives (ITC, SGIP, net metering, etc.) are not included in cost or payback estimates unless noted. " +
    "Consult a tax professional and your local utility regarding applicable programs.",
    L, doc.y, { width: W }
  );

  pageFooter();
  doc.end();

  return pdfReady;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
