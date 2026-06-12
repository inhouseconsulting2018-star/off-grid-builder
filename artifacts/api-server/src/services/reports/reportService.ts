import type { Project } from "@workspace/db";
import { createRequire } from "node:module";
import { generateBom } from "./bom";

type Calc = Record<string, any>;

const require = createRequire(import.meta.url);
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
    panelWattage: calc.panelWattage ?? 440,
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
  const annualProduction = calc.yearlyProductionKwh;
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
        <div class="metric"><span>Panels</span><strong>${calc.numPanels} × ${calc.panelWattage ?? 440}W</strong></div>
        <div class="metric"><span>Annual Production</span><strong>${Math.round(annualProduction).toLocaleString()} kWh</strong></div>
        <div class="metric"><span>Payback</span><strong>${calc.paybackYears ? `${calc.paybackYears.toFixed(1)} yrs` : "N/A"}</strong></div>
      </div>
      <h2>Estimate Inputs and Sizing</h2>
      <table><tbody>
        <tr><td>Full address</td><td>${escapeHtml(project.address)}, ${escapeHtml(project.city)}, ${escapeHtml(project.state)} ${escapeHtml(project.zip)}</td></tr>
        <tr><td>Coordinates</td><td>${typeof project.lat === "number" && typeof project.lon === "number" ? `${project.lat.toFixed(5)}, ${project.lon.toFixed(5)}` : "Unavailable"}</td></tr>
        <tr><td>Annual usage</td><td>${project.annualKwh.toLocaleString()} kWh</td></tr>
        <tr><td>Peak sun hours</td><td>${calc.peakSunHours.toFixed(2)} hrs/day</td></tr>
        <tr><td>Peak sun hours source</td><td>${calc.peakSunHoursSource === "api" ? "API (NREL PVWatts)" : "Regional fallback"}</td></tr>
        <tr><td>Required system size</td><td>${(calc.requiredSystemSizeKw ?? calc.arraySizeKw).toFixed(2)} kW</td></tr>
        <tr><td>Final system size</td><td>${calc.adjustedArraySizeKw.toFixed(2)} kW</td></tr>
        <tr><td>Panel count and wattage</td><td>${calc.numPanels} panels × ${calc.panelWattage ?? 440}W</td></tr>
        <tr><td>Estimated annual production</td><td>${Math.round(annualProduction).toLocaleString()} kWh</td></tr>
      </tbody></table>
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

