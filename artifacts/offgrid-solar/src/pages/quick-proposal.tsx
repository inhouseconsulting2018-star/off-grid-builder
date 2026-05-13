import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Sun, MapPin, Zap, BarChart3, ArrowRight, ArrowLeft, Loader2,
  CheckCircle2, Info, Battery, Download, RotateCcw, AlertCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProposalEstimate {
  address: string;
  city: string;
  state: string;
  zip: string;
  annualKwhUsage: number;
  monthlyKwhUsage: number;
  peakSunHours: number;
  peakSunHoursSource: string;
  panelWattage: number;
  efficiencyFactor: number;
  requiredSystemKw: number;
  panelCount: number;
  finalSystemKw: number;
  estimatedAnnualKwh: number;
  estimatedMonthlyKwh: number;
  offsetPct: number;
  monthlyProductionKwh: number[] | null;
  batteryRecommendedKwh: number | null;
  notes: string[];
}

// ─── Zod schemas per step ────────────────────────────────────────────────────

const addressSchema = z.object({
  address: z.string().min(3, "Street address required"),
  city: z.string().min(1, "City required"),
  state: z.string().min(2).max(2, "Use 2-letter state code (e.g. CA)").toUpperCase(),
  zip: z.string().regex(/^\d{5}$/, "Enter a 5-digit ZIP code"),
});

const usageSchema = z.object({
  usageMode: z.enum(["monthly", "annual"]),
  monthlyKwh: z.coerce.number().nullable().optional(),
  annualKwh: z.coerce.number().nullable().optional(),
  includeBattery: z.boolean().default(false),
  batteryBackupHours: z.coerce.number().min(1).max(96).default(8),
}).refine(
  (d) => {
    if (d.usageMode === "monthly") return (d.monthlyKwh ?? 0) > 0;
    return (d.annualKwh ?? 0) > 0;
  },
  { message: "Enter your energy usage", path: ["monthlyKwh"] }
);

