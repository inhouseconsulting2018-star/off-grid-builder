import assert from "node:assert/strict";

process.env.LOG_LEVEL = "silent";
process.env.ADMIN_TOKEN = "admin-test-token";

const {
  buildPreview,
  buildPaidReport,
  renderReportPdfBuffer,
  renderReportPdfHtml,
} = await import("../../artifacts/api-server/src/services/reports/reportService");
const { buildEntitlementUpdate } = await import("../../artifacts/api-server/src/services/payments/entitlements");
const { getCheckoutPlan } = await import("../../artifacts/api-server/src/services/payments/plans");

const calc = {
  adjustedArraySizeKw: 8.2,
  numPanels: 20,
  yearlyProductionKwh: 12_345,
  installedCostLow: 24_000,
  installedCostHigh: 31_000,
  estimatedYearlySavings: 1_850,
  paybackYears: 12.5,
  productionEstimateLabel: "PVWatts",
  inverterSizeKw: 7.6,
  totalSystemLossPct: 14,
  totalBatteryBankKwh: 15,
  batteryUsableKwh: 12,
  recommendedPanelBrand: "Q CELLS",
  recommendedInverterBrand: "Sol-Ark",
  recommendedBatteryBrand: "EG4",
  recommendedMountingBrand: "IronRidge",
  diyEquipmentCostLow: 12_000,
  diyEquipmentCostHigh: 18_000,
};

const project = {
  id: 42,
  accessToken: "project-secret",
  ownerUserId: null,
  isGuestProject: true,
  name: "QA Project",
  address: "2365 Myers Dr",
  city: "Santa Rosa",
  state: "CA",
  zip: "95403",
  installationType: "roof",
  systemType: "grid-tied",
  annualKwh: 11_000,
  monthlyBill: 180,
  utilityRatePerKwh: 0.3,
  backupHours: 0,
  customBackupHours: null,
  batteryChemistry: "lifepo4",
  hasGenerator: false,
  generatorKw: null,
  wantsGenerator: false,
  shadeLevel: "light",
  roofPitch: "20",
  roofDirection: "South",
  availableSqft: 600,
  snowArea: false,
  highWindArea: false,
  budgetTier: "mid-range",
  customBudget: null,
  arrayLat: null,
  arrayLon: null,
  arrayLocationNote: null,
  lat: 38.46,
  lon: -122.73,
  locationAccuracy: "exact_address",
  useManualCoords: false,
  calculationResult: calc,
  paidAt: null,
  stripeSessionId: null,
  stripePriceId: null,
  entitlementType: null,
  selectedPlan: null,
  paidAmount: null,
  reportCredits: 0,
  creditsUsed: 0,
  paymentStatus: "unpaid",
  contractorStatus: false,
  contractorPlan: null,
  purchaserEmail: null,
  reportDeliveryStatus: "not_sent",
  reportDeliveredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("free preview returns ranges only", () => {
  const preview = buildPreview(project as any) as any;
  assert.equal(preview.preview.systemSizeKwRange.low < calc.adjustedArraySizeKw, true);
  assert.equal("bom" in preview, false);
  assert.equal("calculation" in preview, false);
  assert.equal("estimatedYearlySavings" in preview.preview, false);
});

run("full paid report contains server-side BOM", () => {
  const report = buildPaidReport({ ...project, paidAt: new Date() } as any) as any;
  assert.ok(report.bom.length > 0);
  assert.equal(report.project.accessToken, undefined);
});

run("unpaid preview does not leak access token", () => {
  const preview = buildPreview(project as any) as any;
  assert.equal(preview.accessToken, undefined);
  const report = buildPaidReport({ ...project, paidAt: new Date() } as any) as any;
  assert.equal(report.project.accessToken, undefined);
});

run("Stripe webhook entitlement update unlocks selected plan credits", () => {
  const plan = getCheckoutPlan("contractor_lifetime_beta");
  const update = buildEntitlementUpdate({
    id: "cs_test_123",
    payment_status: "paid",
    amount_total: 19_900,
    metadata: { selectedPlan: "contractor_lifetime_beta", stripePriceId: "price_test" },
  }, plan);
  assert.equal(update.paymentStatus, "paid");
  assert.equal(update.entitlementType, "contractor_lifetime_beta");
  assert.equal(update.reportCredits, 100);
  assert.equal(update.contractorStatus, true);
});
run("launch plan prices match checkout amounts", () => {
  assert.equal(getCheckoutPlan("homeowner_report").amountCents, 1_900);
  assert.equal(getCheckoutPlan("property_pack").amountCents, 3_900);
  assert.equal(getCheckoutPlan("contractor_annual").amountCents, 14_900);
  assert.equal(getCheckoutPlan("contractor_lifetime_beta").amountCents, 19_900);
});

run("paid report PDF and printable HTML include project details and disclaimer", () => {
  const report = buildPaidReport({ ...project, paidAt: new Date() } as any);
  assert.ok(report);

  const pdf = renderReportPdfBuffer(report);
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.ok(pdf.includes(Buffer.from("QA Project")));
  assert.ok(pdf.includes(Buffer.from("Preliminary planning estimate only")));

  const html = renderReportPdfHtml(report);
  assert.match(html, /QA Project/);
  assert.match(html, /8\.20 kW DC/);
  assert.match(html, /Preliminary planning estimate only/);
  assert.match(html, /not a permit-ready engineering plan/);
});
