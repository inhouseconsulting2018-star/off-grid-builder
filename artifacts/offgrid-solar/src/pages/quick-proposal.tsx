/**
 * Quick Proposal — 3-step residential solar estimating wizard.
 *
 * Step 1: Property address (backend-proxied autocomplete)
 * Step 2: Energy usage + equipment selection (panel type, battery chemistry)
 * Step 3: Proposal output (system sizing, production chart, battery details)
 *
 * Architecture:
 *   - No solar formulas live in this file — all calculations are server-side
 *   - Equipment catalog is fetched from /api/proposals/equipment (backend-owned)
 *   - Address autocomplete calls /api/geocode/suggest (backend proxy)
 *   - No external API is called directly from this file
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { suggestAddresses } from "@/services/geocodingService";
import { createProposalEstimate, getProposalEquipment } from "@/services/proposalService";
import {
  Sun, MapPin, Zap, BarChart3, ArrowRight, ArrowLeft, Loader2,
  CheckCircle2, Battery, Download, RotateCcw, FlaskConical,
  ChevronDown, AlertCircle, Info, Lightbulb, Lock, Settings2, ShieldAlert, Wrench,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type CostTier = "budget" | "standard" | "premium" | "ultra_premium";

interface PanelOption {
  key: string;
  label: string;
  wattage: number;
  efficiencyPct: number;
  tempCoeffPct: number;
  bifacial: boolean;
  bifacialGainPct: number;
  costTier: CostTier;
  description: string;
}

interface BatteryOption {
  key: string;
  label: string;
  chemistry: string;
  dodPct: number;
  roundTripEffPct: number;
  estimatedCycleLife: number;
  maintenanceRequired: boolean;
  requiresVentilation: boolean;
  hasSafetyNotes: boolean;
  costTier: "budget" | "standard" | "premium";
  description: string;
}

interface EquipmentCatalog {
  panels: PanelOption[];
  batteries: BatteryOption[];
  defaults: { panelType: string; batteryType: string };
}

interface ProposalBattery {
  type: string;
  label: string;
  chemistry: string;
  usableKwh: number;
  totalKwh: number;
  dodPct: number;
  roundTripEffPct: number;
  estimatedCycleLife: number;
  maintenanceRequired: boolean;
  requiresVentilation: boolean;
  safetyNotes: string | null;
  rule: string;
  description: string;
}

interface ProposalPanel {
  type: string;
  label: string;
  wattage: number;
  efficiencyPct: number;
  tempCoeffPct: number;
  bifacial: boolean;
  bifacialGainPct: number;
  costTier: CostTier;
  description: string;
}

interface SpecVerification {
  pass: boolean;
  psh: number;
  panelW: number;
  requiredSystemKw: number;
  panelCount: number;
  finalSystemKw: number;
  estimatedAnnualKwh: number;
  estimatedMonthlyKwh: number;
  offsetPct: number;
  batteryUsableKwh: number;
  batteryTotalKwh: number;
}

interface ProposalEstimate {
  address: string;
  city: string;
  state: string;
  zip: string;
  annualKwhUsage: number;
  monthlyKwhUsage: number;
  peakSunHours: number;
  peakSunHoursSource: "pvwatts" | "state" | "default";
  panel: ProposalPanel;
  efficiencyFactor: number;
  requiredSystemKw: number;
  panelCount: number;
  finalSystemKw: number;
  estimatedAnnualKwh: number;
  estimatedMonthlyKwh: number;
  offsetPct: number;
  monthlyProductionKwh: number[] | null;
  battery: ProposalBattery;
  specVerification: SpecVerification;
  notes: string[];
}

interface AddressSuggestion {
  displayName: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lon: number;
}

// ─── Form schemas ─────────────────────────────────────────────────────────────

const addressSchema = z.object({
  address: z.string().min(3, "Street address required (at least 3 characters)"),
  city: z.string().min(1, "City required"),
  state: z.string().min(2).max(2, "Use 2-letter state code (e.g. CA)"),
  zip: z.string().regex(/^\d{5}$/, "Enter a 5-digit ZIP code"),
});

const usageSchema = z.object({
  usageMode: z.enum(["monthly", "annual"]),
  monthlyKwh: z.coerce.number().min(0, "Usage cannot be negative").nullable().optional(),
  annualKwh: z.coerce.number().min(0, "Usage cannot be negative").nullable().optional(),
  panelType: z.string().default("mono_perc"),
  batteryType: z.string().default("lifepo4"),
}).refine(
  (d) => {
    if (d.usageMode === "monthly") return (d.monthlyKwh ?? 0) > 0;
    return (d.annualKwh ?? 0) > 0;
  },
  { message: "Enter your energy usage (must be greater than 0)", path: ["monthlyKwh"] }
);

type AddressValues = z.infer<typeof addressSchema>;
type UsageValues = z.infer<typeof usageSchema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEMO_SCENARIO = {
  address: { address: "7408 Mamba Ct", city: "Rancho Murieta", state: "CA", zip: "95683" },
  annualKwh: 12000,
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COST_TIER_LABEL: Record<CostTier, string> = {
  budget: "Budget",
  standard: "Standard",
  premium: "Premium",
  ultra_premium: "Ultra-Premium",
};

const COST_TIER_COLOR: Record<CostTier, string> = {
  budget: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  standard: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  premium: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  ultra_premium: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Address", icon: MapPin },
  { id: 2, label: "Usage & Equipment", icon: Settings2 },
  { id: 3, label: "Proposal", icon: BarChart3 },
];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors ${
            step > s.id ? "bg-green-500 text-white" : step === s.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}>
            {step > s.id ? <CheckCircle2 className="h-4 w-4" /> : s.id}
          </div>
          <span className={`text-sm font-medium ${step === s.id ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
          {i < STEPS.length - 1 && <div className={`h-px w-6 ${step > s.id ? "bg-green-500" : "bg-muted"}`} />}
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-black ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function PanelSelector({
  panels,
  value,
  onChange,
}: {
  panels: PanelOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {panels.map((p) => {
        const selected = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            className={`text-left rounded-lg border p-3 transition-all ${
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40 hover:bg-muted/40"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-sm font-semibold leading-tight">{p.label}</span>
              {selected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-lg font-black text-primary">{p.wattage}W</span>
              <span className="text-xs text-muted-foreground">{p.efficiencyPct}% eff</span>
              {p.bifacial && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-300 dark:text-blue-400">
                  Bifacial +{p.bifacialGainPct}%
                </Badge>
              )}
              <Badge className={`text-[10px] px-1.5 py-0 ${COST_TIER_COLOR[p.costTier]}`}>
                {COST_TIER_LABEL[p.costTier]}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{p.description}</p>
          </button>
        );
      })}
    </div>
  );
}

function BatterySelector({
  batteries,
  value,
  onChange,
}: {
  batteries: BatteryOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {batteries.map((b) => {
        const selected = value === b.key;
        return (
          <button
            key={b.key}
            type="button"
            onClick={() => onChange(b.key)}
            className={`text-left rounded-lg border p-3 transition-all ${
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40 hover:bg-muted/40"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-sm font-semibold leading-tight">{b.label}</span>
              {selected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-xs font-bold text-primary">{b.dodPct}% DoD</span>
              <span className="text-xs text-muted-foreground">{b.roundTripEffPct}% RTE</span>
              <span className="text-xs text-muted-foreground">~{b.estimatedCycleLife.toLocaleString()} cycles</span>
              <Badge className={`text-[10px] px-1.5 py-0 ${COST_TIER_COLOR[b.costTier as CostTier]}`}>
                {COST_TIER_LABEL[b.costTier as CostTier]}
              </Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {b.maintenanceRequired && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  <Wrench className="h-2.5 w-2.5" /> Maintenance required
                </span>
              )}
              {b.requiresVentilation && (
                <span className="flex items-center gap-0.5 text-[10px] text-orange-600 dark:text-orange-400 font-medium">
                  <AlertCircle className="h-2.5 w-2.5" /> Ventilation needed
                </span>
              )}
              {b.hasSafetyNotes && (
                <span className="flex items-center gap-0.5 text-[10px] text-red-600 dark:text-red-400 font-medium">
                  <ShieldAlert className="h-2.5 w-2.5" /> Safety notes
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{b.description}</p>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuickProposal() {
  const [adminToken, setAdminToken] = useState(() => {
    try { return sessionStorage.getItem("admin-token") ?? ""; } catch { return ""; }
  });
  const [tokenInput, setTokenInput] = useState("");
  const [step, setStep] = useState(1);
  const [addressData, setAddressData] = useState<AddressValues | null>(null);
  const [selectedLatLon, setSelectedLatLon] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<ProposalEstimate | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showSpecVerification, setShowSpecVerification] = useState(false);
  const [equipment, setEquipment] = useState<EquipmentCatalog | null>(null);
  const { toast } = useToast();

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const addressForm = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: { address: "", city: "", state: "", zip: "" },
  });

  const usageForm = useForm<UsageValues>({
    resolver: zodResolver(usageSchema),
    defaultValues: { usageMode: "annual", monthlyKwh: null, annualKwh: null, panelType: "mono_perc", batteryType: "lifepo4" },
  });

  const usageMode = usageForm.watch("usageMode");
  const monthlyKwhVal = usageForm.watch("monthlyKwh");
  const annualKwhVal = usageForm.watch("annualKwh");
  const selectedPanelType = usageForm.watch("panelType");
  const selectedBatteryType = usageForm.watch("batteryType");

  // Load equipment catalog from backend (provider-agnostic — all data is server-side)
  useEffect(() => {
    if (!adminToken) return;
    getProposalEquipment<EquipmentCatalog>(adminToken)
      .then((data: EquipmentCatalog) => {
        setEquipment(data);
        usageForm.setValue("panelType", data.defaults.panelType);
        usageForm.setValue("batteryType", data.defaults.batteryType);
      })
      .catch(() => {
        setAdminToken("");
        try { sessionStorage.removeItem("admin-token"); } catch { /* ignore */ }
      });
  }, [adminToken, usageForm]);

  // Close autocomplete on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Autocomplete handler
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 5) { setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const results = await suggestAddresses(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch { /* autocomplete is optional */ } finally {
        setLoadingSuggestions(false);
      }
    }, 420);
  }, []);

  function selectSuggestion(s: AddressSuggestion) {
    addressForm.setValue("address", s.streetAddress, { shouldValidate: true });
    addressForm.setValue("city", s.city, { shouldValidate: true });
    addressForm.setValue("state", s.state, { shouldValidate: true });
    addressForm.setValue("zip", s.zip, { shouldValidate: true });
    setSelectedLatLon({ lat: s.lat, lon: s.lon });
    setSearchQuery(s.streetAddress);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function loadDemo() {
    const d = DEMO_SCENARIO.address;
    addressForm.setValue("address", d.address, { shouldValidate: true });
    addressForm.setValue("city", d.city, { shouldValidate: true });
    addressForm.setValue("state", d.state, { shouldValidate: true });
    addressForm.setValue("zip", d.zip, { shouldValidate: true });
    setSearchQuery(d.address);
    setSelectedLatLon(null);
    setIsDemoMode(true);
    toast({ title: "Demo scenario loaded", description: "Rancho Murieta, CA — 12,000 kWh/yr" });
  }

  function onAddressSubmit(values: AddressValues) {
    setAddressData(values);
    if (isDemoMode) {
      usageForm.setValue("usageMode", "annual");
      usageForm.setValue("annualKwh", DEMO_SCENARIO.annualKwh);
    }
    setStep(2);
  }

  async function onUsageSubmit(values: UsageValues) {
    if (!addressData) return;
    setLoading(true);
    try {
      const body = {
        address: addressData.address,
        city: addressData.city,
        state: addressData.state,
        zip: addressData.zip,
        annualKwh: values.usageMode === "annual" ? (values.annualKwh ?? null) : null,
        monthlyKwh: values.usageMode === "monthly" ? (values.monthlyKwh ?? null) : null,
        panelType: values.panelType,
        batteryType: values.batteryType,
        efficiencyFactor: 0.86,
      };
      setEstimate(await createProposalEstimate<ProposalEstimate>(body, adminToken));
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
    setStep(1); setEstimate(null); setAddressData(null); setSelectedLatLon(null);
    setIsDemoMode(false); setSearchQuery(""); setSuggestions([]); setShowSuggestions(false);
    setShowSpecVerification(false);
    addressForm.reset();
    usageForm.reset({ usageMode: "annual", monthlyKwh: null, annualKwh: null, panelType: equipment?.defaults.panelType ?? "mono_perc", batteryType: equipment?.defaults.batteryType ?? "lifepo4" });
  }

  // Derived: effective annual kWh for live battery preview
  const liveAnnualKwh = usageMode === "annual" ? (annualKwhVal ?? 0) : (monthlyKwhVal ?? 0) * 12;

  if (!adminToken) {
    const unlock = () => {
      const token = tokenInput.trim();
      if (!token) return;
      try { sessionStorage.setItem("admin-token", token); } catch { /* ignore */ }
      setAdminToken(token);
    };

    return (
      <AppLayout>
        <div className="max-w-xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Admin Authentication
              </CardTitle>
              <CardDescription>Enter your ADMIN_TOKEN to use Quick Proposal.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Input
                type="password"
                placeholder="Admin token"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && unlock()}
              />
              <Button onClick={unlock} disabled={!tokenInput.trim()}>
                Unlock
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">

        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Sun className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quick Proposal</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Solar Estimate</h1>
          <p className="text-sm text-muted-foreground mt-1">Preliminary solar system size and production estimate in seconds.</p>
        </div>

        <StepIndicator step={step} />

        {/* ── Step 1: Address ──────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
              <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Test scenario available</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Load a known address (Rancho Murieta, CA) with 12,000 kWh/yr to verify formulas.</p>
              </div>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 shrink-0" onClick={loadDemo}>
                Load Demo
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" /> Property Address</CardTitle>
                <CardDescription>Enter the installation address. We look up local solar irradiance automatically.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...addressForm}>
                  <form onSubmit={addressForm.handleSubmit(onAddressSubmit)} className="space-y-4">
                    <FormField control={addressForm.control} name="address" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <div className="relative" ref={suggestionsRef}>
                          <FormControl>
                            <div className="relative">
                              <Input
                                placeholder="Start typing an address…"
                                value={searchQuery || field.value}
                                onChange={(e) => { field.onChange(e.target.value); handleSearchInput(e.target.value); }}
                                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                                autoComplete="off"
                              />
                              {loadingSuggestions && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                            </div>
                          </FormControl>
                          {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                              {suggestions.map((s, i) => (
                                <button key={i} type="button"
                                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b last:border-b-0 flex items-start gap-2"
                                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                                >
                                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                  <span className="line-clamp-2 leading-snug">{s.displayName}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <FormDescription className="text-xs">Type to search, or fill in the fields below manually.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-5 gap-3">
                      <FormField control={addressForm.control} name="city" render={({ field }) => (
                        <FormItem className="col-span-3">
                          <FormLabel>City</FormLabel>
                          <FormControl><Input placeholder="Rancho Murieta" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={addressForm.control} name="state" render={({ field }) => (
                        <FormItem className="col-span-1">
                          <FormLabel>State</FormLabel>
                          <FormControl><Input placeholder="CA" maxLength={2} className="uppercase" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={addressForm.control} name="zip" render={({ field }) => (
                        <FormItem className="col-span-1">
                          <FormLabel>ZIP</FormLabel>
                          <FormControl><Input placeholder="95683" maxLength={5} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {selectedLatLon && (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Address verified — coordinates captured
                      </div>
                    )}
                    <Button type="submit" className="w-full">Next: Usage & Equipment <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Step 2: Usage & Equipment ────────────────────────────────────── */}
        {step === 2 && (
          <Form {...usageForm}>
            <form onSubmit={usageForm.handleSubmit(onUsageSubmit)} className="space-y-5">

              {/* Usage card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-4 w-4 text-primary" /> Energy Usage</CardTitle>
                  <CardDescription>
                    How much electricity does this property use?
                    {addressData && <span className="block mt-1 font-medium text-foreground">{addressData.address}, {addressData.city}, {addressData.state} {addressData.zip}</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={usageForm.control} name="usageMode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Enter usage as</FormLabel>
                      <div className="flex rounded-lg border overflow-hidden w-fit">
                        {(["annual", "monthly"] as const).map((mode) => (
                          <button key={mode} type="button" onClick={() => field.onChange(mode)}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${field.value === mode ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                            {mode === "annual" ? "Annual kWh" : "Monthly kWh"}
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )} />

                  {usageMode === "annual" ? (
                    <FormField control={usageForm.control} name="annualKwh" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Annual kWh Usage</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input type="number" min={0} placeholder="12000" className="pr-16" {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">kWh/yr</span>
                          </div>
                        </FormControl>
                        <FormDescription>Find this on your utility bill or annual energy summary.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  ) : (
                    <FormField control={usageForm.control} name="monthlyKwh" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Average Monthly kWh</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input type="number" min={0} placeholder="1000" className="pr-20" {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">kWh/mo</span>
                          </div>
                        </FormControl>
                        <FormDescription>Annual usage = monthly × 12.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  {usageMode === "monthly" && (monthlyKwhVal ?? 0) > 0 && (
                    <div className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
                      Annual usage: <span className="font-semibold text-foreground">{((monthlyKwhVal ?? 0) * 12).toLocaleString()} kWh/yr</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Panel type selector */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Sun className="h-4 w-4 text-primary" /> Solar Panel Type</CardTitle>
                  <CardDescription>Choose the panel technology for this system. Affects wattage, panel count, and production estimate.</CardDescription>
                </CardHeader>
                <CardContent>
                  {equipment ? (
                    <FormField control={usageForm.control} name="panelType" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <PanelSelector panels={equipment.panels} value={field.value} onChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )} />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />)}
                    </div>
                  )}
                  {equipment && selectedPanelType && (() => {
                    const p = equipment.panels.find(x => x.key === selectedPanelType);
                    if (!p) return null;
                    return (
                      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                        <span><strong className="text-foreground">{p.wattage}W</strong> per panel</span>
                        <span>·</span>
                        <span><strong className="text-foreground">{p.efficiencyPct}%</strong> efficiency</span>
                        <span>·</span>
                        <span>Temp coefficient: <strong className="text-foreground">{p.tempCoeffPct}%/°C</strong></span>
                        {p.bifacial && <><span>·</span><span className="text-blue-600 dark:text-blue-400 font-medium">+{p.bifacialGainPct}% bifacial gain</span></>}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Battery chemistry selector */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Battery className="h-4 w-4 text-primary" /> Battery Chemistry</CardTitle>
                  <CardDescription>
                    Different chemistries have very different depth of discharge — a lead-acid battery must be twice the size of a lithium battery for the same usable energy.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {equipment ? (
                    <FormField control={usageForm.control} name="batteryType" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <BatterySelector batteries={equipment.batteries} value={field.value} onChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )} />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />)}
                    </div>
                  )}

                  {/* Live battery size preview */}
                  {liveAnnualKwh > 0 && equipment && (() => {
                    const bat = equipment.batteries.find(b => b.key === selectedBatteryType);
                    if (!bat) return null;
                    const usableKwh = liveAnnualKwh >= 12000 ? 20 : 10;
                    const totalKwh = Math.round((usableKwh / (bat.dodPct / 100)) * 10) / 10;
                    return (
                      <div className="rounded-lg border bg-muted/50 px-4 py-3 space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">Battery sizing preview</p>
                        <div className="flex flex-wrap gap-4 text-xs">
                          <span>Rule: <strong>{liveAnnualKwh >= 12000 ? "≥ 12,000 kWh → 20 kWh usable" : "< 12,000 kWh → 10 kWh usable"}</strong></span>
                          <span>DoD: <strong>{bat.dodPct}%</strong></span>
                          <span>Usable: <strong className="text-primary">{usableKwh} kWh</strong></span>
                          <span>Total rated: <strong className="text-primary">{totalKwh} kWh</strong></span>
                        </div>
                        {bat.maintenanceRequired && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Wrench className="h-3 w-3" /> Monthly maintenance required for this chemistry
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating…</> : <>Generate Proposal <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* ── Step 3: Proposal output ─────────────────────────────────────── */}
        {step === 3 && estimate && (
          <div className="space-y-5 print:space-y-4">

            {/* Header row */}
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
                  <Badge className="bg-green-50 text-green-700 border-green-300 font-semibold dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                    <Sun className="h-3 w-3 mr-1" /> NREL PVWatts
                  </Badge>
                )}
                {estimate.peakSunHoursSource === "state" && (
                  <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-300">State Avg PSH</Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Print / PDF
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> New Estimate
                </Button>
              </div>
            </div>

            {/* Key stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="System Size" value={`${estimate.finalSystemKw.toFixed(2)} kW`} sub={`${estimate.panelCount} × ${estimate.panel.wattage}W panels`} highlight />
              <StatCard label="Annual Production" value={`${estimate.estimatedAnnualKwh.toLocaleString()} kWh`} sub={estimate.panel.bifacial ? `incl. ${estimate.panel.bifacialGainPct}% bifacial gain` : "estimated"} />
              <StatCard label="Monthly Production" value={`${estimate.estimatedMonthlyKwh.toLocaleString()} kWh`} sub="avg per month" />
              <StatCard label="Offset" value={`${estimate.offsetPct}%`} sub={`of ${estimate.annualKwhUsage.toLocaleString()} kWh usage`} highlight={estimate.offsetPct >= 100} />
            </div>

            {/* System details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">System Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-x-8">
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {[
                        ["Property", `${estimate.address}, ${estimate.city}, ${estimate.state} ${estimate.zip}`],
                        ["Annual Usage", `${estimate.annualKwhUsage.toLocaleString()} kWh/yr`],
                        ["Monthly Usage", `${estimate.monthlyKwhUsage.toLocaleString()} kWh/mo`],
                        ["Peak Sun Hours", `${estimate.peakSunHours} hrs/day${estimate.peakSunHoursSource === "pvwatts" ? " (NREL)" : " (state avg)"}`],
                        ["System Efficiency", `${(estimate.efficiencyFactor * 100).toFixed(0)}%`],
                      ].map(([l, v]) => (
                        <tr key={l}>
                          <td className="py-2 text-muted-foreground font-medium pr-2 w-[55%]">{l}</td>
                          <td className="py-2 font-semibold text-right">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {[
                        ["Panel Type", estimate.panel.label],
                        ["Panel Wattage", `${estimate.panel.wattage}W STC`],
                        ["Panel Efficiency", `${estimate.panel.efficiencyPct}%`],
                        ...(estimate.panel.bifacial ? [["Bifacial Gain", `+${estimate.panel.bifacialGainPct}% rear-side`]] : []),
                        ["Required Size (raw)", `${estimate.requiredSystemKw.toFixed(2)} kW`],
                        ["Panel Count", `${estimate.panelCount} panels`],
                        ["Final System Size", `${estimate.finalSystemKw.toFixed(2)} kW`],
                        ["Estimated Annual", `${estimate.estimatedAnnualKwh.toLocaleString()} kWh`],
                        ["Utility Offset", `${estimate.offsetPct}%`],
                      ].map(([l, v]) => (
                        <tr key={l}>
                          <td className="py-2 text-muted-foreground font-medium pr-2 w-[55%]">{l}</td>
                          <td className="py-2 font-semibold text-right">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Battery recommendation */}
            <Card className={estimate.battery.maintenanceRequired ? "border-amber-300 dark:border-amber-700" : "border-primary/20"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Battery className="h-4 w-4 text-primary" />
                  Battery Storage Recommendation
                  <Badge variant="secondary" className="ml-auto text-xs">{estimate.battery.label}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Usable vs Total capacity breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Usable Capacity</p>
                    <p className="text-2xl font-black text-primary">{estimate.battery.usableKwh} kWh</p>
                    <p className="text-xs text-muted-foreground mt-0.5">what you can actually use</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 border px-4 py-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total Rated Capacity</p>
                    <p className="text-2xl font-black">{estimate.battery.totalKwh} kWh</p>
                    <p className="text-xs text-muted-foreground mt-0.5">at {estimate.battery.dodPct}% DoD</p>
                  </div>
                </div>

                {/* Chemistry specs */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground border-t pt-3">
                  <span><strong className="text-foreground">Chemistry:</strong> {estimate.battery.chemistry}</span>
                  <span><strong className="text-foreground">DoD:</strong> {estimate.battery.dodPct}%</span>
                  <span><strong className="text-foreground">Round-trip eff:</strong> {estimate.battery.roundTripEffPct}%</span>
                  <span><strong className="text-foreground">Cycle life:</strong> ~{estimate.battery.estimatedCycleLife.toLocaleString()} cycles</span>
                  {estimate.battery.maintenanceRequired && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium"><Wrench className="h-3 w-3" /> Monthly maintenance required</span>
                  )}
                  {estimate.battery.requiresVentilation && (
                    <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-medium"><AlertCircle className="h-3 w-3" /> Ventilation required</span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">{estimate.battery.rule}</p>

                {/* Safety notes (for lead-acid types) */}
                {estimate.battery.safetyNotes && (
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-3 py-2.5">
                    <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-300">{estimate.battery.safetyNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly production chart */}
            {estimate.monthlyProductionKwh && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Monthly Production Estimate
                    <Badge className="ml-auto bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-950 dark:text-green-300">NREL PVWatts</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={estimate.monthlyProductionKwh.map((kwh, i) => ({ month: MONTH_NAMES[i], kwh }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={40} />
                      <Tooltip formatter={(v: number) => [`${v.toLocaleString()} kWh`, "Production"]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                      <ReferenceLine y={estimate.estimatedMonthlyKwh} stroke="#f59e0b" strokeDasharray="4 2"
                        label={{ value: `Avg ${estimate.estimatedMonthlyKwh.toLocaleString()} kWh`, position: "insideTopRight", fontSize: 10, fill: "#b45309" }} />
                      <Bar dataKey="kwh" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Calculation methodology */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" /> Calculation Methodology
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted-foreground font-mono">
                <div className="space-y-1.5 rounded-md bg-muted px-4 py-3 border">
                  <p><span className="text-foreground font-semibold">Required Size</span> = Usage ÷ (PSH × 365 × 0.86)</p>
                  <p className="pl-4 text-foreground">= {estimate.annualKwhUsage.toLocaleString()} ÷ ({estimate.peakSunHours} × 365 × 0.86) = <strong>{estimate.requiredSystemKw.toFixed(2)} kW</strong></p>
                  <p><span className="text-foreground font-semibold">Panel Count</span> = ceil(Required kW × 1000 ÷ {estimate.panel.wattage}W)</p>
                  <p className="pl-4 text-foreground">= ceil({estimate.requiredSystemKw.toFixed(2)} × 1000 ÷ {estimate.panel.wattage}) = <strong>{estimate.panelCount} panels</strong></p>
                  <p><span className="text-foreground font-semibold">Final Size</span> = {estimate.panelCount} × {estimate.panel.wattage}W ÷ 1000 = <strong>{estimate.finalSystemKw.toFixed(2)} kW</strong></p>
                  <p><span className="text-foreground font-semibold">Annual Production</span> = {estimate.finalSystemKw.toFixed(2)} × {estimate.peakSunHours} × 365 × 0.86{estimate.panel.bifacial ? ` × ${(1 + estimate.panel.bifacialGainPct / 100).toFixed(2)} (bifacial)` : ""} = <strong>{estimate.estimatedAnnualKwh.toLocaleString()} kWh</strong></p>
                  <p><span className="text-foreground font-semibold">Battery Total</span> = {estimate.battery.usableKwh} kWh usable ÷ {estimate.battery.dodPct}% DoD = <strong>{estimate.battery.totalKwh} kWh rated</strong></p>
                </div>
              </CardContent>
            </Card>

            {/* Spec verification (collapsible) */}
            <Card className="border-dashed">
              <CardHeader className="pb-0">
                <button type="button" className="flex items-center justify-between w-full text-left" onClick={() => setShowSpecVerification(v => !v)}>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-amber-600" />
                    Formula Verification (Spec §9 — 440W / 5.5 PSH)
                    {estimate.specVerification.pass ? (
                      <Badge className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-950 dark:text-green-300"><CheckCircle2 className="h-3 w-3 mr-1" /> Pass</Badge>
                    ) : (
                      <Badge className="bg-red-50 text-red-700 border-red-200 text-xs"><AlertCircle className="h-3 w-3 mr-1" /> Check</Badge>
                    )}
                  </CardTitle>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showSpecVerification ? "rotate-180" : ""}`} />
                </button>
              </CardHeader>
              {showSpecVerification && (
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      The spec defines expected outputs using 5.5 PSH and 440W panels. Your proposal uses {estimate.peakSunHoursSource === "pvwatts" ? "real NREL PVWatts data" : "a state-average estimate"} ({estimate.peakSunHours} PSH) and {estimate.panel.wattage}W {estimate.panel.label} panels. The table below checks the spec's math at the spec's original assumptions.
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-xs font-semibold text-muted-foreground">Metric</th>
                        <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Spec expects</th>
                        <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Calculated</th>
                        <th className="text-right py-2 text-xs font-semibold text-muted-foreground">✓</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-xs">
                      {[
                        ["Required size", "≈ 6.95 kW", `${estimate.specVerification.requiredSystemKw.toFixed(2)} kW`, Math.abs(estimate.specVerification.requiredSystemKw - 6.95) < 0.05],
                        ["Panel count (440W)", "18", `${estimate.specVerification.panelCount}`, estimate.specVerification.panelCount === 18],
                        ["Final system size", "≈ 7.92 kW", `${estimate.specVerification.finalSystemKw.toFixed(2)} kW`, Math.abs(estimate.specVerification.finalSystemKw - 7.92) < 0.05],
                        ["Annual production", "≈ 12,154 kWh", `${estimate.specVerification.estimatedAnnualKwh.toLocaleString()} kWh`, Math.abs(estimate.specVerification.estimatedAnnualKwh - 12154) < 50],
                        ["Monthly production", "≈ 1,034 kWh", `${estimate.specVerification.estimatedMonthlyKwh.toLocaleString()} kWh`, Math.abs(estimate.specVerification.estimatedMonthlyKwh - 1034) < 5],
                        ["Offset", "≈ 103%", `${estimate.specVerification.offsetPct}%`, estimate.specVerification.offsetPct >= 102 && estimate.specVerification.offsetPct <= 104],
                        ["Battery (usable)", "20 kWh", `${estimate.specVerification.batteryUsableKwh} kWh`, estimate.specVerification.batteryUsableKwh === 20],
                        ["Battery (total LiFePO4)", "25 kWh", `${estimate.specVerification.batteryTotalKwh} kWh`, estimate.specVerification.batteryTotalKwh === 25],
                      ].map(([metric, expected, actual, pass]) => (
                        <tr key={String(metric)}>
                          <td className="py-1.5 text-muted-foreground">{metric}</td>
                          <td className="py-1.5 text-right font-mono">{expected}</td>
                          <td className="py-1.5 text-right font-mono font-semibold">{actual}</td>
                          <td className="py-1.5 text-right">{pass ? <span className="text-green-600 dark:text-green-400">✓</span> : <span className="text-red-500">✗</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              )}
            </Card>

            {/* Disclaimer notes */}
            <Card className="bg-muted/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Important Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {estimate.notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-primary mt-0.5">•</span>{note}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <div className="flex gap-3 print:hidden pb-8">
              <Button variant="outline" onClick={reset} className="flex-1"><RotateCcw className="mr-2 h-4 w-4" /> New Estimate</Button>
              <Button onClick={() => window.print()} className="flex-1"><Download className="mr-2 h-4 w-4" /> Save as PDF</Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