type AddressValues = z.infer<typeof addressSchema>;
type UsageValues = z.infer<typeof usageSchema>;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Address", icon: MapPin },
  { id: 2, label: "Usage", icon: Zap },
  { id: 3, label: "Proposal", icon: BarChart3 },
];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors ${
              step > s.id
                ? "bg-green-500 text-white"
                : step === s.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {step > s.id ? <CheckCircle2 className="h-4 w-4" /> : s.id}
          </div>
          <span className={`text-sm font-medium ${step === s.id ? "text-foreground" : "text-muted-foreground"}`}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-8 ${step > s.id ? "bg-green-500" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-black ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuickProposal() {
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState<AddressValues | null>(null);
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<ProposalEstimate | null>(null);
  const { toast } = useToast();

  const addressForm = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: { address: "", city: "", state: "", zip: "" },
  });

  const usageForm = useForm<UsageValues>({
    resolver: zodResolver(usageSchema),
    defaultValues: {
      usageMode: "annual",
      monthlyKwh: null,
      annualKwh: null,
      includeBattery: false,
      batteryBackupHours: 8,
    },
  });

  const usageMode = usageForm.watch("usageMode");
  const includeBattery = usageForm.watch("includeBattery");

  // ── Step 1 submit ──────────────────────────────────────────────────────
  async function onAddressSubmit(values: AddressValues) {
    setAddress(values);
    setStep(2);
  }

  // ── Step 2 submit → call API ───────────────────────────────────────────
  async function onUsageSubmit(values: UsageValues) {
    if (!address) return;
    setLoading(true);

    try {
      const body = {
        address: address.address,
        city: address.city,
        state: address.state,
        zip: address.zip,
        annualKwh: values.usageMode === "annual" ? (values.annualKwh ?? null) : null,
        monthlyKwh: values.usageMode === "monthly" ? (values.monthlyKwh ?? null) : null,
        panelWattage: 440,
        efficiencyFactor: 0.78,
        includeBattery: values.includeBattery,
        batteryBackupHours: values.batteryBackupHours,
      };

      const resp = await fetch(`${import.meta.env.BASE_URL}api/proposals/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? "Estimate failed");
      }

      const data: ProposalEstimate = await resp.json();
      setEstimate(data);
      setStep(3);
    } catch (err) {
      toast({
        title: "Could not generate estimate",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep(1);
    setEstimate(null);
    setAddress(null);
    addressForm.reset();
    usageForm.reset();
  }

  function handlePrint() {
    window.print();
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Sun className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quick Proposal</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Solar Estimate</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Get a preliminary solar system size and production estimate in seconds.
          </p>
        </div>

        <StepIndicator step={step} />

        {/* ── Step 1: Address ─────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-primary" /> Property Address
              </CardTitle>
              <CardDescription>
                Enter the address where solar will be installed. We use this to look up local solar irradiance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...addressForm}>
                <form onSubmit={addressForm.handleSubmit(onAddressSubmit)} className="space-y-4">
                  <FormField
                    control={addressForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <FormControl>
                          <Input placeholder="7408 Mamba Ct" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={addressForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Rancho Murieta" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={addressForm.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="CA"
                                maxLength={2}
                                className="uppercase"
                                {...field}
                                onChange={e => field.onChange(e.target.value.toUpperCase())}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addressForm.control}
                        name="zip"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP</FormLabel>
                            <FormControl>
                              <Input placeholder="95683" maxLength={5} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full">
                    Next: Energy Usage
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Usage ───────────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-primary" /> Energy Usage
              </CardTitle>
              <CardDescription>
                How much electricity does this property use?
                {address && (
                  <span className="block mt-1 text-foreground font-medium">
                    {address.address}, {address.city}, {address.state} {address.zip}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...usageForm}>
                <form onSubmit={usageForm.handleSubmit(onUsageSubmit)} className="space-y-5">

                  {/* Mode toggle */}
                  <FormField
                    control={usageForm.control}
                    name="usageMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enter usage as</FormLabel>
                        <div className="flex rounded-lg border overflow-hidden w-fit">
                          {(["annual", "monthly"] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => field.onChange(mode)}
                              className={`px-4 py-2 text-sm font-medium transition-colors ${
                                field.value === mode
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-card text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {mode === "annual" ? "Annual kWh" : "Monthly kWh"}
                            </button>
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />

                  {usageMode === "annual" ? (
                    <FormField
                      control={usageForm.control}
                      name="annualKwh"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Annual kWh Usage</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type="number"
                                placeholder="12000"
                                className="pr-16"
                                {...field}
                                value={field.value ?? ""}
                                onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">kWh/yr</span>
                            </div>
                          </FormControl>
                          <FormDescription>Find this on your utility bill or annual energy summary.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <FormField
                      control={usageForm.control}
                      name="monthlyKwh"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Average Monthly kWh</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type="number"
                                placeholder="1000"
                                className="pr-20"
                                {...field}
                                value={field.value ?? ""}
                                onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">kWh/mo</span>
                            </div>
                          </FormControl>
                          <FormDescription>
                            Annual usage will be calculated as monthly × 12.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Live annual calc when monthly entered */}
                  {usageMode === "monthly" && (usageForm.watch("monthlyKwh") ?? 0) > 0 && (
                    <div className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
                      Annual usage: <span className="font-semibold text-foreground">
                        {((usageForm.watch("monthlyKwh") ?? 0) * 12).toLocaleString()} kWh/yr
                      </span>
                    </div>
                  )}

                  {/* Battery option */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <FormField
                      control={usageForm.control}
                      name="includeBattery"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4">
                          <div>
                            <FormLabel className="flex items-center gap-1.5">
                              <Battery className="h-4 w-4 text-primary" /> Include battery backup?
                            </FormLabel>
                            <FormDescription className="mt-0.5">
                              Adds a battery storage recommendation to the proposal.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {includeBattery && (
                      <FormField
                        control={usageForm.control}
                        name="batteryBackupHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Backup duration</FormLabel>
                            <FormControl>
                              <div className="relative w-40">
                                <Input type="number" min={1} max={96} className="pr-12" {...field} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">hours</span>
                              </div>
                            </FormControl>
                            <FormDescription>Hours of backup coverage at average daily load.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button type="submit" className="flex-1" disabled={loading}>
                      {loading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating…</>
                      ) : (
                        <>Generate Proposal <ArrowRight className="ml-2 h-4 w-4" /></>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Proposal output ─────────────────────────────────── */}
        {step === 3 && estimate && (
          <div className="space-y-6 print:space-y-4">

            {/* Report header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:hidden">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sun className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Solar Proposal</span>
                </div>
                <h2 className="text-xl font-extrabold tracking-tight">{estimate.address}</h2>
                <p className="text-sm text-muted-foreground">{estimate.city}, {estimate.state} {estimate.zip}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {estimate.peakSunHoursSource === "pvwatts" && (
                  <Badge className="bg-green-50 text-green-700 border-green-300 font-semibold">
                    <Sun className="h-3 w-3 mr-1" /> NREL PVWatts Data
                  </Badge>
                )}
                {estimate.peakSunHoursSource === "state" && (
                  <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                    State Average PSH
                  </Badge>
                )}
                <Button size="sm" variant="outline" onClick={handlePrint}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Print / PDF
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> New Estimate
                </Button>
              </div>
            </div>

            {/* Print-only header */}
            <div className="hidden print:block mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Sun className="h-5 w-5 text-primary" />
                <span className="text-lg font-bold">Solar Proposal — {estimate.address}, {estimate.city}, {estimate.state} {estimate.zip}</span>
              </div>
            </div>

            {/* Key numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="System Size"
                value={`${estimate.finalSystemKw.toFixed(2)} kW`}
                sub={`${estimate.panelCount} panels × ${estimate.panelWattage}W`}
                highlight
              />
              <StatCard
                label="Annual Production"
                value={`${estimate.estimatedAnnualKwh.toLocaleString()} kWh`}
                sub="estimated"
              />
              <StatCard
                label="Monthly Production"
                value={`${estimate.estimatedMonthlyKwh.toLocaleString()} kWh`}
                sub="avg per month"
              />
              <StatCard
                label="Offset"
                value={`${estimate.offsetPct}%`}
                sub={`of ${estimate.annualKwhUsage.toLocaleString()} kWh usage`}
                highlight={estimate.offsetPct >= 100}
              />
            </div>

            {/* System details table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">System Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-x-8">
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {[
                        ["Address", `${estimate.address}, ${estimate.city}, ${estimate.state} ${estimate.zip}`],
                        ["Annual Usage", `${estimate.annualKwhUsage.toLocaleString()} kWh/yr`],
                        ["Monthly Usage", `${estimate.monthlyKwhUsage.toLocaleString()} kWh/mo`],
                        ["Peak Sun Hours", `${estimate.peakSunHours} hrs/day`],
                      ].map(([l, v]) => (
                        <tr key={l}>
                          <td className="py-2 text-muted-foreground font-medium w-1/2">{l}</td>
                          <td className="py-2 font-semibold text-right">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {[
                        ["Required Size (calc)", `${estimate.requiredSystemKw.toFixed(2)} kW`],
                        ["Panel Wattage", `${estimate.panelWattage}W`],
                        ["Panel Count", `${estimate.panelCount} panels`],
                        ["Final System Size", `${estimate.finalSystemKw.toFixed(2)} kW`],
                        ["Efficiency Factor", `${(estimate.efficiencyFactor * 100).toFixed(0)}%`],
                        ...(estimate.batteryRecommendedKwh != null
                          ? [["Battery Recommendation", `${estimate.batteryRecommendedKwh} kWh LiFePO4`]]
                          : []),
                      ].map(([l, v]) => (
                        <tr key={l}>
                          <td className="py-2 text-muted-foreground font-medium w-1/2">{l}</td>
                          <td className="py-2 font-semibold text-right">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Monthly production chart (PVWatts) */}
            {estimate.monthlyProductionKwh && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Monthly Production
                    <span className="text-xs font-normal normal-case tracking-normal text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full ml-1">
                      NREL PVWatts v8
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={estimate.monthlyProductionKwh.map((kwh, i) => ({ month: MONTH_NAMES[i], kwh }))}
                        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}`} />
                        <Tooltip formatter={(v: number) => [`${v.toLocaleString()} kWh`, "Production"]} />
                        <ReferenceLine
                          y={estimate.estimatedMonthlyKwh}
                          stroke="#f59e0b"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          label={{ value: "avg", position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }}
                        />
                        <Bar dataKey="kwh" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Formulas / methodology */}
            <Card className="print:break-inside-avoid">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" /> Calculation Methodology
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2 text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">Required size:</span>{" "}
                  {estimate.annualKwhUsage.toLocaleString()} kWh ÷ ({estimate.peakSunHours} PSH × 365 × {(estimate.efficiencyFactor * 100).toFixed(0)}% eff)
                  {" = "}<span className="font-semibold text-foreground">{estimate.requiredSystemKw.toFixed(2)} kW</span>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Panel count:</span>{" "}
                  {estimate.requiredSystemKw.toFixed(2)} kW × 1,000 ÷ {estimate.panelWattage}W = {((estimate.requiredSystemKw * 1000) / estimate.panelWattage).toFixed(1)} → rounded up to{" "}
                  <span className="font-semibold text-foreground">{estimate.panelCount} panels</span>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Final size:</span>{" "}
                  {estimate.panelCount} × {estimate.panelWattage}W ÷ 1,000 ={" "}
                  <span className="font-semibold text-foreground">{estimate.finalSystemKw.toFixed(2)} kW</span>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Est. annual production:</span>{" "}
                  {estimate.finalSystemKw.toFixed(2)} kW × {estimate.peakSunHours} PSH × 365 × {(estimate.efficiencyFactor * 100).toFixed(0)}% eff ={" "}
                  <span className="font-semibold text-foreground">{estimate.estimatedAnnualKwh.toLocaleString()} kWh</span>
                </p>
              </CardContent>
            </Card>

            {/* Battery recommendation */}
            {estimate.batteryRecommendedKwh != null && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4 pb-4 flex items-start gap-3">
                  <Battery className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-semibold mb-0.5">Battery Storage Recommendation</div>
                    <p className="text-muted-foreground">
                      Based on your usage and requested backup duration, a{" "}
                      <span className="font-semibold text-foreground">{estimate.batteryRecommendedKwh} kWh</span> LiFePO4 battery bank is recommended (sized at 80% depth of discharge).
                      Typical options: Tesla Powerwall 3, EG4 PowerPro, or Fortress Power eFlex.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes / disclaimer */}
            <Card className="print:break-inside-avoid">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> Important Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {estimate.notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      {note}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Footer actions */}
            <div className="flex gap-3 print:hidden">
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" /> New Estimate
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Download className="mr-2 h-4 w-4" /> Print / Save PDF
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
