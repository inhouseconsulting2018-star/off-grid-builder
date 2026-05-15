import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateProject, useGetProject, useCalculateProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ArrowLeft, MapPin, RefreshCw } from "lucide-react";
import { Link } from "wouter";

const editSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(1, "ZIP code is required"),
  lat: z.coerce.number().nullable().optional(),
  lon: z.coerce.number().nullable().optional(),
  useManualCoords: z.boolean().default(false),
  installationType: z.enum(["roof", "ground", "pole", "carport"]),
  annualKwh: z.coerce.number().min(0),
  monthlyBill: z.coerce.number().min(0),
  utilityRatePerKwh: z.coerce.number().min(0),
  systemType: z.enum(["off-grid", "grid-tied", "hybrid"]),
  backupHours: z.coerce.number().min(0),
  customBackupHours: z.coerce.number().nullable().optional(),
  batteryChemistry: z.enum(["lifepo4", "agm", "lead-acid", "none"]).default("lifepo4"),
  hasGenerator: z.boolean().default(false),
  generatorKw: z.coerce.number().nullable().optional(),
  wantsGenerator: z.boolean().default(false),
  shadeLevel: z.enum(["none", "light", "medium", "heavy"]),
  roofPitch: z.string(),
  roofDirection: z.string(),
  availableSqft: z.coerce.number().min(0),
  snowArea: z.boolean().default(false),
  highWindArea: z.boolean().default(false),
  budgetTier: z.enum(["economy", "mid-range", "premium", "custom"]),
  customBudget: z.coerce.number().nullable().optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

