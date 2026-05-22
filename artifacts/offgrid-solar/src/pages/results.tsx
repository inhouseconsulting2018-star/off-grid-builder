import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Download, PlusCircle, AlertTriangle, Zap, Battery,
  DollarSign, Settings2, Edit, MapPin, Sun, FileText,
  Info, Lightbulb, CheckCircle2, ClipboardList, LayoutGrid, Lock
} from "lucide-react";
import { useEffect, Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ProjectMap } from "@/components/maps/ProjectMap";
import { generateDesignNotes } from "@/utils/design-notes";
import { type CheckoutPlanId, createProjectCheckoutSession, emailUnlockedReport, getProjectPreview, getProjectReport, getReportPdfUrl } from "@/services/projectService";
import { saveProjectRef } from "@/services/projectAccess";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ReferenceLine,
} from "recharts";

export default function Results() {
  const { id } = useParams();
  const projectId = parseInt(id || "0", 10);
  const { data: preview, isLoading, error } = useQuery({
    queryKey: ["project-preview", projectId],
    queryFn: () => getProjectPreview<any>(projectId),
    enabled: projectId > 0,
  });
  const { data: report, isLoading: isReportLoading, error: reportError } = useQuery({
    queryKey: ["project-report", projectId],
    queryFn: () => getProjectReport<any>(projectId),
    enabled: !!preview?.paidAt && projectId > 0,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [isEmailingReport, setIsEmailingReport] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("accessToken");
    if (projectId > 0 && token) saveProjectRef({ id: projectId, accessToken: token });
  }, [projectId]);

  const handleUnlockReport = (plan: CheckoutPlanId = "homeowner_report") => {
    setIsRedirecting(true);
    createProjectCheckoutSession(projectId, plan)
      .then((data) => {
        if (data.url) window.location.href = data.url;
      })
      .catch(() => {
        setIsRedirecting(false);
        toast({
          title: "Payment unavailable",
          description: "Stripe is not configured or this browser is missing project access.",
          variant: "destructive",
        });
      });
  };

  const handleEmailReport = async () => {
    if (!deliveryEmail.trim()) {
      toast({ title: "Email required", description: "Enter the address that should receive this report.", variant: "destructive" });
      return;
    }
    setIsEmailingReport(true);
    try {
      const delivery = await emailUnlockedReport(projectId, deliveryEmail.trim());
      toast({
        title: delivery.reportDeliveryStatus === "sent" ? "Report emailed" : "Report delivery queued",
        description: `Delivery status for ${deliveryEmail.trim()}: ${delivery.reportDeliveryStatus}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["project-preview", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-report", projectId] });
    } catch (err) {
      toast({
        title: "Could not email report",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsEmailingReport(false);
    }
  };

  useEffect(() => {
    const email = (preview as { purchaserEmail?: string | null } | undefined)?.purchaserEmail;
    if (email && !deliveryEmail) setDeliveryEmail(email);
  }, [preview, deliveryEmail]);

  if (isLoading || (!!preview?.paidAt && isReportLoading)) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
          <h2 className="text-2xl font-bold">Generating Solar Report...</h2>
          <p className="text-muted-foreground mt-2">Running engineering calculations for your design.</p>
        </div>
      </AppLayout>
    );
  }

  if (error || !preview || reportError) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-destructive">Failed to load project report. Please try again.</div>
      </AppLayout>
    );
  }

  if (!preview.paidAt) {
    const calc = preview.preview;
    const fmtRange = (r?: { low?: number; high?: number }, suffix = "") => {
      if (!r || typeof r.low !== "number" || typeof r.high !== "number") return "--";
      return `${r.low.toLocaleString()}-${r.high.toLocaleString()}${suffix}`;
    };
    const pricingOptions: Array<{ plan: CheckoutPlanId; title: string; price: string; desc: string }> = [
      { plan: "homeowner_report", title: "Homeowner Full Report", price: "$19", desc: "One complete report and PDF for this project." },
      { plan: "property_pack", title: "Property Pack", price: "$39", desc: "Three full report credits tied to this guest project access." },
      { plan: "contractor_annual", title: "Contractor Annual", price: "$149/yr", desc: "50 report credits, contractor status, PDF exports, and saved projects." },
      { plan: "contractor_lifetime_beta", title: "Contractor Lifetime Beta", price: "$199", desc: "Founding contractor plan with 100 credits and core calculator access." },
    ];
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sun className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Free Solar Preview</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">{preview.name}</h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{preview.city}, {preview.state}</span>
              </p>
            </div>
            <Button
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => handleUnlockReport("homeowner_report")}
              disabled={isRedirecting}
            >
              {isRedirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Unlock Full Report - $19
            </Button>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="bg-primary/5 border-primary/25">
              <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Rough Solar Array</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-black text-primary">{fmtRange(calc?.systemSizeKwRange, " kW")}</div><div className="text-sm">{fmtRange(calc?.panelCountRange)} panels</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Rough Cost Range</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-black">${Math.round(calc?.costRange?.low ?? 0).toLocaleString()} - ${Math.round(calc?.costRange?.high ?? 0).toLocaleString()}</div><div className="text-xs text-muted-foreground">Installed planning range</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Production Range</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-black">{fmtRange(calc?.yearlyProductionKwhRange, " kWh/yr")}</div><div className="text-xs text-muted-foreground">{calc?.basicSystemRecommendation ?? "Basic system recommendation"}</div></CardContent>
            </Card>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            {pricingOptions.map((option) => (
              <Card key={option.plan} className={option.plan === "homeowner_report" ? "border-primary/40" : ""}>
                <CardContent className="p-4 flex flex-col gap-3 h-full">
                  <div>
                    <div className="text-sm font-semibold">{option.title}</div>
                    <div className="text-2xl font-black mt-1">{option.price}</div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{option.desc}</p>
                  </div>
                  <Button className="mt-auto" variant={option.plan === "homeowner_report" ? "default" : "outline"} onClick={() => handleUnlockReport(option.plan)} disabled={isRedirecting}>
                    {isRedirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Select
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="py-8 flex flex-col items-center text-center gap-4">
              <Lock className="h-8 w-8 text-amber-600" />
              <div>
                <h2 className="text-xl font-bold">Detailed contractor-grade report is locked</h2>
                <p className="text-sm text-muted-foreground max-w-xl mt-2">
                  Full BOM, losses, battery and inverter sizing, monthly PVWatts production, ROI details, and PDF download are returned only after payment entitlement is verified by the server.
                </p>
              </div>
              <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-white gap-2 px-8" onClick={() => handleUnlockReport("homeowner_report")} disabled={isRedirecting}>
                {isRedirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Unlock Full Report - $19
              </Button>
              <p className="text-xs text-muted-foreground">Secure one-time payment via Stripe.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const project = report.project;
  const calc = report.calculation;
  const bom = report.bom as Array<Record<string, any>>;

  const designNotes = generateDesignNotes({
    systemType: project.systemType,
    annualKwh: project.annualKwh,
    dailyKwh: calc.dailyKwh,
    adjustedArraySizeKw: calc.adjustedArraySizeKw,
    numPanels: calc.numPanels,
    peakSunHours: calc.peakSunHours,
    batteryUsableKwh: calc.batteryUsableKwh,
    totalBatteryBankKwh: calc.totalBatteryBankKwh,
    backupHours: project.backupHours,
    customBackupHours: project.customBackupHours,
    totalSystemLossPct: calc.totalSystemLossPct,
    shadeLossPct: calc.shadeLossPct,
    shadeLevel: project.shadeLevel,
    budgetTier: project.budgetTier,
    state: project.state,
    snowArea: project.snowArea,
    highWindArea: project.highWindArea,
    installationType: project.installationType,
    inverterSizeKw: calc.inverterSizeKw,
    yearlyProductionKwh: calc.yearlyProductionKwh,
    paybackYears: calc.paybackYears,
    utilityRatePerKwh: project.utilityRatePerKwh,
  });

  // PVWatts enrichment data — typed loosely since JSONB field may have extra keys
  const pvCalc = calc as typeof calc & {
    pvwattsMonthlyKwh?: number[] | null;
    pvwattsSolradMonthly?: number[] | null;
    pvwattsAnnualKwh?: number | null;
    pvwattsSolradAnnual?: number | null;
    pvwattsCapacityFactor?: number | null;
    pvwattsSource?: string | null;
    productionEstimateLabel?: string | null;
  };

  const hasPVWatts = pvCalc.pvwattsSource === "pvwatts" && Array.isArray(pvCalc.pvwattsMonthlyKwh);
  const hasMonthlyProduction = Array.isArray(pvCalc.pvwattsMonthlyKwh);

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const monthlyChartData = hasMonthlyProduction
    ? (pvCalc.pvwattsMonthlyKwh as number[]).map((kwh, i) => ({
        month: MONTH_NAMES[i],
        kwh,
        solrad: pvCalc.pvwattsSolradMonthly ? Math.round((pvCalc.pvwattsSolradMonthly as number[])[i] * 10) / 10 : null,
      }))
    : null;

  const lossData = [
    { name: "Inverter", value: calc.inverterLossPct, color: "#f59e0b" },
    { name: "Wire", value: calc.wireLossPct, color: "#fb923c" },
    { name: "Shade", value: calc.shadeLossPct, color: "#64748b" },
    { name: "Temp", value: calc.tempLossPct, color: "#ef4444" },
    { name: "Dirt", value: calc.dirtLossPct, color: "#a16207" },
    { name: "Mismatch", value: calc.misMatchLossPct ?? 2, color: "#8b5cf6" },
    ...(calc.batteryLossPct > 0 ? [{ name: "Battery", value: calc.batteryLossPct, color: "#6366f1" }] : []),
  ].filter(d => d.value > 0);

  const systemTypeLabel = project.systemType.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");
  const hasBattery = calc.batteryUsableKwh > 0;
  // isPaid: true when the project has been unlocked via a successful Stripe payment
  const isPaid = !!project.paidAt;
  const reportDeliveryStatus = (project as { reportDeliveryStatus?: string | null }).reportDeliveryStatus;
  const purchaserEmail = (project as { purchaserEmail?: string | null }).purchaserEmail;

  const noteIcon = (type: string) => {
    if (type === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />;
    if (type === "tip") return <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />;
    return <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
  };

  const noteStyle = (type: string) => {
    if (type === "warning") return "border-amber-300 bg-amber-50 dark:bg-amber-950/20";
    if (type === "tip") return "border-primary/30 bg-primary/5";
    return "border-blue-200 bg-blue-50 dark:bg-blue-950/20";
  };

  // Group BOM by category
  const bomCategories = Array.from(new Set(bom.map((b) => String(b.category))));

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        {isPaid && (
          <ContractorProposalReport
            project={project}
            calc={calc}
            bom={bom}
            bomCategories={bomCategories}
            monthlyChartData={monthlyChartData}
            hasPVWatts={hasPVWatts}
            hasBattery={hasBattery}
            systemTypeLabel={systemTypeLabel}
            designNotes={designNotes}
          />
        )}

        <div className="interactive-report flex flex-col gap-8 print:hidden">

        {/* ── Report Header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:hidden">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sun className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Solar Design Report</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">{project.name}</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{project.address}, {project.city}, {project.state} {project.zip}</span>
            </p>
          </div>
          {/* PVWatts badge */}
          {hasPVWatts && (
            <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-300 bg-green-50 text-green-700 mt-1 w-fit">
              <Sun className="h-3 w-3" />
              Real NREL PVWatts Data
            </div>
          )}
          {pvCalc.pvwattsSource === "fallback" && (
            <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 mt-1 w-fit">
              <Info className="h-3 w-3" />
              Approximate production estimate
            </div>
          )}
          {/* Action buttons — compact icon+label on mobile, full on desktop */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <Link href={`/results/${project.id}/placement`}>
              <Button variant="outline" size="sm" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/5">
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Placement</span>
              </Button>
            </Link>
            <Link href={`/projects/${project.id}/edit`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            {isPaid ? (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.location.href = getReportPdfUrl(projectId)}>
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download Branded </span>PDF
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0"
                onClick={() => handleUnlockReport("homeowner_report")}
                disabled={isRedirecting}
              >
                {isRedirecting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Lock className="h-3.5 w-3.5" />}
                Unlock Report
              </Button>
            )}
            <Link href="/wizard">
              <Button size="sm" className="gap-1.5">
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New </span>Design
              </Button>
            </Link>
          </div>
        </div>

        {/* Print Header (only shows when printing) */}
        <div className="hidden print:block border-b-2 border-primary pb-4 mb-2">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Solar Design Report</div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <p className="text-gray-600 text-sm">{project.address}, {project.city}, {project.state} {project.zip}</p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div className="text-lg font-bold text-orange-500">OffGrid Solar Builder</div>
              <div>Generated {new Date().toLocaleDateString()}</div>
              <div>{systemTypeLabel} System · {project.budgetTier} tier</div>
            </div>
          </div>
        </div>

        {isPaid && (
          <Card className="print:hidden border-green-200 bg-green-50/70 dark:bg-green-950/20">
            <CardContent className="py-4 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Full report unlocked
                </div>
                <p className="text-sm text-muted-foreground">
                  Download the branded PDF or send the report link to a guest checkout email.
                  {reportDeliveryStatus === "sent" && purchaserEmail ? ` Last delivery: ${purchaserEmail}.` : ""}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 lg:w-auto">
                <Input
                  className="sm:w-64 bg-background"
                  type="email"
                  value={deliveryEmail}
                  placeholder={purchaserEmail ?? "customer@example.com"}
                  onChange={(event) => setDeliveryEmail(event.target.value)}
                  aria-label="Report delivery email"
                />
                <Button variant="outline" className="gap-1.5" onClick={handleEmailReport} disabled={isEmailingReport}>
                  {isEmailingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  Email Report
                </Button>
                <Button className="gap-1.5" onClick={() => window.location.href = getReportPdfUrl(projectId)}>
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Section 1: System Summary ──────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> System Summary
          </h2>
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <Card className="bg-primary/5 border-primary/25">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Solar Array</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-black text-primary">{calc.adjustedArraySizeKw.toFixed(2)} kW</div>
                <div className="text-sm font-medium mt-1">{calc.numPanels} panels{calc.numPanels > 0 ? ` × ~${Math.round(calc.adjustedArraySizeKw * 1000 / calc.numPanels / 5) * 5}W` : ""}</div>
                <div className="text-xs text-muted-foreground">{calc.yearlyProductionKwh.toLocaleString()} kWh/yr est.</div>
              </CardContent>
            </Card>
            <Card className="bg-primary/5 border-primary/25">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Battery Storage</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {hasBattery ? (
                  <>
                    <div className="text-3xl font-black text-primary">{calc.batteryUsableKwh.toFixed(1)} kWh</div>
                    <div className="text-sm font-medium mt-1">Usable capacity</div>
                    <div className="text-xs text-muted-foreground">{calc.totalBatteryBankKwh.toFixed(1)} kWh total bank</div>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-black text-muted-foreground">None</div>
                    <div className="text-sm font-medium mt-1 text-muted-foreground">No battery selected</div>
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="bg-primary/5 border-primary/25">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Inverter</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-black text-primary">{calc.inverterSizeKw.toFixed(1)} kW</div>
                <div className="text-sm font-medium mt-1">Recommended rating</div>
                <div className="text-xs text-muted-foreground">{systemTypeLabel} type</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {[
                      ["System Type", systemTypeLabel],
                      ["Location", `${project.city}, ${project.state}`],
                      ["Daily Usage", `${calc.dailyKwh.toFixed(1)} kWh/day`],
                      ["Annual Usage", `${project.annualKwh.toLocaleString()} kWh/yr`],
                      ["Peak Sun Hours", `${calc.peakSunHours} hrs/day${hasPVWatts ? " (PVWatts)" : ` (${project.state})`}`],
                      ["Installation", project.installationType === "carport" ? "Carport" : project.installationType.charAt(0).toUpperCase() + project.installationType.slice(1) + " Mount"],
                      ["Budget Tier", project.budgetTier.charAt(0).toUpperCase() + project.budgetTier.slice(1)],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td className="py-2 text-muted-foreground font-medium w-1/2">{label}</td>
                        <td className="py-2 font-semibold text-right">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {[
                      ["Array Size (gross)", `${calc.arraySizeKw.toFixed(2)} kW`],
                      ["Array Size (adjusted)", `${calc.adjustedArraySizeKw.toFixed(2)} kW`],
                      ["Number of Panels", `${calc.numPanels} panels`],
                      ...(calc.squareFeetRequired != null ? [["Panel Footprint", `~${calc.squareFeetRequired} sqft${project.availableSqft ? ` of ${project.availableSqft} sqft` : ""}`]] : []),
                      ["Inverter Size", `${calc.inverterSizeKw.toFixed(1)} kW`],
                      ["Est. Yearly Production", `${calc.yearlyProductionKwh.toLocaleString()} kWh${hasPVWatts ? " ✓" : ""}`],
                      ["Est. Yearly Savings", `$${calc.estimatedYearlySavings.toLocaleString()}`],
                      ...(pvCalc.pvwattsCapacityFactor != null ? [["System Efficiency", `${pvCalc.pvwattsCapacityFactor.toFixed(1)}% capacity factor`]] : []),
                      ...(calc.offGridDesignFactor != null && calc.offGridDesignFactor > 1 ? [["Design Margin", `+${((calc.offGridDesignFactor - 1) * 100).toFixed(0)}% (${project.systemType} reserve)`]] : []),
                      ...(calc.paybackYears
                        ? [[
                            "Est. Payback Period",
                            calc.paybackYears > 50
                              ? "> 50 yrs (battery cost dominates)"
                              : `${calc.paybackYears.toFixed(1)} years`,
                          ]]
                        : []),
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td className="py-2 text-muted-foreground font-medium w-1/2">{label}</td>
                        <td className="py-2 font-semibold text-right">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Monthly Production Chart ──────────────────────────────── */}
        {monthlyChartData && (
          <section>
            <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Sun className="h-4 w-4 text-primary" /> Monthly Solar Production
              <span className={`ml-1 text-xs font-normal normal-case tracking-normal border px-2 py-0.5 rounded-full ${
                hasPVWatts
                  ? "text-green-700 bg-green-50 border-green-200"
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}>
                {hasPVWatts ? "NREL PVWatts v8" : "State seasonal estimate"}
              </span>
            </h2>
            <Card>
              <CardContent className="pt-5 pb-2 space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-center">
                    <div className="text-xl font-black text-primary">{pvCalc.pvwattsAnnualKwh?.toLocaleString()} kWh</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Annual AC Production</div>
                  </div>
                  <div className="rounded-md bg-muted/50 border p-3 text-center">
                    <div className="text-xl font-black">{pvCalc.pvwattsSolradAnnual?.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Peak Sun Hrs/day</div>
                  </div>
                  <div className="rounded-md bg-muted/50 border p-3 text-center">
                    <div className="text-xl font-black">
                      {pvCalc.pvwattsCapacityFactor != null ? `${pvCalc.pvwattsCapacityFactor.toFixed(1)}%` : "Est."}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Capacity Factor</div>
                  </div>
                </div>

                {/* Monthly bar chart */}
                <div className="h-52 print:h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyChartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toString()}
                        unit=""
                        width={42}
                      />
                      <Tooltip
                        formatter={(v: number) => [`${v.toLocaleString()} kWh`, "AC Production"]}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <ReferenceLine
                        y={pvCalc.pvwattsAnnualKwh ? Math.round(pvCalc.pvwattsAnnualKwh / 12) : 0}
                        stroke="#f59e0b"
                        strokeDasharray="4 3"
                        strokeWidth={1.5}
                        label={{ value: "avg", position: "right", fontSize: 10, fill: "#f59e0b" }}
                      />
                      <Bar dataKey="kwh" radius={[3, 3, 0, 0]} maxBarSize={36}>
                        {monthlyChartData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.kwh >= (pvCalc.pvwattsAnnualKwh ? pvCalc.pvwattsAnnualKwh / 12 : 0)
                              ? "#f59e0b"
                              : "#fdba74"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly table — collapsible on mobile */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground font-medium py-1 select-none">
                    Show monthly breakdown table
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                          <th className="pb-2 text-left">Month</th>
                          <th className="pb-2 text-right">AC (kWh)</th>
                          {monthlyChartData[0].solrad != null && <th className="pb-2 text-right">Peak Sun Hrs</th>}
                          <th className="pb-2 text-right">% of Annual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {monthlyChartData.map((row) => (
                          <tr key={row.month}>
                            <td className="py-1.5 font-medium">{row.month}</td>
                            <td className="py-1.5 text-right font-mono">{row.kwh.toLocaleString()}</td>
                            {row.solrad != null && <td className="py-1.5 text-right font-mono">{row.solrad}</td>}
                            <td className="py-1.5 text-right text-muted-foreground">
                              {pvCalc.pvwattsAnnualKwh
                                ? `${((row.kwh / pvCalc.pvwattsAnnualKwh) * 100).toFixed(1)}%`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr className="font-bold border-t-2">
                          <td className="pt-2">Annual</td>
                          <td className="pt-2 text-right font-mono text-primary">
                            {pvCalc.pvwattsAnnualKwh?.toLocaleString()}
                          </td>
                          {monthlyChartData[0].solrad != null && (
                            <td className="pt-2 text-right font-mono">{pvCalc.pvwattsSolradAnnual?.toFixed(2)} avg</td>
                          )}
                          <td className="pt-2 text-right">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>

                <p className="text-xs text-muted-foreground">
                  {hasPVWatts
                    ? `Production modeled using NREL PVWatts v8 weather data for ${project.city}, ${project.state}.`
                    : `Production uses an approximate state seasonal model because PVWatts data was unavailable for this run.`}
                  Actual output may vary ±10–15% based on weather, soiling, and equipment performance.
                </p>
              </CardContent>
            </Card>
          </section>
        )}

        {/* ── Battery System Guide (only when battery selected) ─────── */}
        {hasBattery && (() => {
          const chemistry = (project as { batteryChemistry?: string | null }).batteryChemistry ?? "lifepo4";
          const totalKwh = calc.totalBatteryBankKwh;
          const usableKwh = calc.batteryUsableKwh;
          const dod = chemistry === "lifepo4" ? 80 : 50;
          const unitKwh = chemistry === "lifepo4" ? 5 : chemistry === "agm" ? 2.4 : 2.0;
          const numUnits = Math.ceil(totalKwh / unitKwh);
          const isRoof = !project.installationType || project.installationType === "roof";
          // lead-acid requires outdoor ventilated enclosure; lifepo4 and agm are safe indoors
          const isIndoor = chemistry !== "lead-acid";

          const chemLabel: Record<string, string> = {
            lifepo4: "LiFePO4 (Lithium Iron Phosphate)",
            agm: "AGM (Absorbed Glass Mat)",
            "lead-acid": "Flooded Lead-Acid",
          };
          const chemColor: Record<string, string> = {
            lifepo4: "text-green-700 bg-green-50 border-green-200",
            agm: "text-blue-700 bg-blue-50 border-blue-200",
            "lead-acid": "text-amber-700 bg-amber-50 border-amber-200",
          };

          return (
            <section>
              <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <Battery className="h-4 w-4 text-primary" /> Battery System Guide
              </h2>
              <Card>
                <CardContent className="pt-5 pb-5 space-y-5">

                  {/* Key numbers row */}
                  {(() => {
                    const autonomyDays = (calc as unknown as Record<string, unknown>).batteryAutonomyDays as number | undefined;
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-center">
                          <div className="text-2xl font-black text-primary">{usableKwh.toFixed(1)} kWh</div>
                          <div className="text-xs text-muted-foreground mt-1">Usable storage capacity</div>
                        </div>
                        <div className="rounded-md bg-muted/50 border p-3 text-center">
                          <div className="text-2xl font-black">{totalKwh.toFixed(1)} kWh</div>
                          <div className="text-xs text-muted-foreground mt-1">Total bank size ({dod}% DoD)</div>
                        </div>
                        <div className="rounded-md bg-muted/50 border p-3 text-center">
                          <div className="text-2xl font-black">{numUnits}</div>
                          <div className="text-xs text-muted-foreground mt-1">Battery units (~{unitKwh} kWh each)</div>
                        </div>
                        <div className="rounded-md bg-muted/50 border p-3 text-center">
                          <div className="text-2xl font-black">
                            {autonomyDays != null
                              ? autonomyDays >= 1
                                ? `${autonomyDays.toFixed(1)}d`
                                : `${Math.round(autonomyDays * 24)}h`
                              : `${dod}%`}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {autonomyDays != null ? "Autonomy (days)" : "Depth of discharge"}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Sizing assumptions breakdown ─────────────────────── */}
                  {(() => {
                    const a = calc as unknown as Record<string, unknown>;
                    const autonomyDays   = a.batteryAutonomyDays         as number | undefined;
                    const invEff         = a.batteryInverterEfficiencyPct as number | undefined;
                    const surgeRes       = a.batterySurgeReservePct       as number | undefined;
                    const weatherRes     = a.batteryWeatherReservePct     as number | undefined;
                    const effectiveDodPct= a.batteryEffectiveDodPct       as number | undefined;
                    const coldDer        = a.batteryColdDeratingPct       as number | undefined;
                    const rawLoad        = a.batteryRawDailyLoadKwh       as number | undefined;
                    const adjLoad        = a.batteryInverterAdjustedLoadKwh as number | undefined;
                    if (autonomyDays == null || rawLoad == null) return null;
                    const autonomyHrs    = Math.round(autonomyDays * 24);
                    const autonomyLoad   = (adjLoad ?? rawLoad) * autonomyDays;
                    const afterSurge     = autonomyLoad * (1 + (surgeRes ?? 0) / 100);
                    return (
                      <details className="group border rounded-lg overflow-hidden" open={false}>
                        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors select-none text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <span>How We Sized This Bank</span>
                          <span className="group-open:rotate-180 transition-transform duration-200">▾</span>
                        </summary>
                        <div className="px-4 py-3 space-y-0 text-xs divide-y">

                          <div className="flex items-start justify-between gap-2 py-2">
                            <div>
                              <span className="font-semibold text-foreground">Autonomy target</span>
                              <span className="ml-2 text-muted-foreground">Days of operation without solar recharge</span>
                            </div>
                            <div className="text-right shrink-0 font-mono font-semibold">
                              {autonomyDays >= 1 ? `${autonomyDays.toFixed(1)} days` : `${autonomyHrs} hrs`}
                              <div className="text-muted-foreground font-normal">{autonomyHrs} hrs total</div>
                            </div>
                          </div>

                          <div className="flex items-start justify-between gap-2 py-2">
                            <div>
                              <span className="font-semibold text-foreground">Daily AC load</span>
                              <span className="ml-2 text-muted-foreground">Average household demand</span>
                            </div>
                            <div className="text-right shrink-0 font-mono font-semibold">{rawLoad.toFixed(2)} kWh/day</div>
                          </div>

                          {invEff != null && invEff < 100 && (
                            <div className="flex items-start justify-between gap-2 py-2">
                              <div>
                                <span className="font-semibold text-foreground">Inverter efficiency adjustment</span>
                                <span className="ml-2 text-muted-foreground">Battery must supply more than the AC load — inverter converts DC→AC at {invEff}% efficiency</span>
                              </div>
                              <div className="text-right shrink-0 font-mono font-semibold">
                                ÷ {invEff}%
                                <div className="text-muted-foreground font-normal">{(adjLoad ?? rawLoad).toFixed(2)} kWh/day</div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-start justify-between gap-2 py-2">
                            <div>
                              <span className="font-semibold text-foreground">Autonomy load</span>
                              <span className="ml-2 text-muted-foreground">Inverter-adjusted load × autonomy days</span>
                            </div>
                            <div className="text-right shrink-0 font-mono font-semibold">{autonomyLoad.toFixed(2)} kWh</div>
                          </div>

                          {(surgeRes ?? 0) > 0 && (
                            <div className="flex items-start justify-between gap-2 py-2">
                              <div>
                                <span className="font-semibold text-foreground">Surge reserve</span>
                                <span className="ml-2 text-muted-foreground">+{surgeRes}% for AC motor startups (well pumps, compressors, HVAC) that draw 2–6× nameplate current</span>
                              </div>
                              <div className="text-right shrink-0 font-mono font-semibold">
                                +{surgeRes}%
                                <div className="text-muted-foreground font-normal">{afterSurge.toFixed(2)} kWh</div>
                              </div>
                            </div>
                          )}

                          {(weatherRes ?? 0) > 0 && (
                            <div className="flex items-start justify-between gap-2 py-2">
                              <div>
                                <span className="font-semibold text-foreground">Energy reserve</span>
                                <span className="ml-2 text-muted-foreground">
                                  +{weatherRes}% margin for inverter idle draw, battery aging, forecast misses, and small load growth
                                </span>
                              </div>
                              <div className="text-right shrink-0 font-mono font-semibold">
                                +{weatherRes}%
                                <div className="text-muted-foreground font-normal">{usableKwh.toFixed(2)} kWh usable</div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-start justify-between gap-2 py-2">
                            <div>
                              <span className="font-semibold text-foreground">Depth of discharge (DoD)</span>
                              <span className="ml-2 text-muted-foreground">
                                {chemistry === "lifepo4"
                                  ? "LiFePO4 can safely use 80% of rated capacity without accelerating degradation"
                                  : "AGM/lead-acid limited to 50% DoD to preserve cycle life (750–1,200 cycles at 50% vs 300 at 80%)"}
                              </span>
                            </div>
                            <div className="text-right shrink-0 font-mono font-semibold">
                              ÷ {effectiveDodPct ?? dod}%
                              <div className="text-muted-foreground font-normal">{totalKwh.toFixed(2)} kWh bank</div>
                            </div>
                          </div>

                          {(coldDer ?? 0) > 0 && (
                            <div className="flex items-start justify-between gap-2 py-2">
                              <div>
                                <span className="font-semibold text-foreground">Cold-climate derating</span>
                                <span className="ml-2 text-muted-foreground">+{coldDer}% bank oversize — lead-acid/AGM loses 20–30% capacity at freezing temperatures</span>
                              </div>
                              <div className="text-right shrink-0 font-mono font-semibold text-amber-600">
                                +{coldDer}%
                                <div className="text-muted-foreground font-normal">{totalKwh.toFixed(2)} kWh final</div>
                              </div>
                            </div>
                          )}

                        </div>
                      </details>
                    );
                  })()}

                  {/* Chemistry badge */}
                  <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border ${chemColor[chemistry] ?? "text-muted-foreground bg-muted border-border"}`}>
                    <span>⚡</span> Chemistry: {chemLabel[chemistry] ?? chemistry}
                  </div>

                  {/* Chemistry-specific facts */}
                  <div className="grid sm:grid-cols-2 gap-3 text-xs">
                    {chemistry === "lifepo4" && (
                      <>
                        <BatteryFact icon="✅" label="Cycle life" value="3,000–6,000 cycles (10–16 yrs)" />
                        <BatteryFact icon="🔒" label="Safety" value="Thermally stable, no off-gassing" />
                        <BatteryFact icon="🌡️" label="Temp range" value="-4°F to 131°F operating" />
                        <BatteryFact icon="🔧" label="Maintenance" value="None — sealed BMS managed" />
                      </>
                    )}
                    {chemistry === "agm" && (
                      <>
                        <BatteryFact icon="✅" label="Cycle life" value="500–1,200 cycles (3–7 yrs)" />
                        <BatteryFact icon="🔒" label="Safety" value="Sealed, minimal off-gassing" />
                        <BatteryFact icon="🌡️" label="Temp range" value="14°F to 104°F ideal" />
                        <BatteryFact icon="🔧" label="Maintenance" value="Low — check terminals annually" />
                      </>
                    )}
                    {chemistry === "lead-acid" && (
                      <>
                        <BatteryFact icon="✅" label="Cycle life" value="300–700 cycles (3–5 yrs)" />
                        <BatteryFact icon="⚠️" label="Safety" value="Off-gasses hydrogen — ventilation required" />
                        <BatteryFact icon="🌡️" label="Temp range" value="59°F to 77°F optimal" />
                        <BatteryFact icon="🔧" label="Maintenance" value="Monthly — check & top electrolyte levels" />
                      </>
                    )}
                  </div>

                  {/* Placement section */}
                  <div className="border-t pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Where to Install the Battery Bank</p>
                    <div className="space-y-2">
                      {isIndoor ? (
                        <>
                          <PlacementTip icon="🏠" color="green">
                            <strong>Indoor installation recommended</strong> — {chemistry === "lifepo4" ? "LiFePO4 batteries are safe indoors: no off-gassing, sealed cells, built-in BMS." : "AGM batteries are sealed and can be installed indoors in a utility room or garage."}
                          </PlacementTip>
                          <PlacementTip icon="📍" color="green">
                            <strong>Best location: utility room, garage, or basement</strong> near the main electrical panel. Keep wire runs short — ideally within 10 ft of the inverter/charger to minimize voltage drop.
                          </PlacementTip>
                          <PlacementTip icon="🌡️" color="amber">
                            <strong>Temperature matters.</strong> Keep batteries between 50–85°F for best performance and longest life. Avoid uninsulated garages in extreme climates — cold reduces capacity significantly.
                          </PlacementTip>
                          <PlacementTip icon="🏗️" color="amber">
                            <strong>Floor loading.</strong> {numUnits} battery units weigh approximately {Math.round(numUnits * (chemistry === "lifepo4" ? 55 : 65))} lbs total. Install on a concrete floor or reinforced shelf rated for the weight. Do not stack on wood floors without checking load capacity.
                          </PlacementTip>
                        </>
                      ) : (
                        <>
                          <PlacementTip icon="🏭" color="amber">
                            <strong>Dedicated ventilated enclosure required.</strong> Flooded lead-acid batteries produce hydrogen gas during charging. Install in a vented battery box, shed, or room with forced air exchange — never in living space.
                          </PlacementTip>
                          <PlacementTip icon="💨" color="amber">
                            <strong>Ventilation sizing.</strong> Minimum 1 sq ft of vent area per 100 Ah of battery capacity at 48V. Low vent at floor level for air intake, high vent near ceiling for hydrogen exhaust.
                          </PlacementTip>
                          <PlacementTip icon="📍" color="blue">
                            <strong>Keep close to the inverter</strong> — short, thick cable runs (2/0 or 4/0 AWG) reduce voltage drop. Outdoor sheds work well if insulated for temperature stability.
                          </PlacementTip>
                          <PlacementTip icon="🔧" color="blue">
                            <strong>Monthly maintenance access.</strong> Leave at least 18 inches of clearance on all sides for checking electrolyte levels and cleaning terminals. Label all batteries with installation date.
                          </PlacementTip>
                        </>
                      )}
                      {isRoof && (
                        <PlacementTip icon="⚡" color="blue">
                          <strong>Roof mount + battery pairing.</strong> Your inverter will likely be mounted on an exterior wall or in the garage. Place the battery bank on the same wall or directly adjacent — this minimizes the high-current DC cable run between them.
                        </PlacementTip>
                      )}
                    </div>
                  </div>

                  {/* Wiring note */}
                  <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <strong className="text-foreground">Wiring note:</strong> Battery banks at 48V nominal require heavy-gauge interconnect cable — typically 2/0–4/0 AWG copper for runs under 10 ft. All connections must be fused per NEC 690. A licensed electrician or certified solar installer must sign off on the battery wiring before commissioning.
                  </div>

                </CardContent>
              </Card>
            </section>
          );
        })()}

        {/* ── Section 2: Cost Estimate ───────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Cost Estimate
          </h2>

          {/* Helper to format a cost breakdown row */}
          {(() => {
            const hasBatteryCost = (calc.batteryDiyCostLow ?? 0) > 0;

            function CostBreakdownRow({ label, low, high, bold }: { label: string; low: number; high: number; bold?: boolean }) {
              return (
                <div className={`flex justify-between text-sm py-1.5 ${bold ? "border-t mt-1 pt-2.5 font-bold text-foreground" : "text-muted-foreground"}`}>
                  <span>{label}</span>
                  <span className={bold ? "text-foreground" : ""}>${Math.round(low).toLocaleString()} – ${Math.round(high).toLocaleString()}</span>
                </div>
              );
            }

            return (
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Professional Installation */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Professional Installation</CardTitle>
                    <CardDescription>Turnkey, fully installed by a licensed contractor</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black">
                      ${Math.round(calc.installedCostLow).toLocaleString()} – ${Math.round(calc.installedCostHigh).toLocaleString()}
                    </div>
                    {hasBatteryCost && (
                      <div className="mt-3 pt-3 border-t space-y-0.5">
                        <CostBreakdownRow
                          label={`Solar array (${calc.adjustedArraySizeKw.toFixed(1)} kW)`}
                          low={calc.solarArrayInstalledCostLow ?? calc.solarArrayDiyCostLow ?? 0}
                          high={calc.solarArrayInstalledCostHigh ?? calc.solarArrayDiyCostHigh ?? 0}
                        />
                        <CostBreakdownRow
                          label={`Battery system (${calc.totalBatteryBankKwh.toFixed(1)} kWh bank)`}
                          low={calc.batteryInstalledCostLow ?? 0}
                          high={calc.batteryInstalledCostHigh ?? 0}
                        />
                        <CostBreakdownRow
                          label="Total installed"
                          low={calc.installedCostLow}
                          high={calc.installedCostHigh}
                          bold
                        />
                      </div>
                    )}
                    {!hasBatteryCost && (
                      <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                        <p>${(calc.installedCostLow / (calc.adjustedArraySizeKw * 1000)).toFixed(2)} – ${(calc.installedCostHigh / (calc.adjustedArraySizeKw * 1000)).toFixed(2)}/W (solar panels + inverter + racking + labor)</p>
                        {(calc.inverterCostEstimate != null && calc.mountingCostEstimate != null) && (
                          <div className="pt-1 border-t space-y-0.5">
                            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Est. component breakdown</p>
                            <div className="flex justify-between"><span>Inverter (~{calc.inverterSizeKw.toFixed(1)} kW)</span><span>~${Math.round(calc.inverterCostEstimate).toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Mounting/racking ({calc.numPanels} panels)</span><span>~${Math.round(calc.mountingCostEstimate).toLocaleString()}</span></div>
                          </div>
                        )}
                      </div>
                    )}
                    {calc.paybackYears && (
                      <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                        <span className="text-muted-foreground">Est. payback period</span>
                        <span className="font-semibold">{calc.paybackYears.toFixed(1)} yrs</span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-muted-foreground">Est. yearly savings</span>
                      <span className="font-semibold text-green-600">${calc.estimatedYearlySavings.toLocaleString()}/yr</span>
                    </div>
                  </CardContent>
                </Card>

                {/* DIY Equipment */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">DIY Equipment Only</CardTitle>
                    <CardDescription>Self-installed — equipment purchase cost only, no labor</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black text-muted-foreground">
                      ${Math.round(calc.diyEquipmentCostLow).toLocaleString()} – ${Math.round(calc.diyEquipmentCostHigh).toLocaleString()}
                    </div>
                    {hasBatteryCost && (
                      <div className="mt-3 pt-3 border-t space-y-0.5">
                        <CostBreakdownRow
                          label={`Solar array (${calc.adjustedArraySizeKw.toFixed(1)} kW)`}
                          low={calc.solarArrayDiyCostLow ?? 0}
                          high={calc.solarArrayDiyCostHigh ?? 0}
                        />
                        <CostBreakdownRow
                          label={`Battery equipment (${calc.totalBatteryBankKwh.toFixed(1)} kWh)`}
                          low={calc.batteryDiyCostLow ?? 0}
                          high={calc.batteryDiyCostHigh ?? 0}
                        />
                        <CostBreakdownRow
                          label="Total equipment"
                          low={calc.diyEquipmentCostLow}
                          high={calc.diyEquipmentCostHigh}
                          bold
                        />
                      </div>
                    )}
                    {!hasBatteryCost && (
                      <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                        <p>${(calc.diyEquipmentCostLow / (calc.adjustedArraySizeKw * 1000)).toFixed(2)} – ${(calc.diyEquipmentCostHigh / (calc.adjustedArraySizeKw * 1000)).toFixed(2)}/W (solar panels + inverter + racking, equipment only)</p>
                        {(calc.inverterCostEstimate != null && calc.mountingCostEstimate != null) && (
                          <div className="pt-1 border-t space-y-0.5">
                            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Est. component breakdown</p>
                            <div className="flex justify-between"><span>Inverter (~{calc.inverterSizeKw.toFixed(1)} kW)</span><span>~${Math.round(calc.inverterCostEstimate).toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Mounting/racking ({calc.numPanels} panels)</span><span>~${Math.round(calc.mountingCostEstimate).toLocaleString()}</span></div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        DIY installation must still comply with local building and electrical codes. Permits, inspections, and electrical sign-off are required.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* Used / Refurbished Market */}
          {(() => {
            const usedSolarLow = calc.usedSolarEquipCostLow ?? 0;
            const usedSolarHigh = calc.usedSolarEquipCostHigh ?? 0;
            const hasUsedBattery = typeof calc.usedBatteryEquipCostLow === "number" && (calc.usedBatteryEquipCostLow ?? 0) > 0;
            const hasBatteryAtAll = (calc.batteryDiyCostLow ?? 0) > 0;
            const usedTotalLow  = usedSolarLow  + (hasUsedBattery ? (calc.usedBatteryEquipCostLow ?? 0) : hasBatteryAtAll ? (calc.batteryDiyCostLow ?? 0) : 0);
            const usedTotalHigh = usedSolarHigh + (hasUsedBattery ? (calc.usedBatteryEquipCostHigh ?? 0) : hasBatteryAtAll ? (calc.batteryDiyCostHigh ?? 0) : 0);

            function UsedRow({ label, low, high, bold }: { label: string; low: number; high: number; bold?: boolean }) {
              return (
                <div className={`flex justify-between text-sm py-1.5 ${bold ? "border-t mt-1 pt-2.5 font-bold text-foreground" : "text-muted-foreground"}`}>
                  <span>{label}</span>
                  <span>${Math.round(low).toLocaleString()} – ${Math.round(high).toLocaleString()}</span>
                </div>
              );
            }

            return (
              <div className="mt-4 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">♻</span>
                  <span className="font-semibold text-sm">Used / Refurbished Market Estimate</span>
                  <span className="ml-auto text-xs text-muted-foreground">Equipment purchase only</span>
                </div>
                <div className="space-y-0.5">
                  <UsedRow label={`Used panels + inverter (${calc.adjustedArraySizeKw.toFixed(1)} kW)`} low={usedSolarLow} high={usedSolarHigh} />
                  {hasUsedBattery && (
                    <UsedRow label={`Used batteries (${calc.totalBatteryBankKwh.toFixed(1)} kWh, lead-acid)`} low={calc.usedBatteryEquipCostLow ?? 0} high={calc.usedBatteryEquipCostHigh ?? 0} />
                  )}
                  {hasBatteryAtAll && !hasUsedBattery && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>Used LiFePO4 batteries are <strong>not recommended</strong> — state of health and remaining cycle life are unknown. New battery cost applies.</span>
                    </div>
                  )}
                  {(hasBatteryAtAll) && (
                    <UsedRow
                      label="Estimated used market total"
                      low={usedTotalLow}
                      high={usedTotalHigh}
                      bold
                    />
                  )}
                  {!hasBatteryAtAll && (
                    <UsedRow label="Estimated used market total" low={usedSolarLow} high={usedSolarHigh} bold />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-3 pt-2 border-t">
                  Used solar panels and inverters are widely available through eBay, Craigslist, and specialty solar resellers at 40–55% of new cost. Mounting hardware and wiring should always be purchased new. Inspect used panels for microcracks (EL imaging) and verify used inverters carry remaining warranty before purchase.
                </p>
              </div>
            );
          })()}

          <div className="mt-3 p-3 rounded-lg border bg-muted/30 text-xs text-muted-foreground">
            Prices are preliminary estimates for the {project.budgetTier} equipment tier and may vary by 15–25% based on market conditions, specific equipment selection, local labor rates, and site conditions. Battery costs are priced per kWh of total rated bank capacity at the selected chemistry rates. Federal ITC (30%) and state incentives are not reflected — the 30% tax credit significantly reduces net cost.
          </div>

          {/* Find a Professional Installer */}
          <div className="mt-4 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🏗</span>
              <span className="font-semibold text-sm">Find a Professional Installer</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Connect with vetted, certified solar installers in your area. Always get 3+ quotes and verify NABCEP certification.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                { name: "EnergySage", desc: "Compare quotes from pre-screened local installers", url: "https://www.energysage.com", badge: "Most popular" },
                { name: "SolarReviews", desc: "Read verified reviews and find installers near you", url: "https://www.solarreviews.com", badge: null },
                { name: "NABCEP Installer Locator", desc: "Find certified solar professionals (highest credential)", url: "https://www.nabcep.org/installer-locator", badge: "Certified" },
                { name: "SEIA Member Directory", desc: "Solar Energy Industries Association installer list", url: "https://www.seia.org/find-a-solar-installer", badge: null },
                { name: "Sunrun", desc: "Largest residential solar installer — nationwide coverage", url: "https://www.sunrun.com", badge: null },
                { name: "SunPower", desc: "Premium panels + installation with 25-yr warranty", url: "https://us.sunpower.com", badge: "Premium" },
              ].map(({ name, desc, url, badge }) => (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-md border bg-muted/30 px-3 py-2.5 hover:bg-muted/60 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold group-hover:text-primary transition-colors">{name}</span>
                      {badge && <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">{badge}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                  </div>
                  <span className="text-muted-foreground group-hover:text-primary transition-colors text-xs mt-0.5">→</span>
                </a>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              For DIY resources: <a href="https://diysolarforum.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">DIY Solar Forum</a> · <a href="https://www.solar-electric.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Northern Arizona Wind & Sun</a> · <a href="https://www.wholesalesolar.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Wholesale Solar</a>
            </p>
          </div>
        </section>

        {/* ── Section 3: Loss Breakdown ──────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" /> System Loss Breakdown
          </h2>
          <Card className={!isPaid ? "opacity-40 pointer-events-none select-none blur-[2px]" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Total System Loss: {calc.totalSystemLossPct.toFixed(1)}%
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({calc.arraySizeKw.toFixed(2)} kW gross → {calc.adjustedArraySizeKw.toFixed(2)} kW adjusted)
                </span>
              </CardTitle>
              <CardDescription>
                Every solar system loses some output to real-world factors. These losses are applied to calculate your adjusted array size.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Bar Chart */}
              <div className="h-48 print:h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lossData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" unit="%" domain={[0, Math.max(...lossData.map(d => d.value)) + 2]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={56} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => [`${v}%`, "Loss"]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
                      {lossData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Loss table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="pb-2 text-left">Loss Type</th>
                    <th className="pb-2 text-right">%</th>
                    <th className="pb-2 text-right hidden sm:table-cell">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { name: "Inverter Conversion", pct: calc.inverterLossPct, note: "DC→AC conversion efficiency loss" },
                    { name: "Wire & Connection", pct: calc.wireLossPct, note: "Resistance losses in conductors" },
                    { name: "Shading", pct: calc.shadeLossPct, note: `${project.shadeLevel} shade on array` },
                    { name: "Temperature", pct: calc.tempLossPct, note: "Hot panels produce less power" },
                    { name: "Dirt & Soiling", pct: calc.dirtLossPct, note: "Dust, bird droppings, pollen" },
                    { name: "Panel Mismatch", pct: calc.misMatchLossPct ?? 2, note: "Manufacturing tolerance & string mismatch" },
                    ...(calc.batteryLossPct > 0 ? [{ name: "Battery Round-Trip", pct: calc.batteryLossPct, note: "Charge/discharge cycle loss" }] : []),
                  ].map(row => (
                    <tr key={row.name}>
                      <td className="py-2 font-medium">{row.name}</td>
                      <td className="py-2 text-right font-mono font-semibold">{row.pct}%</td>
                      <td className="py-2 text-right text-muted-foreground text-xs hidden sm:table-cell">{row.note}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2">
                    <td className="pt-3 pb-1">Total Loss</td>
                    <td className="pt-3 pb-1 text-right font-mono text-primary">{calc.totalSystemLossPct.toFixed(1)}%</td>
                    <td className="pt-3 pb-1 hidden sm:table-cell" />
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>

        {/* ── Section 4: Equipment / BOM ─────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" /> Equipment List
          </h2>

          {/* Paywall gate — shown when project is unpaid */}
          {!isPaid && (
            <Card className="border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 mb-4">
              <CardContent className="py-8 flex flex-col items-center text-center gap-4">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900">
                  <Lock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-1">Unlock the Full Solar Report</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Get the complete equipment bill of materials with real model numbers, 2024/2025
                    pricing, and alternative options — plus the full downloadable PDF solar design report.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="text-2xl font-extrabold text-amber-600">$19</div>
                  <div className="text-sm text-muted-foreground">one-time · instant access · this project</div>
                </div>
                <Button
                  size="lg"
                  className="bg-amber-500 hover:bg-amber-600 text-white gap-2 px-8"
                  onClick={() => handleUnlockReport("homeowner_report")}
                  disabled={isRedirecting}
                >
                  {isRedirecting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Lock className="h-4 w-4" />}
                  Unlock Full Report — $19
                </Button>
                <p className="text-xs text-muted-foreground">
                  Secure one-time payment via Stripe.
                </p>
              </CardContent>
            </Card>
          )}

          <Card className={!isPaid ? "opacity-40 pointer-events-none select-none blur-[2px]" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Bill of Materials — {systemTypeLabel} · {project.budgetTier.charAt(0).toUpperCase() + project.budgetTier.slice(1)} Tier
              </CardTitle>
              <CardDescription>
                Real equipment models with 2024/2025 US market price ranges. Expand any row for alternative models.
                Final BOM requires contractor review — prices vary by distributor and region.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left">Category / Model</th>
                      <th className="px-4 py-3 text-right hidden sm:table-cell">Qty</th>
                      <th className="px-4 py-3 text-right hidden lg:table-cell">Unit Price</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomCategories.map(cat => {
                      const catItems = bom.filter(b => b.category === cat);
                      return catItems.map((bomItem, idx) => (
                        <Fragment key={`${cat}-${idx}`}>
                          {/* Category header row */}
                          {idx === 0 && (
                            <tr className="bg-muted/20 border-t">
                              <td colSpan={4} className="px-4 pt-3 pb-1">
                                <span className="text-xs font-bold uppercase tracking-widest text-primary">{cat}</span>
                              </td>
                            </tr>
                          )}

                          {/* Main equipment row */}
                          <tr className="border-b border-muted/40 hover:bg-muted/10">
                            <td className="px-4 pt-3 pb-2 align-top">
                              {/* Generic description */}
                              <div className="text-xs text-muted-foreground mb-0.5">{bomItem.item}</div>
                              {/* Model name — prominent */}
                              <div className="font-semibold text-sm leading-snug">
                                {bomItem.brandLink
                                  ? <a href={bomItem.brandLink} target="_blank" rel="noopener noreferrer"
                                       className="hover:text-primary hover:underline">{bomItem.model}</a>
                                  : bomItem.model}
                              </div>
                              {/* Brand */}
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {bomItem.brandLink
                                  ? <a href={bomItem.brandLink} target="_blank" rel="noopener noreferrer"
                                       className="text-primary/70 hover:text-primary hover:underline">{bomItem.brand} ↗</a>
                                  : bomItem.brand}
                              </div>
                              {/* Specs */}
                              {bomItem.specs && (
                                <div className="text-xs text-muted-foreground/80 mt-1 font-mono leading-snug">{bomItem.specs}</div>
                              )}
                              {/* Reason (hidden on mobile to save space) */}
                              <div className="text-xs text-muted-foreground/70 mt-1.5 italic hidden sm:block leading-relaxed">{bomItem.reason}</div>
                              {/* Qty on mobile */}
                              <div className="text-xs text-muted-foreground mt-1 sm:hidden">
                                {bomItem.qty} · {bomItem.unitPrice} ea.
                              </div>

                              {/* Alternatives collapsible */}
                              {bomItem.alternatives && bomItem.alternatives.length > 0 && (
                                <details className="mt-2 group">
                                  <summary className="text-xs text-primary cursor-pointer hover:underline select-none list-none flex items-center gap-1">
                                    <span className="group-open:hidden">▶ {bomItem.alternatives.length} alternative{bomItem.alternatives.length > 1 ? "s" : ""}</span>
                                    <span className="hidden group-open:inline">▼ Hide alternatives</span>
                                  </summary>
                                  <div className="mt-2 space-y-2 pl-2 border-l-2 border-primary/20">
                                    {(bomItem.alternatives as Array<Record<string, any>>).map((alt, ai) => (
                                      <div key={ai} className="text-xs bg-muted/30 rounded p-2">
                                        <div className="font-semibold text-foreground/90">
                                          {alt.brandLink
                                            ? <a href={alt.brandLink} target="_blank" rel="noopener noreferrer"
                                                 className="hover:text-primary hover:underline">{alt.model}</a>
                                            : alt.model}
                                        </div>
                                        <div className="text-muted-foreground">{alt.brand}</div>
                                        <div className="font-mono text-muted-foreground/80 mt-0.5">{alt.specs}</div>
                                        <div className="text-primary/80 font-semibold mt-0.5">
                                          ${Math.round(alt.unitPriceLow).toLocaleString()} – ${Math.round(alt.unitPriceHigh).toLocaleString()}
                                          {alt.unitPriceLow === bomItem.totalPriceLow ? "" : " ea."}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </td>
                            <td className="px-4 pt-3 pb-2 text-right text-xs text-muted-foreground align-top hidden sm:table-cell whitespace-nowrap">{bomItem.qty}</td>
                            <td className="px-4 pt-3 pb-2 text-right text-xs text-muted-foreground align-top hidden lg:table-cell whitespace-nowrap">{bomItem.unitPrice}</td>
                            <td className="px-4 pt-3 pb-2 text-right font-semibold text-sm align-top whitespace-nowrap">{bomItem.totalPrice}</td>
                          </tr>
                        </Fragment>
                      ));
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-bold">
                      <td className="px-4 py-3 text-sm" colSpan={3}>
                        Estimated Total Equipment
                        <div className="text-xs font-normal text-muted-foreground">Equipment only · excludes installation labor · before 30% federal ITC</div>
                      </td>
                      <td className="px-4 py-3 text-right text-primary whitespace-nowrap">
                        {(() => {
                          const bomTotal = bom.reduce((s, b) => ({ low: s.low + b.totalPriceLow, high: s.high + b.totalPriceHigh }), { low: 0, high: 0 });
                          return `$${Math.round(bomTotal.low).toLocaleString()} – $${Math.round(bomTotal.high).toLocaleString()}`;
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Section 5: Design Notes ────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Design Notes
          </h2>
          {!isPaid && (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 mb-4 print:hidden">
              <CardContent className="py-4 flex items-center gap-3">
                <Lock className="h-5 w-5 text-amber-600" />
                <div>
                  <div className="font-semibold text-sm">Detailed design notes are locked</div>
                  <div className="text-xs text-muted-foreground">Unlock the full report for contractor-ready recommendations and downloadable PDF access.</div>
                </div>
              </CardContent>
            </Card>
          )}
          <div className={`grid gap-3 ${!isPaid ? "opacity-40 pointer-events-none select-none blur-[2px]" : ""}`}>
            {designNotes.map((note, i) => (
              <div key={i} className={`rounded-lg border p-4 ${noteStyle(note.type)}`}>
                <div className="flex items-start gap-2 mb-2">
                  {noteIcon(note.type)}
                  <h3 className="font-semibold text-sm">{note.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line pl-6 leading-relaxed">
                  {note.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 6: Project Map ─────────────────────────────────── */}
        <section className="print:hidden" id="map">
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Project Location
          </h2>
          <Card className={!isPaid ? "opacity-40 pointer-events-none select-none blur-[2px]" : ""}>
            <CardContent className="pt-4 pb-4">
              <ProjectMap
                address={project.address}
                city={project.city}
                state={project.state}
                zip={project.zip}
                projectName={project.name}
                systemType={project.systemType}
                installationType={project.installationType}
                arraySizeKw={calc.arraySizeKw}
                numPanels={calc.numPanels}
                batteryUsableKwh={calc.batteryUsableKwh}
                arrayLat={project.arrayLat}
                arrayLon={project.arrayLon}
                arrayLocationNote={project.arrayLocationNote}
              />
            </CardContent>
          </Card>
        </section>

        {/* Print map placeholder */}
        <div className="hidden print:block">
          <h2 className="text-base font-bold uppercase tracking-widest text-gray-500 mb-2">Project Location</h2>
          <p className="text-sm">{project.address}, {project.city}, {project.state} {project.zip}</p>
        </div>

        {/* ── Equipment Recommendations Summary ─────────────────────── */}
        <section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Recommended Equipment Categories
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { label: "Solar Panels", value: calc.recommendedPanelBrand, icon: Sun },
              { label: "Inverter", value: calc.recommendedInverterBrand, icon: Zap },
              { label: "Battery Storage", value: hasBattery ? calc.recommendedBatteryBrand : "Not selected", icon: Battery },
              { label: "Mounting System", value: calc.recommendedMountingBrand, icon: Settings2 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium">{label}</div>
                  <div className="font-semibold text-sm">{value}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Engineering Notes from Calc Engine ───────────────────── */}
        {calc.notes && calc.notes.length > 0 && (
          <section>
            <div className="rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h3 className="font-semibold text-amber-800 dark:text-amber-300">Engineering Flags</h3>
              </div>
              <ul className="space-y-1.5">
                {calc.notes.map((note: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                    <span className="shrink-0 mt-1">•</span>{note}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── Safety Disclaimer ─────────────────────────────────────── */}
        <section>
          <div className="text-xs text-muted-foreground text-center p-5 border rounded-lg bg-muted/20 leading-relaxed">
            <strong className="block mb-1 text-foreground">Important Disclaimer</strong>
            This tool provides preliminary solar estimates only. Final system design, electrical work, permitting, and interconnection must be verified by a licensed solar installer and/or licensed electrical contractor, and approved by the local Authority Having Jurisdiction (AHJ). Equipment quantities, wire sizing, protection device ratings, and structural requirements shown in this report are preliminary and subject to change. Always obtain proper permits before installation.
          </div>
        </section>

        </div>
      </div>
    </AppLayout>
  );
}

type ContractorProposalReportProps = {
  project: Record<string, any>;
  calc: Record<string, any>;
  bom: Array<Record<string, any>>;
  bomCategories: string[];
  monthlyChartData: Array<{ month: string; kwh: number; solrad: number | null }> | null;
  hasPVWatts: boolean;
  hasBattery: boolean;
  systemTypeLabel: string;
  designNotes: Array<{ title: string; body: string; type: string }>;
};

function ContractorProposalReport({
  project,
  calc,
  bom,
  bomCategories,
  monthlyChartData,
  hasPVWatts,
  hasBattery,
  systemTypeLabel,
  designNotes,
}: ContractorProposalReportProps) {
  const annualProduction = calc.pvwattsAnnualKwh ?? calc.yearlyProductionKwh;
  const monthlyMax = Math.max(...(monthlyChartData?.map((row) => row.kwh) ?? [1]));
  const installedMidpoint = (calc.installedCostLow + calc.installedCostHigh) / 2;
  const diyMidpoint = (calc.diyEquipmentCostLow + calc.diyEquipmentCostHigh) / 2;
  const dcAcRatio = calc.inverterSizeKw > 0 ? calc.adjustedArraySizeKw / calc.inverterSizeKw : null;
  const equipmentPreview = bom.slice(0, 14);
  const totalEquipment = bom.reduce(
    (sum, item) => ({
      low: sum.low + (item.totalPriceLow ?? 0),
      high: sum.high + (item.totalPriceHigh ?? 0),
    }),
    { low: 0, high: 0 },
  );

  const SummaryRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="proposal-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );

  return (
    <article className="contractor-report hidden print:block">
      <section className="proposal-cover">
        <div className="proposal-brand">
          <div className="proposal-logo">LOGO</div>
          <div>
            <div className="proposal-kicker">Contractor-Grade Solar Proposal</div>
            <h1>{project.name}</h1>
            <p>{project.address}, {project.city}, {project.state} {project.zip}</p>
          </div>
        </div>
        <div className="proposal-meta">
          <div>Prepared by OffGrid Solar Builder</div>
          <div>Generated {new Date().toLocaleDateString()}</div>
          <div>{systemTypeLabel} · {project.installationType} mount</div>
        </div>
        <div className="proposal-hero-grid">
          <div>
            <span>Recommended array</span>
            <strong>{calc.adjustedArraySizeKw.toFixed(2)} kW DC</strong>
          </div>
          <div>
            <span>Annual production</span>
            <strong>{Math.round(annualProduction).toLocaleString()} kWh</strong>
          </div>
          <div>
            <span>Installed estimate</span>
            <strong>${Math.round(calc.installedCostLow).toLocaleString()} - ${Math.round(calc.installedCostHigh).toLocaleString()}</strong>
          </div>
          <div>
            <span>Payback</span>
            <strong>{calc.paybackYears ? `${calc.paybackYears.toFixed(1)} yrs` : "N/A"}</strong>
          </div>
        </div>
      </section>

      <section className="proposal-section">
        <h2>Project Summary</h2>
        <div className="proposal-two-col">
          <div className="proposal-panel">
            <SummaryRow label="System type" value={systemTypeLabel} />
            <SummaryRow label="Installation" value={`${project.installationType} mount`} />
            <SummaryRow label="Annual usage" value={`${Math.round(project.annualKwh).toLocaleString()} kWh`} />
            <SummaryRow label="Daily usage" value={`${calc.dailyKwh.toFixed(1)} kWh/day`} />
            <SummaryRow label="Utility rate" value={`$${project.utilityRatePerKwh.toFixed(3)}/kWh`} />
          </div>
          <div className="proposal-panel">
            <SummaryRow label="Panel count" value={`${calc.numPanels} modules`} />
            <SummaryRow label="Array footprint" value={calc.squareFeetRequired ? `${calc.squareFeetRequired} sq ft` : "Site verified"} />
            <SummaryRow label="Tilt / azimuth" value={`${project.roofPitch || "Site"} / ${project.roofDirection || "South"}`} />
            <SummaryRow label="Peak sun hours" value={`${calc.peakSunHours} h/day ${hasPVWatts ? "(PVWatts)" : "(estimate)"}`} />
            <SummaryRow label="DC/AC ratio" value={dcAcRatio ? dcAcRatio.toFixed(2) : "TBD"} />
          </div>
        </div>
      </section>

      <section className="proposal-section">
        <h2>Site Map</h2>
        <div className="proposal-map">
          <div>
            <strong>Project Location</strong>
            <p>{project.address}, {project.city}, {project.state} {project.zip}</p>
            <p>Property coordinates: {project.lat != null && project.lon != null ? `${Number(project.lat).toFixed(5)}, ${Number(project.lon).toFixed(5)}` : "Geocoding pending"}</p>
            <p>Array coordinates: {project.arrayLat != null && project.arrayLon != null ? `${Number(project.arrayLat).toFixed(5)}, ${Number(project.arrayLon).toFixed(5)}` : "Uses property location"}</p>
          </div>
          <div className="proposal-map-placeholder">Map / Site Plan Placeholder</div>
        </div>
      </section>

      <section className="proposal-section">
        <h2>Production Estimate</h2>
        <div className="proposal-two-col">
          <div className="proposal-panel">
            <SummaryRow label="Annual AC production" value={`${Math.round(annualProduction).toLocaleString()} kWh`} />
            <SummaryRow label="Monthly average" value={`${Math.round(annualProduction / 12).toLocaleString()} kWh`} />
            <SummaryRow label="Capacity factor" value={calc.pvwattsCapacityFactor ? `${calc.pvwattsCapacityFactor.toFixed(1)}%` : "Estimated"} />
            <SummaryRow label="Production source" value={hasPVWatts ? "NREL PVWatts v8" : "State seasonal fallback"} />
          </div>
          <div className="proposal-panel">
            <div className="proposal-chart">
              {monthlyChartData?.map((row) => (
                <div key={row.month} className="proposal-chart-bar">
                  <div style={{ height: `${Math.max(8, (row.kwh / monthlyMax) * 100)}%` }} />
                  <span>{row.month}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="proposal-section">
        <h2>Battery and Inverter Sizing</h2>
        <div className="proposal-two-col">
          <div className="proposal-panel">
            <SummaryRow label="Inverter rating" value={`${calc.inverterSizeKw.toFixed(1)} kW AC`} />
            <SummaryRow label="Recommended inverter" value={calc.recommendedInverterBrand} />
            <SummaryRow label="Sizing basis" value={project.systemType === "grid-tied" ? "DC/AC ratio and standard inverter sizes" : "Estimated peak load plus motor-start reserve"} />
          </div>
          <div className="proposal-panel">
            <SummaryRow label="Battery selected" value={hasBattery ? "Yes" : "No"} />
            <SummaryRow label="Usable capacity" value={hasBattery ? `${calc.batteryUsableKwh.toFixed(1)} kWh` : "N/A"} />
            <SummaryRow label="Total bank" value={hasBattery ? `${calc.totalBatteryBankKwh.toFixed(1)} kWh` : "N/A"} />
            <SummaryRow label="Recommended battery" value={hasBattery ? calc.recommendedBatteryBrand : "Not selected"} />
          </div>
        </div>
      </section>

      <section className="proposal-section proposal-page-break">
        <h2>Losses Breakdown</h2>
        <table className="proposal-table">
          <thead>
            <tr><th>Loss Category</th><th>Percent</th><th>Basis</th></tr>
          </thead>
          <tbody>
            {[
              ["Inverter conversion", calc.inverterLossPct, "DC to AC conversion"],
              ["Wire and connection", calc.wireLossPct, "Conductor resistance and terminations"],
              ["Shading", calc.shadeLossPct, `${project.shadeLevel} shade condition`],
              ["Temperature", calc.tempLossPct, "Module temperature derating"],
              ["Dirt / soiling", calc.dirtLossPct, "Dust and seasonal soiling"],
              ["Panel mismatch", calc.misMatchLossPct ?? 2, "Manufacturing tolerance and string mismatch"],
              ...(calc.batteryLossPct > 0 ? [["Battery round trip", calc.batteryLossPct, "Charge/discharge throughput"]] : []),
            ].map(([name, pct, basis]) => (
              <tr key={String(name)}>
                <td>{name}</td>
                <td>{Number(pct).toFixed(1)}%</td>
                <td>{basis}</td>
              </tr>
            ))}
            <tr className="proposal-total-row">
              <td>Total modeled loss</td>
              <td>{calc.totalSystemLossPct.toFixed(1)}%</td>
              <td>Used for system sizing and production estimate</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="proposal-section">
        <h2>Equipment List</h2>
        <table className="proposal-table">
          <thead>
            <tr><th>Category</th><th>Equipment</th><th>Qty</th><th>Total</th></tr>
          </thead>
          <tbody>
            {equipmentPreview.map((item, index) => (
              <tr key={`${item.category}-${index}`}>
                <td>{item.category}</td>
                <td><strong>{item.model}</strong><br /><span>{item.specs}</span></td>
                <td>{item.qty}</td>
                <td>{item.totalPrice}</td>
              </tr>
            ))}
            {bom.length > equipmentPreview.length && (
              <tr><td colSpan={4}>Additional balance-of-system items included in the interactive report.</td></tr>
            )}
            <tr className="proposal-total-row">
              <td colSpan={3}>Estimated equipment subtotal</td>
              <td>${Math.round(totalEquipment.low).toLocaleString()} - ${Math.round(totalEquipment.high).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <p className="proposal-footnote">Equipment categories included: {bomCategories.join(", ")}.</p>
      </section>

      <section className="proposal-section">
        <h2>Cost Estimate and ROI</h2>
        <div className="proposal-two-col">
          <div className="proposal-panel">
            <SummaryRow label="Installed cost range" value={`$${Math.round(calc.installedCostLow).toLocaleString()} - $${Math.round(calc.installedCostHigh).toLocaleString()}`} />
            <SummaryRow label="Installed midpoint" value={`$${Math.round(installedMidpoint).toLocaleString()}`} />
            <SummaryRow label="DIY equipment range" value={`$${Math.round(calc.diyEquipmentCostLow).toLocaleString()} - $${Math.round(calc.diyEquipmentCostHigh).toLocaleString()}`} />
            <SummaryRow label="DIY midpoint" value={`$${Math.round(diyMidpoint).toLocaleString()}`} />
          </div>
          <div className="proposal-panel">
            <SummaryRow label="Annual savings" value={`$${Math.round(calc.estimatedYearlySavings).toLocaleString()}/yr`} />
            <SummaryRow label="Simple payback" value={calc.paybackYears ? `${calc.paybackYears.toFixed(1)} years` : "N/A"} />
            <SummaryRow label="Bill offset basis" value={`${Math.min(Math.round(annualProduction), Math.round(project.annualKwh)).toLocaleString()} kWh/yr`} />
            <SummaryRow label="Incentives" value="Not included unless separately verified" />
          </div>
        </div>
      </section>

      <section className="proposal-section">
        <h2>Assumptions and Contractor Notes</h2>
        <ul className="proposal-list">
          <li>Production estimates use {hasPVWatts ? "NREL PVWatts v8 weather data" : "state-average seasonal assumptions"} and preliminary project inputs.</li>
          <li>Final design must verify roof structure, setbacks, fire pathways, point-of-interconnection, conductor routing, and AHJ requirements.</li>
          <li>Costs are planning ranges and exclude utility upgrades, trenching, structural engineering, permit fees, taxes, financing, and incentive adjustments unless noted.</li>
          <li>Battery backup duration assumes average load. Critical-load panel design may materially change usable backup time.</li>
          {designNotes.slice(0, 4).map((note) => <li key={note.title}>{note.title}: {note.body}</li>)}
        </ul>
      </section>

      <section className="proposal-section">
        <h2>Disclaimers</h2>
        <p className="proposal-disclaimer">
          This proposal is for preliminary planning and sales discussion only. It is not a stamped engineering package, construction drawing set, interconnection application, permit plan, or guarantee of production, savings, incentives, utility approval, or code compliance. Final system design, electrical work, structural review, permitting, inspection, and commissioning must be completed by qualified licensed professionals and approved by the Authority Having Jurisdiction.
        </p>
      </section>
    </article>
  );
}

// ─── Small helper components used inside the Battery System Guide ──────────
function BatteryFact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <span className="shrink-0 text-sm">{icon}</span>
      <div>
        <div className="font-semibold text-foreground">{label}</div>
        <div className="text-muted-foreground">{value}</div>
      </div>
    </div>
  );
}

function PlacementTip({ icon, color, children }: { icon: string; color: "amber" | "blue" | "green"; children: React.ReactNode }) {
  const bg = color === "amber" ? "bg-amber-50 border-amber-200" : color === "blue" ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200";
  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs ${bg}`}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="text-muted-foreground leading-relaxed">{children}</span>
    </div>
  );
}
