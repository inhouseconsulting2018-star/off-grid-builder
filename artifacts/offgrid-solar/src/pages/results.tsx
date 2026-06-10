import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { useGetProject, useCalculateProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Download, PlusCircle, AlertTriangle, Zap, Battery,
  DollarSign, Settings2, Edit, MapPin, Sun, FileText,
  Info, Lightbulb, CheckCircle2, ClipboardList, LayoutGrid, Lock
} from "lucide-react";
import { useEffect, useRef, Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ProjectMap } from "@/components/maps/ProjectMap";
import { generateBom } from "@/utils/bom";
import { generateDesignNotes } from "@/utils/design-notes";
import { createProjectCheckoutSession } from "@/services/projectService";
import { addProjectToRegistry } from "@/services/projectRegistry";
import { trackEvent } from "@/services/analytics";
import { getPaymentLinkCheckoutUrl, parseCheckoutPlan, type CheckoutPlanId } from "@/services/checkoutPlans";
import {
  BarChart, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ReferenceLine, Line, Legend,
} from "recharts";

export default function Results() {
  const { id } = useParams();
  const projectId = parseInt(id || "0", 10);
  const selectedPlanFromUrl = parseCheckoutPlan(new URLSearchParams(window.location.search).get("selectedPlan"));

  const [token] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("accessToken") ?? "";
    if (urlToken) {
      try { localStorage.setItem(`project-token-${projectId}`, urlToken); } catch { /* ignore */ }
    }
    try {
      return urlToken || localStorage.getItem(`project-token-${projectId}`) || "";
    } catch {
      return urlToken;
    }
  });

  const reqOpts = token ? { headers: { "x-access-token": token } } : undefined;

  const { data: project, isLoading, error } = useGetProject(projectId, { request: reqOpts });
  const calculateProject = useCalculateProject({ request: reqOpts });
  const createCheckoutSession = useMutation({
    mutationFn: (selectedPlan: string) => createProjectCheckoutSession(projectId, token, selectedPlan),
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasTriggeredCalc = useRef(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleUnlockReport = (selectedPlan: CheckoutPlanId = selectedPlanFromUrl ?? "homeowner_report") => {
    trackEvent("checkout_clicked", { projectId, plan: selectedPlan });
    if (selectedPlan === "contractor_lifetime_beta") {
      trackEvent("contractor_beta_clicked", { projectId });
    }
    const paymentLinkUrl = getPaymentLinkCheckoutUrl(selectedPlan, projectId);
    if (paymentLinkUrl) {
      window.location.href = paymentLinkUrl;
      return;
    }
    setIsRedirecting(true);
    createCheckoutSession.mutate(
      selectedPlan,
      {
        onSuccess: (data) => {
          if (data.url) {
            window.location.href = data.url;
          }
        },
        onError: () => {
          setIsRedirecting(false);
          toast({
            title: "Payment unavailable",
            description: "Could not start checkout. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleDownloadPdf = () => {
    trackEvent("pdf_downloaded", { projectId });
    const url = `/api/projects/${projectId}/report.pdf?accessToken=${encodeURIComponent(token)}`;
    window.location.href = url;
  };

  // Backfill the local registry so projects opened via an email/URL link
  // (e.g. existing paid customers) show up on the dashboard on this device.
  useEffect(() => {
    if (project && token) {
      addProjectToRegistry({
        id: projectId,
        accessToken: token,
        name: (project as { name?: string }).name,
      });
    }
  }, [project, projectId, token]);

  useEffect(() => {
    if (project && !project.calculationResult && !hasTriggeredCalc.current) {
      hasTriggeredCalc.current = true;
      calculateProject.mutate({ id: projectId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        },
        onError: () => {
          toast({ title: "Calculation failed", variant: "destructive" });
        }
      });
    }
  }, [project, projectId, queryClient, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || (!project?.calculationResult && !error)) {
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

  if (error || !project) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-destructive">Failed to load project report. Please try again.</div>
      </AppLayout>
    );
  }

  // isPaid: true when the project has been unlocked via a successful Stripe payment
  const isPaid = !!project.paidAt;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calc = project.calculationResult as any;

  // BOM and design notes require full cost/brand data — only present after payment
  const bom = isPaid ? generateBom({
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
  }) : [];

  const designNotes = isPaid ? generateDesignNotes({
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
  }) : [];

  // PVWatts enrichment data — these fields are included in the free preview
  const pvCalc = calc as {
    pvwattsMonthlyKwh?: number[] | null;
    pvwattsSolradMonthly?: number[] | null;
    pvwattsAnnualKwh?: number | null;
    pvwattsSolradAnnual?: number | null;
    pvwattsCapacityFactor?: number | null;
    pvwattsSource?: string | null;
  };

  const hasPVWatts = pvCalc.pvwattsSource === "pvwatts" && Array.isArray(pvCalc.pvwattsMonthlyKwh);
  const hasMonthlyProduction = Array.isArray(pvCalc.pvwattsMonthlyKwh);

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const monthlyConsumptionKwh = Math.round(project.annualKwh / 12);

  const monthlyChartData = hasMonthlyProduction
    ? (pvCalc.pvwattsMonthlyKwh as number[]).map((kwh, i) => ({
        month: MONTH_NAMES[i],
        kwh,
        consumption: monthlyConsumptionKwh,
        solrad: pvCalc.pvwattsSolradMonthly ? Math.round((pvCalc.pvwattsSolradMonthly as number[])[i] * 10) / 10 : null,
      }))
    : null;

  // Loss detail is only available in the full paid report
  const lossData = isPaid ? [
    { name: "Inverter", value: calc.inverterLossPct, color: "#f59e0b" },
    { name: "Wire", value: calc.wireLossPct, color: "#fb923c" },
    { name: "Shade", value: calc.shadeLossPct, color: "#64748b" },
    { name: "Temp", value: calc.tempLossPct, color: "#ef4444" },
    { name: "Dirt", value: calc.dirtLossPct, color: "#a16207" },
    { name: "Mismatch", value: calc.misMatchLossPct ?? 2, color: "#8b5cf6" },
    ...(calc.batteryLossPct > 0 ? [{ name: "Battery", value: calc.batteryLossPct, color: "#6366f1" }] : []),
  ].filter(d => d.value > 0) : [];

  const systemTypeLabel = project.systemType.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");
  const hasBattery = (calc.batteryUsableKwh ?? 0) > 0;
  const formatRange = (value: { low?: number; high?: number } | undefined, unit = "", decimals = 0) => {
    if (!value || typeof value.low !== "number" || typeof value.high !== "number") return "Locked";
    const opts = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    return `${value.low.toLocaleString(undefined, opts)}-${value.high.toLocaleString(undefined, opts)}${unit}`;
  };
  const systemSizeLabel = isPaid ? `${calc.adjustedArraySizeKw.toFixed(2)} kW` : formatRange(calc.systemSizeKwRange, " kW", 1);
  const panelCountLabel = isPaid ? `${calc.numPanels} panels${calc.numPanels > 0 ? ` x ~${Math.round(calc.adjustedArraySizeKw * 1000 / calc.numPanels / 5) * 5}W` : ""}` : `${formatRange(calc.panelCountRange)} panels`;
  const productionLabel = isPaid ? `${calc.yearlyProductionKwh.toLocaleString()} kWh/yr est.` : `${formatRange(calc.yearlyProductionKwhRange, " kWh/yr")} est.`;
  const batteryLabel = isPaid ? `${calc.batteryUsableKwh.toFixed(1)} kWh` : formatRange(calc.batteryUsableKwhRange, " kWh", 1);
  const inverterLabel = isPaid ? `${calc.inverterSizeKw.toFixed(1)} kW` : formatRange(calc.inverterSizeKwRange, " kW", 1);

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
  const bomCategories = Array.from(new Set(bom.map(b => b.category)));

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto flex flex-col gap-8 print:gap-6">

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
              State estimate (no PVWatts key)
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
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownloadPdf}>
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download </span>PDF
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0"
                onClick={() => handleUnlockReport()}
                disabled={isRedirecting || createCheckoutSession.isPending}
              >
                {isRedirecting || createCheckoutSession.isPending
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
        {isPaid && (<div className="hidden print:block border-b-2 border-primary pb-4 mb-2">
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
        </div>)}

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
                <div className="text-3xl font-black text-primary">{systemSizeLabel}</div>
                <div className="text-sm font-medium mt-1">{panelCountLabel}</div>
                <div className="text-xs text-muted-foreground">{productionLabel}</div>
              </CardContent>
            </Card>
            <Card className="bg-primary/5 border-primary/25">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Battery Storage</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {hasBattery ? (
                  <>
                    <div className="text-3xl font-black text-primary">{batteryLabel}</div>
                    <div className="text-sm font-medium mt-1">Usable capacity</div>
                    <div className="text-xs text-muted-foreground">{isPaid ? `${calc.totalBatteryBankKwh.toFixed(1)} kWh total bank` : "Preview range"}</div>
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
                <div className="text-3xl font-black text-primary">{inverterLabel}</div>
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
                      ...(isPaid ? [["Daily Usage", `${calc.dailyKwh.toFixed(1)} kWh/day`]] : []),
                      ["Annual Usage", `${project.annualKwh.toLocaleString()} kWh/yr`],
                      ...(isPaid ? [["Peak Sun Hours", `${calc.peakSunHours} hrs/day${hasPVWatts ? " (PVWatts)" : ` (${project.state})`}`]] : []),
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
                      ...(isPaid ? [["Array Size (gross)", `${calc.arraySizeKw.toFixed(2)} kW`]] : []),
                      ["Array Size", systemSizeLabel],
                      ["Number of Panels", panelCountLabel],
                      ...(isPaid && calc.squareFeetRequired != null ? [["Panel Footprint", `~${calc.squareFeetRequired} sqft${project.availableSqft ? ` of ${project.availableSqft} sqft` : ""}`]] : []),
                      ["Inverter Size", inverterLabel],
                      ["Est. Yearly Production", productionLabel],
                      ...(isPaid ? [["Est. Yearly Savings", `$${calc.estimatedYearlySavings?.toLocaleString()}`]] : []),
                      ...(pvCalc.pvwattsCapacityFactor != null ? [["System Efficiency", `${pvCalc.pvwattsCapacityFactor.toFixed(1)}% capacity factor`]] : []),
                      ...(calc.offGridDesignFactor != null && calc.offGridDesignFactor > 1 ? [["Design Margin", `+${((calc.offGridDesignFactor - 1) * 100).toFixed(0)}% (${project.systemType} reserve)`]] : []),
                      ...(isPaid && calc.paybackYears
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

        {/* ── Monthly Production Chart (PVWatts only — hidden for state-average fallback) ── */}
        {hasPVWatts && monthlyChartData && (
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
                <div className="h-56 print:h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyChartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toString()}
                        unit=""
                        width={42}
                      />
                      <Tooltip
                        formatter={(v: number, name: string) => {
                          if (name === "kwh") return [`${v.toLocaleString()} kWh`, "Solar Production"];
                          if (name === "consumption") return [`${v.toLocaleString()} kWh`, "Est. Monthly Usage"];
                          return [`${v}`, name];
                        }}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Legend
                        formatter={(value: string) =>
                          value === "kwh" ? "Solar Production" : "Est. Monthly Usage"
                        }
                        wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                      />
                      <ReferenceLine
                        y={pvCalc.pvwattsAnnualKwh ? Math.round(pvCalc.pvwattsAnnualKwh / 12) : 0}
                        stroke="#f59e0b"
                        strokeDasharray="4 3"
                        strokeWidth={1.5}
                        label={{ value: "avg", position: "right", fontSize: 10, fill: "#f59e0b" }}
                      />
                      <Bar dataKey="kwh" radius={[3, 3, 0, 0]} maxBarSize={36} name="kwh">
                        {monthlyChartData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.kwh >= (pvCalc.pvwattsAnnualKwh ? pvCalc.pvwattsAnnualKwh / 12 : 0)
                              ? "#f59e0b"
                              : "#fdba74"}
                          />
                        ))}
                      </Bar>
                      <Line
                        dataKey="consumption"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="5 3"
                        name="consumption"
                      />
                    </ComposedChart>
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
                          <th className="pb-2 text-right">Production</th>
                          <th className="pb-2 text-right">Usage</th>
                          <th className="pb-2 text-right">Net</th>
                          {monthlyChartData[0].solrad != null && <th className="pb-2 text-right">Peak Sun Hrs</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {monthlyChartData.map((row) => {
                          const net = row.kwh - row.consumption;
                          return (
                          <tr key={row.month}>
                            <td className="py-1.5 font-medium">{row.month}</td>
                            <td className="py-1.5 text-right font-mono">{row.kwh.toLocaleString()} kWh</td>
                            <td className="py-1.5 text-right font-mono text-blue-600">{row.consumption.toLocaleString()} kWh</td>
                            <td className={`py-1.5 text-right font-mono font-semibold ${net >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {net >= 0 ? "+" : ""}{net.toLocaleString()} kWh
                            </td>
                            {row.solrad != null && <td className="py-1.5 text-right font-mono">{row.solrad}</td>}
                          </tr>
                          );
                        })}
                        <tr className="font-bold border-t-2">
                          <td className="pt-2">Annual</td>
                          <td className="pt-2 text-right font-mono text-primary">
                            {pvCalc.pvwattsAnnualKwh?.toLocaleString()} kWh
                          </td>
                          <td className="pt-2 text-right font-mono text-blue-600">
                            {project.annualKwh.toLocaleString()} kWh
                          </td>
                          <td className={`pt-2 text-right font-mono ${(pvCalc.pvwattsAnnualKwh ?? 0) >= project.annualKwh ? "text-green-600" : "text-red-500"}`}>
                            {pvCalc.pvwattsAnnualKwh != null
                              ? `${pvCalc.pvwattsAnnualKwh - project.annualKwh >= 0 ? "+" : ""}${(pvCalc.pvwattsAnnualKwh - project.annualKwh).toLocaleString()} kWh`
                              : "—"}
                          </td>
                          {monthlyChartData[0].solrad != null && (
                            <td className="pt-2 text-right font-mono">{pvCalc.pvwattsSolradAnnual?.toFixed(2)} avg</td>
                          )}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>

                <p className="text-xs text-muted-foreground">
                  Production modeled using NREL PVWatts v8 with TMY3 weather data for {project.city}, {project.state}.
                  Actual output may vary ±10–15% based on weather, soiling, and equipment performance.
                </p>
              </CardContent>
            </Card>
          </section>
        )}

        {/* ── Battery System Guide (only when battery selected) ─────── */}
        {isPaid && hasBattery && (() => {
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
        {isPaid && (<section>
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
        </section>)}

        {/* ── Section 3: Loss Breakdown ──────────────────────────────── */}
        {isPaid && (<section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" /> System Loss Breakdown
          </h2>
          <Card>
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
        </section>)}

        {/* ── Section 4: Equipment / BOM ─────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" /> Equipment List
          </h2>

          {/* Paywall gate — shown when project is unpaid */}
          {!isPaid && (
            <Card className="border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 mb-4">
              <CardContent className="py-8 flex flex-col items-center text-center gap-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900">
                  <Lock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-1">Unlock the Full Solar Report</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Get the complete equipment bill of materials with real model numbers, current pricing,
                    and alternative options — plus the full downloadable PDF solar design report.
                  </p>
                </div>

                {/* Pricing tiers */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full max-w-3xl">
                  {/* Homeowner Report */}
                  <div className="flex flex-col gap-3 p-4 rounded-xl border-2 border-amber-400 bg-white dark:bg-background text-left relative">
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">Most Popular</div>
                    <div className="font-semibold text-sm">Homeowner Report</div>
                    <div className="text-2xl font-extrabold text-amber-600">$19</div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />Full equipment BOM</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />PDF report download</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />1 credit · one-time</li>
                    </ul>
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5 mt-auto"
                      onClick={() => handleUnlockReport("homeowner_report")}
                      disabled={isRedirecting || createCheckoutSession.isPending}
                    >
                      {isRedirecting || createCheckoutSession.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Lock className="h-3.5 w-3.5" />}
                      Get Report
                    </Button>
                  </div>

                  {/* Property Pack */}
                  <div className="flex flex-col gap-3 p-4 rounded-xl border bg-white dark:bg-background text-left">
                    <div className="font-semibold text-sm">Property Pack</div>
                    <div className="text-2xl font-extrabold">$39</div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />3 report credits</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />Compare properties</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />One-time · no expiry</li>
                    </ul>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 mt-auto"
                      onClick={() => handleUnlockReport("property_pack")}
                      disabled={isRedirecting || createCheckoutSession.isPending}
                    >
                      {isRedirecting || createCheckoutSession.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Lock className="h-3.5 w-3.5" />}
                      Get Pack
                    </Button>
                  </div>

                  {/* Contractor Annual */}
                  <div className="flex flex-col gap-3 p-4 rounded-xl border bg-white dark:bg-background text-left">
                    <div className="font-semibold text-sm">Contractor Annual</div>
                    <div className="text-2xl font-extrabold">$149<span className="text-sm font-normal text-muted-foreground">/yr</span></div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />50 report credits</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />Contractor reports</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />Annual · renews yearly</li>
                    </ul>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 mt-auto"
                      onClick={() => handleUnlockReport("contractor_annual")}
                      disabled={isRedirecting || createCheckoutSession.isPending}
                    >
                      {isRedirecting || createCheckoutSession.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Lock className="h-3.5 w-3.5" />}
                      Get Access
                    </Button>
                  </div>

                  {/* Contractor Lifetime Beta */}
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-primary/40 bg-primary/5 dark:bg-background text-left relative">
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">Beta Offer</div>
                    <div className="font-semibold text-sm">Contractor Lifetime</div>
                    <div className="text-2xl font-extrabold text-primary">$199<span className="text-sm font-normal text-muted-foreground"> one-time</span></div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />100 report credits</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />Lifetime access</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />Never renews</li>
                    </ul>
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary/90 text-white gap-1.5 mt-auto"
                      onClick={() => handleUnlockReport("contractor_lifetime_beta")}
                      disabled={isRedirecting || createCheckoutSession.isPending}
                    >
                      {isRedirecting || createCheckoutSession.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Lock className="h-3.5 w-3.5" />}
                      Get Lifetime
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Secure payment via Stripe · instant access
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
                                    {bomItem.alternatives.map((alt, ai) => (
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
        {isPaid && (<section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Design Notes
          </h2>
          <div className="grid gap-3">
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
        </section>)}

        {/* ── Section 6: Project Map ─────────────────────────────────── */}
        <section className="print:hidden" id="map">
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Project Location
          </h2>
          {/* Geocoding accuracy warning — shown when we only have an approximate fix */}
          {project.locationAccuracy && project.locationAccuracy !== "exact_address" && project.locationAccuracy !== "exact" && !project.useManualCoords && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Exact property location could not be verified.
                Showing {project.locationAccuracy === "approximate_zip" || (project.locationAccuracy as string) === "zip" ? "ZIP code centroid" : project.locationAccuracy === "approximate_city" || (project.locationAccuracy as string) === "city" ? "city/state center" : "approximate"} location.
                You can set precise coordinates on the <a href={`/projects/${project.id}/edit`} className="underline font-medium">Edit page</a>.
              </span>
            </div>
          )}
          <Card>
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
        {isPaid && (<div className="hidden print:block">
          <h2 className="text-base font-bold uppercase tracking-widest text-gray-500 mb-2">Project Location</h2>
          <p className="text-sm">{project.address}, {project.city}, {project.state} {project.zip}</p>
        </div>)}

        {/* ── Equipment Recommendations Summary ─────────────────────── */}
        {isPaid && (<section>
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
        </section>)}

        {/* ── Engineering Notes from Calc Engine ───────────────────── */}
        {isPaid && calc.notes && calc.notes.length > 0 && (
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
            Preliminary planning estimate only. Final design should be verified by a licensed solar/electrical professional. This report is not a permit-ready engineering plan. Equipment quantities, wire sizing, protection device ratings, and structural requirements are preliminary and subject to change. Always obtain proper permits before installation.
          </div>
        </section>

      </div>
    </AppLayout>
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