export async function renderReportPdfBuffer(report: NonNullable<ReturnType<typeof buildPaidReport>>): Promise<Buffer> {
  const _pdfMod = require("pdfkit");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PDFDocument = (_pdfMod.default ?? _pdfMod) as any;
  const { project, calculation: calc, bom, monthlyChartData } = report;
  const annualProduction = calc.yearlyProductionKwh;

  // The engine is authoritative; legacy reports fall back to the MVP default.
  function resolvePanelWattage(): number {
    if (typeof calc.panelWattage === "number" && calc.panelWattage > 0) return Math.round(calc.panelWattage);
    return 440;
  }
  const panelWattage = resolvePanelWattage();

  function dataSourceLabel(): string {
    return calc.peakSunHoursSource === "api"
      ? "Live NREL PVWatts satellite irradiance"
      : `State-average estimate (${project.state ?? "regional"})`;
  }

  // Fetch a high-resolution satellite image centered on the property. The bbox
  // aspect ratio is matched to the image pixel ratio (correcting for longitude
  // compression at latitude) so the photo is never stretched, and the property
  // sits dead-center — we draw a location marker there.
  let mapImageBuffer: Buffer | null = null;
  const MAP_PX_W = 1280;
  const MAP_PX_H = 720;
  if (typeof project.lat === "number" && typeof project.lon === "number") {
    try {
      const latPad = 0.0022;
      const lonPad = (latPad * (MAP_PX_W / MAP_PX_H)) / Math.cos((project.lat * Math.PI) / 180);
      const bbox = `${project.lon - lonPad},${project.lat - latPad},${project.lon + lonPad},${project.lat + latPad}`;
      const mapUrl =
        `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export` +
        `?bbox=${bbox}&bboxSR=4326&size=${MAP_PX_W},${MAP_PX_H}&imageSR=4326&format=png32&f=image`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const resp = await fetch(mapUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (resp.ok) mapImageBuffer = Buffer.from(await resp.arrayBuffer());
    } catch { /* skip map if fetch fails */ }
  }

  // ── Palette ────────────────────────────────────────────────────────────────
  const ORANGE = "#f97316";
  const ORANGE_DEEP = "#ea580c";
  const DARK = "#0f172a";
  const SLATE = "#334155";
  const GRAY = "#64748b";
  const CARD_BG = "#fff7ed";
  const CARD_BORDER = "#fed7aa";
  const HAIRLINE = "#e2e8f0";
  const PANEL_BG = "#f8fafc";

  const L = 50;
  const R = 562;
  const W = R - L;
  const TOP = 92;       // content top on interior pages (clears the running header)
  const BOTTOM = 712;   // content must stop here; the footer sits at y≈740

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 50, size: "LETTER", bufferPages: true });
  doc.on("data", (c: Buffer) => chunks.push(c));
  const pdfReady = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const systemLabel = (s: string) =>
    s === "off-grid" ? "Off-Grid with Battery Storage" :
    s === "hybrid"   ? "Hybrid Grid-Tie + Battery"     : "Grid-Tied";
  const mountLabel = (s: string) =>
    s === "ground" ? "Ground Mount" : s === "pole" ? "Pole Mount" : "Roof Mount";

  // ── Drawing helpers ──────────────────────────────────────────────────────
  function sunMark(cx: number, cy: number, r: number, color: string) {
    doc.save();
    doc.circle(cx, cy, r * 0.5).fill(color);
    doc.lineWidth(Math.max(1, r * 0.16)).strokeColor(color);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      doc.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72)
         .lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
         .stroke();
    }
    doc.restore();
  }

  // Slim running header drawn at the top of every interior page.
  function runningHeader() {
    doc.save();
    sunMark(L + 7, 49, 7, ORANGE);
    doc.fontSize(11).fillColor(DARK).font("Helvetica-Bold").text("OffGrid Solar Builder", L + 22, 44, { lineBreak: false });
    doc.fontSize(8.5).fillColor(GRAY).font("Helvetica")
       .text(String(project.name ?? "Solar Proposal"), L, 46, { width: W, align: "right", lineBreak: false });
    doc.moveTo(L, 66).lineTo(R, 66).strokeColor(HAIRLINE).lineWidth(1).stroke();
    doc.restore();
    doc.y = TOP;
  }

  function newContentPage() {
    doc.addPage();
    runningHeader();
  }

  // Add a page if `h` points of content won't fit before the footer zone.
  function ensureSpace(h: number): boolean {
    if (doc.y + h > BOTTOM) {
      newContentPage();
      return true;
    }
    return false;
  }

  // `minFollow` reserves space for content after the heading so a section
  // header never lands alone at the bottom of a page (orphan prevention).
  function sectionHeader(title: string, minFollow = 46) {
    ensureSpace(22 + minFollow);
    doc.moveDown(0.5);
    const y = doc.y;
    doc.rect(L, y, 4, 14).fill(ORANGE);
    doc.fontSize(12.5).fillColor(DARK).font("Helvetica-Bold")
       .text(title.toUpperCase(), L + 12, y + 1, { width: W - 12, characterSpacing: 0.4 });
    doc.y = y + 18;
    doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(HAIRLINE).lineWidth(1).stroke();
    doc.moveDown(0.55);
    doc.font("Helvetica").fillColor(DARK);
  }

  function row2(label: string, value: string) {
    const labelW = W * 0.52;
    const valueW = W * 0.44;
    const valueX = L + W * 0.56;
    doc.fontSize(10).font("Helvetica");
    const hLabel = doc.heightOfString(label, { width: labelW });
    doc.font("Helvetica-Bold");
    const hValue = doc.heightOfString(value, { width: valueW });
    const h = Math.max(hLabel, hValue, 12);
    ensureSpace(h + 7);
    const y = doc.y;
    doc.fontSize(10).fillColor(GRAY).font("Helvetica").text(label, L, y + 1, { width: labelW });
    doc.fontSize(10).fillColor(DARK).font("Helvetica-Bold").text(value, valueX, y + 1, { width: valueW, align: "right" });
    doc.y = y + h + 5;
    doc.moveTo(L, doc.y - 2).lineTo(R, doc.y - 2).strokeColor("#f1f5f9").lineWidth(0.5).stroke();
  }

  function metricBox(x: number, y: number, w: number, label: string, value: string, accent = false) {
    doc.save();
    doc.roundedRect(x, y, w, 56, 6).fillAndStroke(accent ? ORANGE : CARD_BG, accent ? ORANGE : CARD_BORDER);
    doc.fillColor(accent ? "#ffe8d0" : GRAY).fontSize(7.5).font("Helvetica-Bold")
       .text(label.toUpperCase(), x + 10, y + 10, { width: w - 20, characterSpacing: 0.3 });
    doc.fillColor(accent ? "#ffffff" : DARK).fontSize(15).font("Helvetica-Bold")
       .text(value, x + 10, y + 26, { width: w - 20, lineBreak: false });
    doc.restore();
  }

  function paragraph(text: string, opts: { size?: number; color?: string; gap?: number } = {}) {
    const size = opts.size ?? 9;
    doc.fontSize(size).font("Helvetica");
    const h = doc.heightOfString(text, { width: W });
    ensureSpace(Math.min(h, BOTTOM - TOP) + 4);
    doc.fillColor(opts.color ?? SLATE).fontSize(size).font("Helvetica").text(text, L, doc.y, { width: W });
    doc.moveDown(opts.gap ?? 0.5);
  }

  function bullet(text: string) {
    const t = `•  ${text}`;
    doc.fontSize(9).font("Helvetica");
    const h = doc.heightOfString(t, { width: W - 12 });
    ensureSpace(h + 5);
    doc.fillColor(SLATE).fontSize(9).font("Helvetica").text(t, L + 6, doc.y, { width: W - 12 });
    doc.moveDown(0.45);
  }

  // Draw the satellite map at the current y, full `width`, with a centered
  // property marker, rounded corners, and an attribution caption. Returns
  // false if no image was available so callers can adjust the layout.
  function drawMap(width: number): boolean {
    if (!mapImageBuffer) return false;
    const mapH = Math.round((width * MAP_PX_H) / MAP_PX_W);
    ensureSpace(mapH + 18);
    const x = L;
    const y = doc.y;
    doc.save();
    doc.roundedRect(x, y, width, mapH, 8).clip();
    doc.image(mapImageBuffer, x, y, { width, height: mapH });
    doc.restore();
    // Marker pin at the image center (property is centered in the bbox).
    const cx = x + width / 2;
    const cy = y + mapH / 2;
    const headY = cy - 15;
    doc.save();
    doc.moveTo(cx, cy).lineTo(cx - 6, headY + 5).lineTo(cx + 6, headY + 5).closePath().fill(ORANGE_DEEP);
    doc.lineWidth(2);
    doc.circle(cx, headY, 8).fillAndStroke(ORANGE, "#ffffff");
    doc.circle(cx, headY, 3).fill("#ffffff");
    doc.restore();
    doc.roundedRect(x, y, width, mapH, 8).strokeColor(CARD_BORDER).lineWidth(1).stroke();
    doc.y = y + mapH + 5;
    doc.fontSize(7).fillColor(GRAY).font("Helvetica")
       .text("Property location — satellite imagery © Esri, Maxar, Earthstar Geographics", L, doc.y, { width: W, align: "right" });
    doc.moveDown(0.4);
    return true;
  }

  function pageFooter() {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      // Zero the bottom margin while writing — otherwise PDFKit treats footer
      // text below the bottom margin as overflow and auto-inserts a blank page.
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.moveTo(L, 732).lineTo(R, 732).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
      doc.fontSize(8).fillColor(GRAY).font("Helvetica")
        .text("OffGrid Solar Builder  •  offgridsolarbuilder.com  •  Preliminary planning estimate only",
          L, 740, { width: W, align: "left", lineBreak: false })
        .text(`Page ${i + 1} of ${pages.count}`, L, 740, { width: W, align: "right", lineBreak: false });
      doc.page.margins.bottom = prevBottom;
    }
  }

  // ══ COVER PAGE ═════════════════════════════════════════════════════════════
  doc.rect(0, 0, 612, 78).fill(DARK);
  doc.rect(0, 78, 612, 4).fill(ORANGE);
  sunMark(L + 9, 39, 11, ORANGE);
  doc.fontSize(16).fillColor("#ffffff").font("Helvetica-Bold").text("OffGrid Solar Builder", L + 28, 26, { lineBreak: false });
  doc.fontSize(9).fillColor("#cbd5e1").font("Helvetica").text("Contractor-Grade Solar Proposal", L + 28, 46, { lineBreak: false });
  doc.fontSize(8.5).fillColor("#cbd5e1").font("Helvetica")
     .text("offgridsolarbuilder.com", L, 34, { width: W, align: "right", lineBreak: false });

  const proposalTitle =
    project.systemType === "off-grid" ? "Off-Grid Solar Proposal" :
    project.systemType === "hybrid"   ? "Hybrid Solar Proposal"   : "Residential Solar Proposal";
  doc.fillColor(ORANGE_DEEP).fontSize(10).font("Helvetica-Bold")
     .text(proposalTitle.toUpperCase(), L, 104, { characterSpacing: 1.2 });
  doc.fillColor(DARK).fontSize(26).font("Helvetica-Bold").text(String(project.name ?? "Solar Project"), L, 119, { width: W });
  doc.fillColor(SLATE).fontSize(11).font("Helvetica")
     .text(`${project.address ?? ""}, ${project.city ?? ""}, ${project.state ?? ""} ${project.zip ?? ""}`.replace(/\s+,/g, ",").trim(), L, doc.y + 4, { width: W });

  const preparedFor = project.purchaserEmail ? `Prepared for ${project.purchaserEmail}` : "Prepared by OffGrid Solar Builder";
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.fillColor(GRAY).fontSize(9.5).font("Helvetica")
     .text(`${preparedFor}   •   ${dateStr}   •   ${systemLabel(project.systemType ?? "")} · ${mountLabel(project.installationType ?? "")}`, L, doc.y + 3, { width: W });

  doc.y += 14;
  drawMap(W);

  // Headline metrics
  doc.moveDown(0.3);
  const mw = (W - 18) / 4;
  ensureSpace(60);
  const my = doc.y;
  metricBox(L,            my, mw, "System Size",       `${calc.adjustedArraySizeKw.toFixed(2)} kW`, true);
  metricBox(L + mw + 6,   my, mw, "Panels",            panelWattage ? `${calc.numPanels} × ${panelWattage}W` : `${calc.numPanels}`);
  metricBox(L + (mw + 6) * 2, my, mw, "Annual Production", `${Math.round(annualProduction).toLocaleString()} kWh`);
  metricBox(L + (mw + 6) * 3, my, mw,
    project.systemType === "off-grid" ? "Daily Avg Load" : "Payback Est.",
    project.systemType === "off-grid"
      ? `${(calc.dailyKwh ?? 0).toFixed(1)} kWh`
      : (calc.paybackYears ? `${calc.paybackYears.toFixed(1)} yrs` : "N/A"));
  doc.y = my + 56 + 12;

  // Recommended-system summary band (height adapts to the text)
  const recText = `${systemRecommendation(project.systemType, project.installationType)} — a ${calc.adjustedArraySizeKw.toFixed(2)} kW array of ${calc.numPanels} panels${panelWattage ? ` (${panelWattage}W each)` : ""}, producing an estimated ${Math.round(annualProduction).toLocaleString()} kWh per year against ${(project.annualKwh ?? 0).toLocaleString()} kWh of annual usage.`;
  doc.fontSize(9.5).font("Helvetica");
  const recTextH = doc.heightOfString(recText, { width: W - 28 });
  const recH = recTextH + 34;
  ensureSpace(recH + 4);
  const ry = doc.y;
  doc.roundedRect(L, ry, W, recH, 6).fillAndStroke(PANEL_BG, HAIRLINE);
  doc.fillColor(ORANGE_DEEP).fontSize(8).font("Helvetica-Bold").text("RECOMMENDED SYSTEM", L + 14, ry + 10, { characterSpacing: 0.6 });
  doc.fillColor(SLATE).fontSize(9.5).font("Helvetica").text(recText, L + 14, ry + 23, { width: W - 28 });
  doc.y = ry + recH;

  // ══ PAGE 2: SYSTEM OVERVIEW + COST + ASSUMPTIONS ═══════════════════════════
  newContentPage();

  sectionHeader("System Overview");
  row2("System type", systemLabel(project.systemType ?? ""));
  row2("Installation", mountLabel(project.installationType ?? ""));
  row2("Full address", `${project.address}, ${project.city}, ${project.state} ${project.zip}`);
  row2("Coordinates", typeof project.lat === "number" && typeof project.lon === "number" ? `${project.lat.toFixed(5)}, ${project.lon.toFixed(5)}` : "Unavailable");
  row2("Required system size", `${(calc.requiredSystemSizeKw ?? calc.arraySizeKw).toFixed(2)} kW DC`);
  row2("Recommended system size", `${calc.adjustedArraySizeKw.toFixed(2)} kW DC`);
  row2("Panel count", `${calc.numPanels} panels`);
  if (panelWattage) row2("Panel wattage", `${panelWattage} W per panel`);
  row2("Estimated annual production", `${Math.round(annualProduction).toLocaleString()} kWh/yr`);
  row2("Annual usage (load)", project.annualKwh ? `${project.annualKwh.toLocaleString()} kWh/yr` : "—");
  row2("Daily average load", `${(calc.dailyKwh ?? 0).toFixed(1)} kWh`);
  row2("Peak sun hours", `${(calc.peakSunHours ?? calc.designPeakSunHours ?? 0).toFixed(2)} hrs/day`);
  row2("Solar data source", dataSourceLabel());
  row2("Budget tier", String(project.budgetTier ?? "mid-range"));
  row2("Shade level", String(project.shadeLevel ?? "none"));
  row2("Available area", project.availableSqft ? `${project.availableSqft.toLocaleString()} sq ft` : "—");
  row2("Array area required", calc.squareFeetRequired ? `${Math.round(calc.squareFeetRequired).toLocaleString()} sq ft` : "—");
  if (calc.batteryUsableKwh > 0) {
    row2("Battery usable capacity", `${(calc.batteryUsableKwh ?? 0).toFixed(1)} kWh`);
    row2("Total battery bank", `${(calc.totalBatteryBankKwh ?? 0).toFixed(1)} kWh`);
    row2("Inverter sizing", `${calc.inverterSizeKw.toFixed(1)} kW AC`);
    row2("Backup target", project.backupHours ? `${project.backupHours} hrs` : "—");
    row2("Autonomy", calc.batteryAutonomyDays ? `${Number(calc.batteryAutonomyDays).toFixed(1)} days` : "—");
    row2("Battery chemistry", String(project.batteryChemistry ?? "LiFePO4"));
  }

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

  sectionHeader("Key Assumptions");
  bullet(`Production modeled from ${dataSourceLabel().toLowerCase()} at ${(calc.peakSunHours ?? calc.designPeakSunHours ?? 0).toFixed(2)} peak sun hours/day.`);
  bullet(`${panelWattage ? `${panelWattage}W panels` : "Panels"} with ${(calc.totalSystemLossPct ?? 0).toFixed(1)}% total modeled system losses applied to gross production.`);
  bullet(`Costs use a $${(project.utilityRatePerKwh ?? 0).toFixed(3)}/kWh utility rate and 2024/2025 US market equipment pricing.`);
  bullet("Incentives (federal ITC, state rebates, net metering) are not included unless explicitly noted.");

  // ══ PAGE 3: PERFORMANCE (LOSSES + MONTHLY) ═════════════════════════════════
  newContentPage();

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
    const chartH = 110;
    ensureSpace(chartH + 22 + 28);
    const chartTop = doc.y;
    const barW = (W - 2) / 12;
    doc.roundedRect(L, chartTop, W, chartH + 22, 6).fillAndStroke(PANEL_BG, HAIRLINE);
    monthlyChartData.forEach((row, i) => {
      const barH = Math.max(4, ((row.kwh ?? 0) / maxKwh) * chartH * 0.82);
      const bx = L + 1 + i * barW;
      const by = chartTop + chartH - barH + 4;
      doc.roundedRect(bx + 3, by, barW - 6, barH, 2).fill(ORANGE);
      doc.fontSize(7).fillColor(GRAY).font("Helvetica")
         .text(row.month, bx, chartTop + chartH + 7, { width: barW, align: "center" });
      doc.fontSize(6.5).fillColor(SLATE)
         .text(`${Math.round(row.kwh ?? 0)}`, bx, by - 10, { width: barW, align: "center" });
    });
    doc.y = chartTop + chartH + 22;
    doc.moveDown(0.6);
    const annualLabel = `Annual production: ${Math.round(calc.pvwattsAnnualKwh ?? annualProduction).toLocaleString()} kWh   •   Avg solar radiation: ${(calc.pvwattsSolradAnnual ?? 0).toFixed(2)} kWh/m²/day`;
    doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(annualLabel, L, doc.y, { width: W, align: "center" });
    doc.moveDown(0.5);
  }

  // ══ PAGE 4: EQUIPMENT BILL OF MATERIALS ════════════════════════════════════
  newContentPage();
  sectionHeader("Equipment & Bill of Materials");

  // Column geometry — all five columns fit inside the content width (W = 512).
  // [Category, Model/Description, Specs, Qty, Est. Price] => 95+175+130+40+72 = 512.
  const colW  = [95, 175, 130, 40, 72];
  const colX  = [L, L + 95, L + 270, L + 400, L + 440];
  const heads = ["Category", "Model / Description", "Specs", "Qty", "Est. Price"];
  const alignRight = [false, false, false, true, true];
  const CELL_PAD = 6;

  function drawBomHeader() {
    const hy = doc.y;
    doc.rect(L, hy, W, 16).fill(DARK);
    heads.forEach((h, i) => {
      doc.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold")
         .text(h, colX[i] + 3, hy + 4, { width: colW[i] - 5, align: alignRight[i] ? "right" : "left" });
    });
    doc.y = hy + 16;
  }

  function measureBomRow(cells: unknown[]): number {
    let max = 0;
    cells.forEach((cell, i) => {
      doc.fontSize(8.5).font(i === 1 ? "Helvetica-Bold" : "Helvetica");
      const h = doc.heightOfString(String(cell ?? ""), { width: colW[i] - CELL_PAD });
      if (h > max) max = h;
    });
    return max + CELL_PAD;
  }

  drawBomHeader();

  bom.forEach((item, idx) => {
    const cells = [item.category, item.model, item.specs, item.qty, item.totalPrice];
    const rowH = measureBomRow(cells);
    if (ensureSpace(rowH)) drawBomHeader();
    const rowY = doc.y;
    if (idx % 2 === 0) doc.rect(L, rowY, W, rowH).fill("#fafafa");
    cells.forEach((cell, i) => {
      doc.fontSize(8.5).fillColor(DARK).font(i === 1 ? "Helvetica-Bold" : "Helvetica")
         .text(String(cell ?? ""), colX[i] + 3, rowY + 3, { width: colW[i] - CELL_PAD, align: alignRight[i] ? "right" : "left" });
    });
    doc.y = rowY + rowH;
    doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor("#eef2f6").lineWidth(0.4).stroke();
  });

  // Recommended brands — keep the heading and all rows together on one page.
  const brandCount = [calc.recommendedPanelBrand, calc.recommendedInverterBrand, calc.recommendedBatteryBrand, calc.recommendedMountingBrand].filter(Boolean).length;
  doc.moveDown(0.5);
  sectionHeader("Recommended Brands (for this system size & budget)", brandCount * 18 + 6);
  if (calc.recommendedPanelBrand)    row2("Solar panels",     String(calc.recommendedPanelBrand));
  if (calc.recommendedInverterBrand) row2("Inverter/charger", String(calc.recommendedInverterBrand));
  if (calc.recommendedBatteryBrand)  row2("Battery",          String(calc.recommendedBatteryBrand));
  if (calc.recommendedMountingBrand) row2("Mounting",         String(calc.recommendedMountingBrand));

  // ══ PLANNING NOTES + DISCLAIMERS ═══════════════════════════════════════════
  if (Array.isArray(calc.notes) && calc.notes.length > 0) {
    sectionHeader("Planning Notes & Assumptions");
    (calc.notes as string[]).forEach((note) => bullet(note));
  }

  sectionHeader("Disclaimers", 90);
  [
    "Preliminary planning estimate only. This report is intended to support early-stage feasibility analysis and project scoping. " +
    "Final system design, sizing, equipment selection, structural loading, electrical code compliance, and permitting must be verified and " +
    "engineered by a licensed solar and electrical professional in your jurisdiction.",
    "Production estimates are based on PVWatts v8 solar irradiance data (NREL) or state-average fallback values. Actual system " +
    "performance may vary due to local shading, weather, equipment degradation, installation quality, and other factors.",
    "Cost estimates are indicative ranges based on typical market pricing as of the report date and may vary significantly by region, " +
    "installer, supply availability, and incentive programs. This report is not a quote, contract, or permit-ready engineering plan.",
    "Battery autonomy and backup calculations assume average daily load. Actual backup performance depends on load profile, " +
    "temperature, battery state of health, and usage patterns.",
    "Federal, state, and local incentives (ITC, SGIP, net metering, etc.) are not included in cost or payback estimates unless noted. " +
    "Consult a tax professional and your local utility regarding applicable programs.",
  ].forEach((para) => paragraph(para, { size: 9, gap: 0.6 }));

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
