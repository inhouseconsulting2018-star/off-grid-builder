import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { useGetProject, useCalculateProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Download, PlusCircle, AlertTriangle, Zap, Battery,
  DollarSign, Settings2, Edit, MapPin, Sun, FileText,
  Info, Lightbulb, CheckCircle2, ClipboardList
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ProjectMap } from "@/components/ProjectMap";
import { generateBom } from "@/lib/bom";
import { generateDesignNotes } from "@/lib/design-notes";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

export default function Results() {
  const { id } = useParams();
  const projectId = parseInt(id || "0", 10);
  const { data: project, isLoading, error } = useGetProject(projectId);
  const calculateProject = useCalculateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasTriggeredCalc = useRef(false);

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

  const calc = project.calculationResult!;

  const bom = generateBom({
    systemType: project.systemType,
    installationType: project.installationType,
    budgetTier: project.budgetTier,
    numPanels: calc.numPanels,
    adjustedArraySizeKw: calc.adjustedArraySizeKw,
    inverterSizeKw: calc.inverterSizeKw,
    totalBatteryBankKwh: calc.totalBatteryBankKwh,
    batteryUsableKwh: calc.batteryUsableKwh,
    recommendedPanelBrand: calc.recommendedPanelBrand,
    recommendedInverterBrand: calc.recommendedInverterBrand,
    recommendedBatteryBrand: calc.recommendedBatteryBrand,
    recommendedMountingBrand: calc.recommendedMountingBrand,
    diyEquipmentCostLow: calc.diyEquipmentCostLow,
    diyEquipmentCostHigh: calc.diyEquipmentCostHigh,
  });

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

  const lossData = [
    { name: "Inverter", value: calc.inverterLossPct, color: "#f59e0b" },
    { name: "Wire", value: calc.wireLossPct, color: "#fb923c" },
    { name: "Shade", value: calc.shadeLossPct, color: "#64748b" },
    { name: "Temp", value: calc.tempLossPct, color: "#ef4444" },
    { name: "Dirt", value: calc.dirtLossPct, color: "#a16207" },
    ...(calc.batteryLossPct > 0 ? [{ name: "Battery", value: calc.batteryLossPct, color: "#6366f1" }] : []),
  ].filter(d => d.value > 0);

  const systemTypeLabel = project.systemType.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");
  const hasBattery = calc.batteryUsableKwh > 0;

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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sun className="h-5 w-5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Solar Design Report</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">{project.name}</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {project.address}, {project.city}, {project.state} {project.zip}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href={`/projects/${project.id}/edit`}>
              <Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-1.5" /> Edit</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="h-4 w-4 mr-1.5" /> Download Report
            </Button>
            <Link href="/wizard">
              <Button size="sm"><PlusCircle className="h-4 w-4 mr-1.5" /> New Design</Button>
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
                <div className="text-sm font-medium mt-1">{calc.numPanels} panels × ~400W</div>
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
                      ["Peak Sun Hours", `${calc.peakSunHours} hrs/day (${project.state})`],
                      ["Installation", project.installationType.charAt(0).toUpperCase() + project.installationType.slice(1) + " Mount"],
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
                      ["Inverter Size", `${calc.inverterSizeKw.toFixed(1)} kW`],
                      ["Est. Yearly Production", `${calc.yearlyProductionKwh.toLocaleString()} kWh`],
                      ["Est. Yearly Savings", `$${calc.estimatedYearlySavings.toLocaleString()}`],
                      ...(calc.paybackYears ? [["Est. Payback Period", `${calc.paybackYears.toFixed(1)} years`]] : []),
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

        {/* ── Section 2: Cost Estimate ───────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Cost Estimate
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Professional Installation</CardTitle>
                <CardDescription>Turnkey, fully installed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black">
                  ${calc.installedCostLow.toLocaleString()} – ${calc.installedCostHigh.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  ${(calc.installedCostLow / (calc.adjustedArraySizeKw * 1000)).toFixed(2)} – ${(calc.installedCostHigh / (calc.adjustedArraySizeKw * 1000)).toFixed(2)} per watt installed
                </p>
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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">DIY Equipment Only</CardTitle>
                <CardDescription>Self-installed, equipment cost only</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-muted-foreground">
                  ${calc.diyEquipmentCostLow.toLocaleString()} – ${calc.diyEquipmentCostHigh.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  ${(calc.diyEquipmentCostLow / (calc.adjustedArraySizeKw * 1000)).toFixed(2)} – ${(calc.diyEquipmentCostHigh / (calc.adjustedArraySizeKw * 1000)).toFixed(2)} per watt (equipment only)
                </p>
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    DIY installation must still comply with local building and electrical codes. Permits and inspections are required.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="mt-3 p-3 rounded-lg border bg-muted/30 text-xs text-muted-foreground">
            Prices are preliminary estimates for the {project.budgetTier} equipment tier and may vary by 15–25% based on market conditions, specific equipment selection, local labor rates, and site conditions. Federal ITC (30%) and state incentives are not reflected.
          </div>
        </section>

        {/* ── Section 3: Loss Breakdown ──────────────────────────────── */}
        <section>
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
            <ClipboardList className="h-4 w-4 text-primary" /> Preliminary Equipment List
          </h2>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bill of Materials — {systemTypeLabel} · {project.budgetTier.charAt(0).toUpperCase() + project.budgetTier.slice(1)} Tier</CardTitle>
              <CardDescription>Preliminary quantities and price ranges. Final BOM requires licensed contractor review.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left">Category / Item</th>
                      <th className="px-4 py-3 text-left hidden md:table-cell">Brand / Type</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Est. Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bomCategories.map(cat => {
                      const items = bom.filter(b => b.category === cat);
                      return items.map((item, idx) => (
                        <tr key={`${cat}-${idx}`} className="hover:bg-muted/20">
                          <td className="px-4 py-3">
                            {idx === 0 && (
                              <div className="text-xs font-semibold uppercase tracking-wide text-primary mb-0.5">{cat}</div>
                            )}
                            <div className="font-medium">{item.item}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 md:hidden">{item.brand}</div>
                            <div className="text-xs text-muted-foreground/80 mt-1 italic hidden sm:block">{item.reason}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">{item.brand}</td>
                          <td className="px-4 py-3 text-right text-xs whitespace-nowrap">{item.qty}</td>
                          <td className="px-4 py-3 text-right font-semibold text-xs whitespace-nowrap">{item.totalPrice}</td>
                        </tr>
                      ));
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-bold">
                      <td className="px-4 py-3" colSpan={3}>Estimated Total Equipment Range</td>
                      <td className="px-4 py-3 text-right text-primary">
                        ${calc.diyEquipmentCostLow.toLocaleString()} – ${calc.diyEquipmentCostHigh.toLocaleString()}
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
        </section>

        {/* ── Section 6: Project Map ─────────────────────────────────── */}
        <section className="print:hidden" id="map">
          <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Project Location
          </h2>
          <Card>
            <CardContent className="pt-4 pb-4">
              <ProjectMap
                address={project.address}
                city={project.city}
                state={project.state}
                zip={project.zip}
                projectName={project.name}
                systemType={project.systemType}
                arraySizeKw={calc.arraySizeKw}
                batteryUsableKwh={calc.batteryUsableKwh}
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
    </AppLayout>
  );
}
