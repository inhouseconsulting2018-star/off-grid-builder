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
    accessToken: project.accessToken,
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
      <p class="disclaimer">This report is for preliminary planning only. Final design must be verified by qualified licensed professionals and approved by the Authority Having Jurisdiction. Production, savings, equipment availability, incentives, and code requirements may vary.</p>
    </body>
  </html>`;
}

export function renderReportPdfBuffer(report: NonNullable<ReturnType<typeof buildPaidReport>>): Buffer {
  const { project, calculation: calc, bom } = report;
  const annualProduction = calc.pvwattsAnnualKwh ?? calc.yearlyProductionKwh;
  const lines = [
    "OffGrid Solar Builder",
    "Contractor-Grade Solar Proposal",
    "",
    project.name,
    `${project.address}, ${project.city}, ${project.state} ${project.zip}`,
    "",
    `System type: ${project.systemType}`,
    `Installation: ${project.installationType} mount`,
    `Array: ${calc.adjustedArraySizeKw.toFixed(2)} kW DC`,
    `Panels: ${calc.numPanels}`,
    `Annual production: ${Math.round(annualProduction).toLocaleString()} kWh`,
    `Inverter: ${calc.inverterSizeKw.toFixed(1)} kW AC`,
    `Battery usable capacity: ${(calc.batteryUsableKwh ?? 0).toFixed(1)} kWh`,
    `Total battery bank: ${(calc.totalBatteryBankKwh ?? 0).toFixed(1)} kWh`,
    `Modeled losses: ${calc.totalSystemLossPct.toFixed(1)}%`,
    `Installed cost: $${Math.round(calc.installedCostLow).toLocaleString()} - $${Math.round(calc.installedCostHigh).toLocaleString()}`,
    `Annual savings: $${Math.round(calc.estimatedYearlySavings).toLocaleString()}`,
    `Payback: ${calc.paybackYears ? `${calc.paybackYears.toFixed(1)} years` : "N/A"}`,
    "",
    "Equipment List",
    ...bom.slice(0, 20).map((item) => `${item.category}: ${item.model} (${item.qty}) ${item.totalPrice}`),
    "",
    "Assumptions and Disclaimers",
    "This report is for preliminary planning only. Final design must be verified by qualified licensed professionals and approved by the Authority Having Jurisdiction.",
  ];
  return makeSimplePdf(lines);
}

function makeSimplePdf(lines: string[]): Buffer {
  const content = [
    "BT",
    "/F1 18 Tf",
    "54 760 Td",
    ...lines.flatMap((line, index) => {
      const size = index === 0 ? 18 : index === 1 ? 13 : 10;
      const escaped = String(line).replace(/[\\()]/g, "\\$&");
      return [`/F1 ${size} Tf`, `(${escaped}) Tj`, "0 -16 Td"];
    }),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
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

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
