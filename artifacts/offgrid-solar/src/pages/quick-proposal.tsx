/**
 * Quick Proposal — 3-step residential solar estimating wizard.
 *
 * Step 1: Property address (with Nominatim autocomplete)
 * Step 2: Energy usage (annual or monthly kWh)
 * Step 3: Proposal output card with system sizing, production chart, battery rec
 *
 * Architecture notes:
 *   - All calculation logic lives in api-server/src/lib/proposal-calculator.ts
 *   - Address geocoding uses Nominatim (client-side) for autocomplete suggestions;
 *     PVWatts irradiance lookup is handled server-side in the /estimate endpoint
 *   - Future API hooks (Google Maps, Aurora Solar, financing) go in the backend route
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Sun, MapPin, Zap, BarChart3, ArrowRight, ArrowLeft, Loader2,
  CheckCircle2, Battery, Download, RotateCcw, FlaskConical,
  ChevronDown, AlertCircle, Info, Lightbulb,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BatteryInfo {
  recommendedKwh: number;
  rule: string;
  reason: string;
  chemistry: string;
  depthOfDischarge: number;
}

interface SpecVerification {
  psh: number;
  pass: boolean;
  requiredSystemKw: number;
  panelCount: number;
  finalSystemKw: number;
  estimatedAnnualKwh: number;
  estimatedMonthlyKwh: number;
  offsetPct: number;
  batteryKwh: number;
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
  panelWattage: number;
  efficiencyFactor: number;
  requiredSystemKw: number;
  panelCount: number;
  finalSystemKw: number;
  estimatedAnnualKwh: number;
  estimatedMonthlyKwh: number;
  offsetPct: number;
  monthlyProductionKwh: number[] | null;
  battery: BatteryInfo;
  specVerification: SpecVerification;
  notes: string[];
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address: NominatimAddress;
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

// ─── Zod schemas per step ────────────────────────────────────────────────────

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
}).refine(
  (d) => {
    if (d.usageMode === "monthly") return (d.monthlyKwh ?? 0) > 0;
    return (d.annualKwh ?? 0) > 0;
  },
  { message: "Enter your energy usage (must be greater than 0)", path: ["monthlyKwh"] }
);

type AddressValues = z.infer<typeof addressSchema>;
type UsageValues = z.infer<typeof usageSchema>;

// ─── Demo scenario (matches spec §9) ─────────────────────────────────────────

const DEMO_SCENARIO = {
  address: { address: "7408 Mamba Ct", city: "Rancho Murieta", state: "CA", zip: "95683" },
  usage: { annualKwh: 12000, usageMode: "annual" as const },
  expectedAt5_5psh: {
    requiredSystemKw: 7.66,
    panelCount: 18,
    finalSystemKw: 7.92,
    estimatedAnnualKwh: 12407,
    estimatedMonthlyKwh: 1034,
    offsetPct: 103,
    batteryKwh: 20,
  },
};

// ─── Month labels ─────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Nominatim address autocomplete ──────────────────────────────────────────

async function searchNominatim(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 5) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("addressdetails", "1");

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": "OffGridSolarBuilder/2.0 (solar-estimating-app)" },
  });
  if (!resp.ok) return [];

  const results: NominatimResult[] = await resp.json();

  return results
    .filter((r) => r.address.postcode && r.address.state_code)
    .map((r) => {
      const a = r.address;
      const streetParts = [a.house_number, a.road].filter(Boolean);
      const streetAddress = streetParts.length > 0 ? streetParts.join(" ") : "";
      const city = a.city ?? a.town ?? a.village ?? "";
      const state = (a.state_code ?? "").toUpperCase().slice(0, 2);
      const zip = (a.postcode ?? "").slice(0, 5);
      return {
        displayName: r.display_name,
        streetAddress,
        city,
        state,
        zip,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      };
    })
    .filter((s) => s.streetAddress && s.city && s.state.length === 2 && /^\d{5}$/.test(s.zip));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
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
  const [addressData, setAddressData] = useState<AddressValues | null>(null);
  const [selectedLatLon, setSelectedLatLon] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<ProposalEstimate | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showSpecVerification, setShowSpecVerification] = useState(false);
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
    defaultValues: { usageMode: "annual", monthlyKwh: null, annualKwh: null },
  });

  const usageMode = usageForm.watch("usageMode");
  const monthlyKwhVal = usageForm.watch("monthlyKwh");
  const annualKwhVal = usageForm.watch("annualKwh");

  // Close suggestion dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // ── Autocomplete search ─────────────────────────────────────────────────
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 5) { setShowSuggestions(false); return; }

    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const results = await searchNominatim(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        // Autocomplete is a convenience — silently ignore errors
      } finally {
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

  // ── Load demo scenario ──────────────────────────────────────────────────
  function loadDemo() {
    const d = DEMO_SCENARIO.address;
    addressForm.setValue("address", d.address, { shouldValidate: true });
    addressForm.setValue("city", d.city, { shouldValidate: true });
    addressForm.setValue("state", d.state, { shouldValidate: true });
    addressForm.setValue("zip", d.zip, { shouldValidate: true });
    setSearchQuery(d.address);
    setSelectedLatLon(null); // will geocode server-side via PVWatts
    setIsDemoMode(true);
    toast({ title: "Demo scenario loaded", description: "Rancho Murieta, CA — 12,000 kWh/yr" });
  }

  // ── Step 1 submit ──────────────────────────────────────────────────────
  function onAddressSubmit(values: AddressValues) {
    setAddressData(values);
    if (isDemoMode) {
      usageForm.setValue("usageMode", "annual");
      usageForm.setValue("annualKwh", DEMO_SCENARIO.usage.annualKwh);
    }
    setStep(2);
  }

  // ── Step 2 submit → call API ───────────────────────────────────────────
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
        panelWattage: 440,
        efficiencyFactor: 0.78,
      };

      const resp = await fetch(`${import.meta.env.BASE_URL}api/proposals/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as Record<string, string>).error ?? "Estimate failed");
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
    setAddressData(null);
    setSelectedLatLon(null);
    setIsDemoMode(false);
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setShowSpecVerification(false);
    addressForm.reset();
    usageForm.reset();
  }

  // ── Render ─────────────────────────────────────────────────────────────
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
          <p className="text-sm text-muted-foreground mt-1">
            Get a preliminary solar system size and production estimate in seconds.
          </p>
        </div>

        <StepIndicator step={step} />

        {/* ── Step 1: Address ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">

            {/* Demo scenario callout */}
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
              <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Test scenario available</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Load a known address (Rancho Murieta, CA) with 12,000 kWh/yr to verify the calculation formulas.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 shrink-0"
                onClick={loadDemo}
              >
                Load Demo
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-primary" /> Property Address
                </CardTitle>
                <CardDescription>
                  Enter the address where solar will be installed. We look up local solar irradiance automatically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...addressForm}>
                  <form onSubmit={addressForm.handleSubmit(onAddressSubmit)} className="space-y-4">

                    {/* Street address with autocomplete */}
                    <FormField
                      control={addressForm.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <div className="relative" ref={suggestionsRef}>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  placeholder="Start typing an address…"
                                  value={searchQuery || field.value}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    field.onChange(val);
                                    handleSearchInput(val);
                                  }}
                                  onFocus={() => {
                                    if (suggestions.length > 0) setShowSuggestions(true);
                                  }}
                                  autoComplete="off"
                                />
                                {loadingSuggestions && (
                                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                              </div>
                            </FormControl>
                            {/* Autocomplete dropdown */}
                            {showSuggestions && suggestions.length > 0 && (
                              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                                {suggestions.map((s, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b last:border-b-0 flex items-start gap-2"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); // keep focus
                                      selectSuggestion(s);
                                    }}
                                  >
                                    <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                    <span className="line-clamp-2 leading-snug">{s.displayName}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <FormDescription className="text-xs">
                            Type to search, or fill in the fields below manually.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* City / State / ZIP */}
                    <div className="grid grid-cols-5 gap-3">
                      <FormField
                        control={addressForm.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem className="col-span-3">
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input placeholder="Rancho Murieta" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addressForm.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem className="col-span-1">
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="CA"
                                maxLength={2}
                                className="uppercase"
                                {...field}
                                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
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
                          <FormItem className="col-span-1">
                            <FormLabel>ZIP</FormLabel>
                            <FormControl>
                              <Input placeholder="95683" maxLength={5} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {selectedLatLon && (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Address verified — coordinates captured for accurate irradiance lookup
                      </div>
                    )}

                    <Button type="submit" className="w-full">
                      Next: Energy Usage <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Step 2: Usage ─────────────────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-primary" /> Energy Usage
              </CardTitle>
              <CardDescription>
                How much electricity does this property use?
                {addressData && (
                  <span className="block mt-1 font-medium text-foreground">
                    {addressData.address}, {addressData.city}, {addressData.state} {addressData.zip}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...usageForm}>
                <form onSubmit={usageForm.handleSubmit(onUsageSubmit)} className="space-y-5">

                  {/* Annual / Monthly toggle */}
                  <FormField
                    control={usageForm.control}
                    name="usageMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enter usage as</FormLabel>
                        <div className="flex rounded-lg border overflow-hidden w-fit">
                          {(["annual", "monthly"] as const).map((mode) => (
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
                                min={0}
                                placeholder="12000"
                                className="pr-16"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(e.target.value === "" ? null : Number(e.target.value))
                                }
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                kWh/yr
                              </span>
                            </div>
                          </FormControl>
                          <FormDescription>
                            Find this on your utility bill or annual energy summary.
                          </FormDescription>
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
                                min={0}
                                placeholder="1000"
                                className="pr-20"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(e.target.value === "" ? null : Number(e.target.value))
                                }
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                kWh/mo
                              </span>
                            </div>
                          </FormControl>
                          <FormDescription>Annual usage = monthly × 12.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Live annual calc when monthly is entered */}
                  {usageMode === "monthly" && (monthlyKwhVal ?? 0) > 0 && (
                    <div className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
                      Annual usage:{" "}
                      <span className="font-semibold text-foreground">
                        {((monthlyKwhVal ?? 0) * 12).toLocaleString()} kWh/yr
                      </span>
                    </div>
                  )}

                  {/* Battery auto-recommendation info */}
                  <div className="flex items-start gap-3 rounded-lg border bg-muted/50 px-4 py-3">
                    <Battery className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">Battery recommendation is automatic</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Based on your annual usage:{" "}
                        {(() => {
                          const kwh =
                            usageMode === "annual"
                              ? (annualKwhVal ?? 0)
                              : (monthlyKwhVal ?? 0) * 12;
                          if (kwh <= 0) return "enter usage above to see recommendation";
                          return kwh >= 12000
                            ? `${kwh.toLocaleString()} kWh/yr → 20 kWh battery recommended`
                            : `${kwh.toLocaleString()} kWh/yr → 10 kWh battery recommended`;
                        })()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button type="submit" className="flex-1" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating…
                        </>
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

        {/* ── Step 3: Proposal output ──────────────────────────────────────── */}
        {step === 3 && estimate && (
          <div className="space-y-5 print:space-y-4">

            {/* Report header row */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:hidden">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sun className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Solar Proposal
                  </span>
                </div>
                <h2 className="text-xl font-extrabold tracking-tight">{estimate.address}</h2>
                <p className="text-sm text-muted-foreground">
                  {estimate.city}, {estimate.state} {estimate.zip}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {estimate.peakSunHoursSource === "pvwatts" && (
                  <Badge className="bg-green-50 text-green-700 border-green-300 font-semibold dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                    <Sun className="h-3 w-3 mr-1" /> NREL PVWatts Data
                  </Badge>
                )}
                {estimate.peakSunHoursSource === "state" && (
                  <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                    State Average PSH
                  </Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Print / PDF
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> New Estimate
                </Button>
              </div>
            </div>

            {/* Print-only header */}
            <div className="hidden print:block mb-4">
              <div className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-primary" />
                <span className="text-lg font-bold">
                  Solar Proposal — {estimate.address}, {estimate.city}, {estimate.state} {estimate.zip}
                </span>
              </div>
            </div>

            {/* ── Key stat cards ─────────────────────────────────────────── */}
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

            {/* ── System details table ───────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  System Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-x-8">
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {[
                        ["Property", `${estimate.address}, ${estimate.city}, ${estimate.state} ${estimate.zip}`],
                        ["Annual Usage", `${estimate.annualKwhUsage.toLocaleString()} kWh/yr`],
                        ["Monthly Usage", `${estimate.monthlyKwhUsage.toLocaleString()} kWh/mo`],
                        [
                          "Peak Sun Hours",
                          `${estimate.peakSunHours} hrs/day${estimate.peakSunHoursSource === "pvwatts" ? " (NREL)" : estimate.peakSunHoursSource === "state" ? " (state avg)" : " (default)"}`,
                        ],
                        ["Efficiency Factor", `${(estimate.efficiencyFactor * 100).toFixed(0)}%`],
                      ].map(([l, v]) => (
                        <tr key={l}>
                          <td className="py-2 text-muted-foreground font-medium w-[55%] pr-2">{l}</td>
                          <td className="py-2 font-semibold text-right">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {[
                        ["Required Size (pre-rounding)", `${estimate.requiredSystemKw.toFixed(2)} kW`],
                        ["Panel Wattage", `${estimate.panelWattage}W STC`],
                        ["Panel Count", `${estimate.panelCount} panels`],
                        ["Final System Size", `${estimate.finalSystemKw.toFixed(2)} kW`],
                        ["Est. Annual Production", `${estimate.estimatedAnnualKwh.toLocaleString()} kWh`],
                        ["Utility Offset", `${estimate.offsetPct}%`],
                      ].map(([l, v]) => (
                        <tr key={l}>
                          <td className="py-2 text-muted-foreground font-medium w-[55%] pr-2">{l}</td>
                          <td className="py-2 font-semibold text-right">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* ── Battery recommendation ─────────────────────────────────── */}
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Battery className="h-4 w-4 text-primary" />
                  Battery Storage Recommendation
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {estimate.battery.recommendedKwh} kWh
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
                  <div>
                    <p className="font-bold text-lg text-primary">{estimate.battery.recommendedKwh} kWh</p>
                    <p className="text-xs text-muted-foreground">{estimate.battery.chemistry}, {(estimate.battery.depthOfDischarge * 100).toFixed(0)}% DoD</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground max-w-[60%]">
                    <p className="font-semibold text-foreground mb-0.5">{estimate.battery.rule}</p>
                    <p>{estimate.battery.reason}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Monthly production chart ───────────────────────────────── */}
            {estimate.monthlyProductionKwh && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Monthly Production Estimate
                    <Badge className="ml-auto bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-950 dark:text-green-300">
                      NREL PVWatts
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={estimate.monthlyProductionKwh.map((kwh, i) => ({
                        month: MONTH_NAMES[i],
                        kwh,
                      }))}
                      margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}`} width={40} />
                      <Tooltip
                        formatter={(v: number) => [`${v.toLocaleString()} kWh`, "Production"]}
                        contentStyle={{ fontSize: 12, borderRadius: 6 }}
                      />
                      <ReferenceLine
                        y={estimate.estimatedMonthlyKwh}
                        stroke="#f59e0b"
                        strokeDasharray="4 2"
                        label={{
                          value: `Avg ${estimate.estimatedMonthlyKwh.toLocaleString()} kWh`,
                          position: "insideTopRight",
                          fontSize: 10,
                          fill: "#b45309",
                        }}
                      />
                      <Bar dataKey="kwh" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* ── Formula methodology ────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" /> Calculation Methodology
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted-foreground font-mono">
                <div className="space-y-1.5 rounded-md bg-muted px-4 py-3 border">
                  <p><span className="text-foreground font-semibold">Required Size</span> = Annual Usage ÷ (PSH × 365 × 0.78)</p>
                  <p className="pl-4 text-foreground">
                    = {estimate.annualKwhUsage.toLocaleString()} ÷ ({estimate.peakSunHours} × 365 × 0.78)
                    = <strong>{estimate.requiredSystemKw.toFixed(2)} kW</strong>
                  </p>
                  <p><span className="text-foreground font-semibold">Panel Count</span> = ceil(Required kW × 1000 ÷ {estimate.panelWattage}W)</p>
                  <p className="pl-4 text-foreground">
                    = ceil({estimate.requiredSystemKw.toFixed(2)} × 1000 ÷ {estimate.panelWattage})
                    = <strong>{estimate.panelCount} panels</strong>
                  </p>
                  <p><span className="text-foreground font-semibold">Final Size</span> = {estimate.panelCount} panels × {estimate.panelWattage}W ÷ 1000 = <strong>{estimate.finalSystemKw.toFixed(2)} kW</strong></p>
                  <p><span className="text-foreground font-semibold">Annual Production</span> = {estimate.finalSystemKw.toFixed(2)} × {estimate.peakSunHours} × 365 × 0.78 = <strong>{estimate.estimatedAnnualKwh.toLocaleString()} kWh</strong></p>
                  <p><span className="text-foreground font-semibold">Monthly Production</span> = {estimate.estimatedAnnualKwh.toLocaleString()} ÷ 12 = <strong>{estimate.estimatedMonthlyKwh.toLocaleString()} kWh</strong></p>
                  <p><span className="text-foreground font-semibold">Offset</span> = {estimate.estimatedAnnualKwh.toLocaleString()} ÷ {estimate.annualKwhUsage.toLocaleString()} = <strong>{estimate.offsetPct}%</strong></p>
                </div>
              </CardContent>
            </Card>

            {/* ── Test / Spec verification panel ────────────────────────── */}
            <Card className="border-dashed">
              <CardHeader className="pb-0">
                <button
                  type="button"
                  className="flex items-center justify-between w-full text-left"
                  onClick={() => setShowSpecVerification((v) => !v)}
                >
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-amber-600" />
                    Formula Verification (Spec §9 Test Scenario)
                    {estimate.specVerification.pass ? (
                      <Badge className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-950 dark:text-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Pass
                      </Badge>
                    ) : (
                      <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" /> Check
                      </Badge>
                    )}
                  </CardTitle>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${showSpecVerification ? "rotate-180" : ""}`}
                  />
                </button>
              </CardHeader>
              {showSpecVerification && (
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      The spec defines expected numbers using a fixed 5.5 PSH assumption.
                      Your proposal uses{" "}
                      {estimate.peakSunHoursSource === "pvwatts" ? "real NREL PVWatts data" : "a state-average estimate"} ({estimate.peakSunHours} hrs/day),
                      which gives more accurate results for this specific location.
                      The table below runs the same formulas at 5.5 PSH to confirm the math is correct.
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-semibold text-muted-foreground">Metric</th>
                        <th className="text-right py-2 font-semibold text-muted-foreground">Spec expects (5.5 PSH)</th>
                        <th className="text-right py-2 font-semibold text-muted-foreground">Calculated (5.5 PSH)</th>
                        <th className="text-right py-2 font-semibold text-muted-foreground">Match</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-xs">
                      {[
                        ["Required size", "≈ 7.66 kW", `${estimate.specVerification.requiredSystemKw.toFixed(2)} kW`, Math.abs(estimate.specVerification.requiredSystemKw - 7.66) < 0.05],
                        ["Panel count", "18", `${estimate.specVerification.panelCount}`, estimate.specVerification.panelCount === 18],
                        ["Final system size", "≈ 7.92 kW", `${estimate.specVerification.finalSystemKw.toFixed(2)} kW`, Math.abs(estimate.specVerification.finalSystemKw - 7.92) < 0.05],
                        ["Annual production", "≈ 12,407 kWh", `${estimate.specVerification.estimatedAnnualKwh.toLocaleString()} kWh`, Math.abs(estimate.specVerification.estimatedAnnualKwh - 12407) < 50],
                        ["Monthly production", "≈ 1,034 kWh", `${estimate.specVerification.estimatedMonthlyKwh.toLocaleString()} kWh`, Math.abs(estimate.specVerification.estimatedMonthlyKwh - 1034) < 5],
                        ["Offset", "≈ 103%", `${estimate.specVerification.offsetPct}%`, estimate.specVerification.offsetPct >= 102 && estimate.specVerification.offsetPct <= 104],
                        ["Battery", "20 kWh", `${estimate.specVerification.batteryKwh} kWh`, estimate.specVerification.batteryKwh === 20],
                      ].map(([metric, expected, actual, pass]) => (
                        <tr key={String(metric)}>
                          <td className="py-2 text-muted-foreground">{metric}</td>
                          <td className="py-2 text-right font-mono">{expected}</td>
                          <td className="py-2 text-right font-mono font-semibold">{actual}</td>
                          <td className="py-2 text-right">
                            {pass ? (
                              <span className="text-green-600 dark:text-green-400 font-semibold">✓</span>
                            ) : (
                              <span className="text-red-500 font-semibold">✗</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              )}
            </Card>

            {/* ── Disclaimer notes ───────────────────────────────────────── */}
            <Card className="bg-muted/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Important Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {estimate.notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-primary mt-0.5">•</span>
                      {note}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="flex gap-3 print:hidden pb-8">
              <Button variant="outline" onClick={reset} className="flex-1">
                <RotateCcw className="mr-2 h-4 w-4" /> New Estimate
              </Button>
              <Button onClick={() => window.print()} className="flex-1">
                <Download className="mr-2 h-4 w-4" /> Save as PDF
              </Button>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