export default function EditProject() {
  const { id } = useParams();
  const projectId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading: isLoadingProject } = useGetProject(projectId);
  const updateProject = useUpdateProject();
  const calculateProject = useCalculateProject();

  const [isRegeocodeing, setIsRegeocodeing] = useState(false);

  const handleRegeocode = async () => {
    setIsRegeocodeing(true);
    try {
      const base = (import.meta.env.BASE_URL as string) ?? "/";
      const res = await fetch(`${base}api/projects/${projectId}/regeocode`, { method: "POST" });
      if (res.ok) {
        const updated = await res.json() as { lat?: number; lon?: number; locationAccuracy?: string };
        if (updated.lat != null) form.setValue("lat", updated.lat);
        if (updated.lon != null) form.setValue("lon", updated.lon);
        form.setValue("useManualCoords", false);
        toast({
          title: "Address geocoded",
          description: `Location accuracy: ${updated.locationAccuracy === "exact" ? "Exact street address ✓" : updated.locationAccuracy === "zip" ? "ZIP code approximation" : "City/state approximation"}`,
        });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      } else {
        const err = await res.json() as { error?: string };
        toast({ title: "Geocode failed", description: err.error ?? "Could not find coordinates for this address.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Geocode error", description: "Network error. Try again.", variant: "destructive" });
    } finally {
      setIsRegeocodeing(false);
    }
  };

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      lat: null,
      lon: null,
      useManualCoords: false,
      installationType: "roof",
      annualKwh: 10000,
      monthlyBill: 150,
      utilityRatePerKwh: 0.15,
      systemType: "grid-tied",
      backupHours: 0,
      customBackupHours: null,
      batteryChemistry: "lifepo4",
      hasGenerator: false,
      generatorKw: null,
      wantsGenerator: false,
      shadeLevel: "none",
      roofPitch: "20",
      roofDirection: "South",
      availableSqft: 500,
      snowArea: false,
      highWindArea: false,
      budgetTier: "mid-range",
      customBudget: null,
    },
  });

  useEffect(() => {
    if (project) {
      form.reset({
        name: project.name,
        address: project.address,
        city: project.city,
        state: project.state,
        zip: project.zip,
        lat: project.lat ?? null,
        lon: project.lon ?? null,
        useManualCoords: project.useManualCoords ?? false,
        installationType: project.installationType,
        annualKwh: project.annualKwh,
        monthlyBill: project.monthlyBill,
        utilityRatePerKwh: project.utilityRatePerKwh,
        systemType: project.systemType,
        backupHours: project.backupHours,
        customBackupHours: project.customBackupHours ?? null,
        batteryChemistry: (project.batteryChemistry as "lifepo4" | "agm" | "lead-acid" | "none") ?? "lifepo4",
        hasGenerator: project.hasGenerator ?? false,
        generatorKw: project.generatorKw ?? null,
        wantsGenerator: project.wantsGenerator ?? false,
        shadeLevel: project.shadeLevel,
        roofPitch: project.roofPitch,
        roofDirection: project.roofDirection,
        availableSqft: project.availableSqft,
        snowArea: project.snowArea,
        highWindArea: project.highWindArea,
        budgetTier: project.budgetTier,
        customBudget: project.customBudget ?? null,
      });
    }
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (data: EditFormValues) => {
    try {
      await updateProject.mutateAsync({ id: projectId, data });
      await calculateProject.mutateAsync({ id: projectId });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      toast({ title: "Project updated", description: "Design has been recalculated." });
      setLocation(`/results/${projectId}`);
    } catch {
      toast({ title: "Error", description: "Failed to update project", variant: "destructive" });
    }
  };

  if (isLoadingProject) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const isBusy = updateProject.isPending || calculateProject.isPending;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/results/${projectId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back to Report
            </Button>
          </Link>
        </div>

        <Card>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle className="text-xl">Edit: {project?.name}</CardTitle>
                <CardDescription>Update parameters and recalculate results.</CardDescription>
              </CardHeader>

              <CardContent className="space-y-8">

                {/* ── Section: Property ─────────────────────────── */}
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b">Property & Location</h3>
                  <div className="space-y-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-3 gap-3">
                      <FormField control={form.control} name="city" render={({ field }) => (
                        <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="state" render={({ field }) => (
                        <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="zip" render={({ field }) => (
                        <FormItem><FormLabel>ZIP</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </div>
                </div>

                {/* ── Section: System & Energy ──────────────────── */}
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b">System & Energy</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="systemType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>System Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="grid-tied">Grid-Tied</SelectItem>
                            <SelectItem value="hybrid">Hybrid</SelectItem>
                            <SelectItem value="off-grid">Off-Grid</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="annualKwh" render={({ field }) => (
                      <FormItem><FormLabel>Annual Usage (kWh)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="monthlyBill" render={({ field }) => (
                      <FormItem><FormLabel>Monthly Bill ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="utilityRatePerKwh" render={({ field }) => (
                      <FormItem><FormLabel>Utility Rate ($/kWh)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                {/* ── Section: Backup ───────────────────────────── */}
                {(() => {
                  const backupHrs = form.watch("backupHours");
                  const hasBattery = backupHrs > 0;
                  const chemistry = form.watch("batteryChemistry");
                  const hasGen = form.watch("hasGenerator");
                  return (
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b">Battery & Generator</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="backupHours" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Backup Duration (hours)</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value.toString()}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="0">No Battery</SelectItem>
                            <SelectItem value="12">12 Hours</SelectItem>
                            <SelectItem value="24">24 Hours</SelectItem>
                            <SelectItem value="48">48 Hours</SelectItem>
                            <SelectItem value="72">72 Hours</SelectItem>
                            <SelectItem value="-1">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {backupHrs === -1 && (
                      <FormField control={form.control} name="customBackupHours" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custom Hours</FormLabel>
                          <FormControl>
                            <Input type="number" value={field.value || ""} onChange={e => field.onChange(parseFloat(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                    {hasBattery && (
                      <FormField control={form.control} name="batteryChemistry" render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Battery Chemistry</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="lifepo4">LiFePO4 — Best safety, 3,000–6,000 cycles, no maintenance</SelectItem>
                              <SelectItem value="agm">AGM — Sealed, no maintenance, lower cost, 500–1,000 cycles</SelectItem>
                              <SelectItem value="lead-acid">Flooded Lead-Acid — Lowest cost, requires regular maintenance</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            {chemistry === "lifepo4"
                              ? "Uses 80% DoD. Safe for indoor installation. Best long-term value."
                              : chemistry === "agm"
                              ? "Limited to 50% DoD to protect lifespan. Bank is sized 2× larger to compensate."
                              : "Limited to 50% DoD. Requires vented enclosure and monthly electrolyte checks."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                  </div>

                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Generator</p>
                    <FormField control={form.control} name="hasGenerator" render={({ field }) => (
                      <FormItem className="flex items-start space-x-3 space-y-0 border p-3 rounded-lg">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <div>
                          <FormLabel className="font-normal cursor-pointer text-sm">I already have a generator on this property</FormLabel>
                          <FormDescription className="text-xs mt-0.5">Generator integration will be included in your BOM.</FormDescription>
                        </div>
                      </FormItem>
                    )} />
                    {hasGen && (
                      <FormField control={form.control} name="generatorKw" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Existing Generator Size (kW)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="e.g. 8"
                              value={field.value ?? ""}
                              onChange={e => field.onChange(parseFloat(e.target.value) || null)}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">Rated output in kW (on the nameplate). Used to size the inverter AC input.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                    {!hasGen && (
                      <FormField control={form.control} name="wantsGenerator" render={({ field }) => (
                        <FormItem className="flex items-start space-x-3 space-y-0 border p-3 rounded-lg">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          <div>
                            <FormLabel className="font-normal cursor-pointer text-sm">Add a generator to my design</FormLabel>
                            <FormDescription className="text-xs mt-0.5">A propane or diesel generator sized for your inverter will be added to the BOM.</FormDescription>
                          </div>
                        </FormItem>
                      )} />
                    )}
                  </div>
                </div>
                  );
                })()}

                {/* ── Section: Site Conditions ──────────────────── */}
                {(() => {
                  const mountType = form.watch("installationType");
                  const isRoof = mountType === "roof";
                  const isGround = mountType === "ground" || mountType === "pole";
                  const isCarport = mountType === "carport";
                  return (
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b">Site Conditions</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="installationType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Installation Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="roof">Roof Mount</SelectItem>
                            <SelectItem value="ground">Ground Mount</SelectItem>
                            <SelectItem value="pole">Pole Mount</SelectItem>
                            <SelectItem value="carport">Carport</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="shadeLevel" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shade Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">None (0%)</SelectItem>
                            <SelectItem value="light">Light (10%)</SelectItem>
                            <SelectItem value="medium">Medium (25%)</SelectItem>
                            <SelectItem value="heavy">Heavy (40%)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Angle — context-aware */}
                    <FormField control={form.control} name="roofPitch" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isRoof ? "Roof Pitch (degrees)" : "Panel Tilt Angle (degrees)"}</FormLabel>
                        <FormControl><Input placeholder={isRoof ? "e.g. 20" : "e.g. 30"} {...field} /></FormControl>
                        <FormDescription className="text-xs">
                          {isRoof
                            ? "The slope angle of your roof surface."
                            : isGround
                            ? "Angle from horizontal. Typical: 25–35°. Tracking systems adjust automatically."
                            : "Tilt angle of the canopy from horizontal."}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Orientation / tracking — context-aware */}
                    {isGround ? (
                      <FormField control={form.control} name="roofDirection" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tracking System</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={["fixed", "single-axis", "dual-axis"].includes(field.value) ? field.value : "fixed"}
                          >
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="fixed">Fixed Tilt — No tracking</SelectItem>
                              <SelectItem value="single-axis">Single-Axis — Follows sun E→W</SelectItem>
                              <SelectItem value="dual-axis">Dual-Axis — Tracks sun all day</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            {field.value === "single-axis"
                              ? "+15–20% production vs. fixed. Panels rotate east to west during the day."
                              : field.value === "dual-axis"
                              ? "+25–40% production vs. fixed. Tracks sun in both axes. Higher cost and maintenance."
                              : "Standard fixed-angle rack. No moving parts, lowest cost."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    ) : (
                      <FormField control={form.control} name="roofDirection" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isRoof ? "Roof Orientation" : "Panel Orientation"}</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={["South", "SW", "SE", "West", "East"].includes(field.value) ? field.value : "South"}
                          >
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="South">South — Optimal</SelectItem>
                              <SelectItem value="SW">Southwest — Very good</SelectItem>
                              <SelectItem value="SE">Southeast — Very good</SelectItem>
                              <SelectItem value="West">West — Good for afternoon peak</SelectItem>
                              <SelectItem value="East">East — Good for morning</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            {isRoof
                              ? "Direction your roof faces. South-facing produces the most power in the US."
                              : "Direction the carport canopy faces. South is optimal."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}

                    <FormField control={form.control} name="availableSqft" render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {isRoof ? "Available Roof Space (sq ft)"
                            : isGround ? "Available Ground Area (sq ft)"
                            : isCarport ? "Carport Area (sq ft)"
                            : "Available Space (sq ft)"}
                        </FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Ground/pole azimuth note */}
                  {isGround && (
                    <div className="rounded-md border bg-muted/40 px-4 py-3 mt-4 text-xs text-muted-foreground">
                      <strong className="text-foreground">Panel Azimuth:</strong> Ground and pole mounts are typically aimed true South (180°) for maximum annual output in the US. If your site has an orientation constraint, note it in the project name.
                    </div>
                  )}
                  <div className="flex gap-6 mt-4">
                    <FormField control={form.control} name="snowArea" render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="font-normal cursor-pointer">High Snow Load Area</FormLabel>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="highWindArea" render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="font-normal cursor-pointer">High Wind Area</FormLabel>
                      </FormItem>
                    )} />
                  </div>
                </div>
                  );
                })()}

                {/* ── Section: GPS Coordinates ──────────────────── */}
                {(() => {
                  const useManual = form.watch("useManualCoords");
                  return (
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b">GPS Coordinates</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Coordinates are auto-detected from your address. Use the Re-geocode button if you recently changed the address, or enter coordinates manually for pinpoint accuracy.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <Button type="button" variant="outline" size="sm" onClick={handleRegeocode} disabled={isRegeocodeing}>
                      {isRegeocodeing
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Geocoding…</>
                        : <><RefreshCw className="w-4 h-4 mr-2" /> Re-geocode Address</>}
                    </Button>
                    {project?.lat != null && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {project.locationAccuracy === "exact"
                          ? "Exact street address"
                          : project.locationAccuracy === "zip" ? "ZIP code approximation"
                          : project.locationAccuracy === "city" ? "City/state approximation"
                          : project.locationAccuracy === "manual" ? "Manual coordinates"
                          : "Coordinates saved"}
                        {" "}({Number(project.lat).toFixed(5)}, {Number(project.lon).toFixed(5)})
                      </span>
                    )}
                    {project?.lat == null && (
                      <span className="text-xs text-amber-600">No coordinates saved yet — click Re-geocode to set them</span>
                    )}
                  </div>
                  <FormField control={form.control} name="useManualCoords" render={({ field }) => (
                    <FormItem className="flex items-start space-x-3 space-y-0 border p-3 rounded-lg mb-4">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <div>
                        <FormLabel className="font-normal cursor-pointer text-sm">Use manually entered coordinates</FormLabel>
                        <FormDescription className="text-xs mt-0.5">When checked, the lat/lon below are used directly — the address won't be re-geocoded automatically.</FormDescription>
                      </div>
                    </FormItem>
                  )} />
                  {useManual && (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="lat" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Latitude</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.00001"
                              placeholder="e.g. 38.5501"
                              value={field.value ?? ""}
                              onChange={e => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">Decimal degrees (e.g. 38.5501 for north)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="lon" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Longitude</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.00001"
                              placeholder="e.g. -121.3742"
                              value={field.value ?? ""}
                              onChange={e => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">Decimal degrees (negative for west, e.g. -121.37)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}
                </div>
                  );
                })()}

                {/* ── Section: Budget ───────────────────────────── */}
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b">Budget</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="budgetTier" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Equipment Tier</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="economy">Economy</SelectItem>
                            <SelectItem value="mid-range">Mid-Range</SelectItem>
                            <SelectItem value="premium">Premium</SelectItem>
                            <SelectItem value="custom">Custom Budget</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {form.watch("budgetTier") === "custom" && (
                      <FormField control={form.control} name="customBudget" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Budget ($)</FormLabel>
                          <FormControl>
                            <Input type="number" value={field.value || ""} onChange={e => field.onChange(parseFloat(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                  </div>
                </div>

              </CardContent>

              <CardFooter className="flex justify-between border-t pt-6 bg-muted/20">
                <Link href={`/results/${projectId}`}>
                  <Button type="button" variant="outline">Cancel</Button>
                </Link>
                <Button type="submit" disabled={isBusy}>
                  {isBusy ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" /> Save & Recalculate</>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </AppLayout>
  );
}
