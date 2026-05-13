import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreateProject, useCalculateProject } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, ArrowLeft, Loader2, Home, Zap, Battery, Map, DollarSign, CheckCircle2 } from "lucide-react";

const wizardSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(1, "ZIP code is required"),
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

type WizardFormValues = z.infer<typeof wizardSchema>;

const STEPS = [
  { id: 1, name: "Property", icon: Home },
  { id: 2, name: "Energy", icon: Zap },
  { id: 3, name: "Backup", icon: Battery },
  { id: 4, name: "Site", icon: Map },
  { id: 5, name: "Budget", icon: DollarSign },
];

const STEP_FIELDS: Record<number, (keyof WizardFormValues)[]> = {
  1: ["name", "address", "city", "state", "zip", "installationType"],
  2: ["annualKwh", "monthlyBill", "utilityRatePerKwh", "systemType"],
  3: ["backupHours"],
  4: ["shadeLevel", "roofPitch", "roofDirection", "availableSqft"],
  5: ["budgetTier"],
};

export default function Wizard() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createProject = useCreateProject();
  const calculateProject = useCalculateProject();

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
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
    mode: "onChange",
  });

  const onSubmit = async (data: WizardFormValues) => {
    try {
      const project = await createProject.mutateAsync({ data });
      await calculateProject.mutateAsync({ id: project.id });
      toast({ title: "Design Complete", description: "Your solar report is ready." });
      setLocation(`/results/${project.id}`);
    } catch {
      toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
    }
  };

  const nextStep = async () => {
    const fields = STEP_FIELDS[step] ?? [];
    const valid = await form.trigger(fields);
    if (valid) setStep(s => Math.min(5, s + 1));
  };

  const prevStep = () => setStep(s => Math.max(1, s - 1));

  const isBusy = createProject.isPending || calculateProject.isPending;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto py-4 sm:py-8">

        {/* Step indicator */}
        <div className="mb-8 px-2">
          <div className="relative flex justify-between items-start">
            {/* Connector lines behind circles */}
            <div className="absolute top-5 left-0 right-0 flex px-5">
              {STEPS.slice(0, -1).map((s) => (
                <div
                  key={s.id}
                  className={`flex-1 h-0.5 transition-colors ${step > s.id ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>

            {STEPS.map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-2 z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors bg-background ${
                    step > s.id
                      ? "bg-primary border-primary text-primary-foreground"
                      : step === s.id
                      ? "border-primary text-primary"
                      : "border-muted text-muted-foreground"
                  }`}
                >
                  {step > s.id ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${step >= s.id ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.name}
                </span>
              </div>
            ))}
          </div>

          {/* Mobile: current step label */}
          <div className="sm:hidden text-center mt-3">
            <span className="text-sm font-semibold">{STEPS[step - 1].name}</span>
            <span className="text-xs text-muted-foreground ml-2">Step {step} of {STEPS.length}</span>
          </div>
        </div>

        <Card className="shadow-sm border-primary/10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">{STEPS[step - 1].name} Details</CardTitle>
                <CardDescription>Fill out the information below to proceed.</CardDescription>
              </CardHeader>

              <CardContent className="space-y-5 min-h-[280px]">

                {/* Step 1: Property */}
                {step === 1 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input placeholder="e.g. Smith Residence" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input placeholder="123 Oak Lane" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <FormField control={form.control} name="city" render={({ field }) => (
                        <FormItem className="col-span-2 sm:col-span-1"><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="state" render={({ field }) => (
                        <FormItem><FormLabel>State</FormLabel><FormControl><Input placeholder="AZ" maxLength={2} {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="zip" render={({ field }) => (
                        <FormItem><FormLabel>ZIP Code</FormLabel><FormControl><Input placeholder="85001" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="installationType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Installation Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="roof">Roof Mount</SelectItem>
                            <SelectItem value="ground">Ground Mount</SelectItem>
                            <SelectItem value="pole">Pole Mount</SelectItem>
                            <SelectItem value="carport">Carport Mount</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                )}

                {/* Step 2: Energy */}
                {step === 2 && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <FormField control={form.control} name="systemType" render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>System Type</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="grid sm:grid-cols-3 gap-3">
                            {[
                              { value: "grid-tied", label: "Grid-Tied", desc: "No batteries, uses grid" },
                              { value: "hybrid", label: "Hybrid", desc: "Grid + battery backup" },
                              { value: "off-grid", label: "Off-Grid", desc: "Fully independent" },
                            ].map(opt => (
                              <FormItem key={opt.value} className="flex flex-col space-y-0 border rounded-lg p-3 cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                                <div className="flex items-center gap-2">
                                  <FormControl><RadioGroupItem value={opt.value} /></FormControl>
                                  <FormLabel className="font-semibold cursor-pointer text-sm">{opt.label}</FormLabel>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 ml-6">{opt.desc}</p>
                              </FormItem>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="annualKwh" render={({ field }) => (
                        <FormItem><FormLabel>Annual Usage (kWh)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription className="text-xs">Check your utility bills</FormDescription><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="monthlyBill" render={({ field }) => (
                        <FormItem><FormLabel>Avg Monthly Bill ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="utilityRatePerKwh" render={({ field }) => (
                      <FormItem><FormLabel>Utility Rate ($/kWh)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormDescription className="text-xs">Check your electricity bill for the exact rate</FormDescription><FormMessage /></FormItem>
                    )} />
                  </div>
                )}

                {/* Step 3: Backup */}
                {step === 3 && (() => {
                  const backupHrs = form.watch("backupHours");
                  const hasBattery = backupHrs > 0;
                  const chemistry = form.watch("batteryChemistry");
                  const hasGen = form.watch("hasGenerator");
                  const wantsGen = form.watch("wantsGenerator");
                  return (
                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

                      {/* Battery backup duration */}
                      <FormField control={form.control} name="backupHours" render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Battery Backup Duration</FormLabel>
                          <FormDescription className="text-xs">How many hours should your battery keep you powered without sun?</FormDescription>
                          <FormControl>
                            <RadioGroup
                              onValueChange={(v) => field.onChange(parseInt(v))}
                              value={field.value.toString()}
                              className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                            >
                              {[
                                { value: "0", label: "No Battery" },
                                { value: "12", label: "12 Hours" },
                                { value: "24", label: "24 Hours" },
                                { value: "48", label: "48 Hours" },
                                { value: "72", label: "72 Hours" },
                                { value: "-1", label: "Custom" },
                              ].map(opt => (
                                <FormItem key={opt.value} className="flex items-center space-x-3 space-y-0 border p-3 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                                  <FormControl><RadioGroupItem value={opt.value} /></FormControl>
                                  <FormLabel className="font-normal cursor-pointer text-sm">{opt.label}</FormLabel>
                                </FormItem>
                              ))}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      {backupHrs === -1 && (
                        <FormField control={form.control} name="customBackupHours" render={({ field }) => (
                          <FormItem><FormLabel>Custom Backup Hours</FormLabel><FormControl><Input type="number" value={field.value || ""} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )} />
                      )}

                      {/* Battery chemistry — shown when battery selected */}
                      {hasBattery && (
                        <FormField control={form.control} name="batteryChemistry" render={({ field }) => (
                          <FormItem>
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
                                ? "Recommended. LiFePO4 uses 80% of its capacity (DoD), is safe for indoor use, and lasts 10–20 years."
                                : chemistry === "agm"
                                ? "Only use 50% of capacity to protect lifespan. Safe for enclosed spaces. Good budget option."
                                : "Only use 50% of capacity. Requires a ventilated, temperature-controlled enclosure. Monthly electrolyte checks required."}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}

                      {/* Separator */}
                      <div className="border-t pt-4">
                        <p className="text-sm font-medium mb-3">Generator / Backup Power</p>

                        {/* Existing generator */}
                        <FormField control={form.control} name="hasGenerator" render={({ field }) => (
                          <FormItem className="flex items-start space-x-3 space-y-0 border p-3 rounded-lg mb-3">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            <div>
                              <FormLabel className="font-normal cursor-pointer text-sm">I already have a generator on this property</FormLabel>
                              <FormDescription className="text-xs mt-0.5">We'll include generator integration in your design.</FormDescription>
                            </div>
                          </FormItem>
                        )} />

                        {hasGen && (
                          <FormField control={form.control} name="generatorKw" render={({ field }) => (
                            <FormItem className="mb-3">
                              <FormLabel>Existing Generator Size (kW)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="e.g. 8"
                                  value={field.value ?? ""}
                                  onChange={e => field.onChange(parseFloat(e.target.value) || null)}
                                />
                              </FormControl>
                              <FormDescription className="text-xs">Enter the rated output in kW (usually on the nameplate). Used to size the inverter's AC input.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )} />
                        )}

                        {/* Add a generator */}
                        {!hasGen && (
                          <FormField control={form.control} name="wantsGenerator" render={({ field }) => (
                            <FormItem className="flex items-start space-x-3 space-y-0 border p-3 rounded-lg">
                              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                              <div>
                                <FormLabel className="font-normal cursor-pointer text-sm">Add a generator to my design</FormLabel>
                                <FormDescription className="text-xs mt-0.5">
                                  {wantsGen
                                    ? "A propane or diesel generator will be sized and included in your BOM as a backup charging source."
                                    : "Strongly recommended for off-grid systems. Provides backup charging during extended cloudy periods."}
                                </FormDescription>
                              </div>
                            </FormItem>
                          )} />
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Step 4: Site */}
                {step === 4 && (() => {
                  const mountType = form.watch("installationType");
                  const isRoof = mountType === "roof";
                  const isGround = mountType === "ground" || mountType === "pole";
                  const isCarport = mountType === "carport";

                  return (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <FormField control={form.control} name="shadeLevel" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shade Level on Array</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="none">None — Full sun all day</SelectItem>
                              <SelectItem value="light">Light — Minor shading (10%)</SelectItem>
                              <SelectItem value="medium">Medium — Partial shading (25%)</SelectItem>
                              <SelectItem value="heavy">Heavy — Significant shading (40%)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="grid sm:grid-cols-2 gap-4">
                        {/* Angle field — context-aware label */}
                        <FormField control={form.control} name="roofPitch" render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {isRoof ? "Roof Pitch (degrees)" : "Panel Tilt Angle (degrees)"}
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder={isRoof ? "e.g. 20" : "e.g. 30"}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              {isRoof
                                ? "The slope angle of your roof surface."
                                : isGround
                                ? "Angle from horizontal. Typical fixed ground mount: 25–35°. Tracking systems adjust automatically."
                                : "Tilt angle of the carport canopy from horizontal."}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )} />

                        {/* Orientation / tracking field — context-aware */}
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
                                  <SelectItem value="single-axis">Single-Axis Tracking — Follows sun E→W</SelectItem>
                                  <SelectItem value="dual-axis">Dual-Axis Tracking — Follows sun all day</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription className="text-xs">
                                {field.value === "single-axis"
                                  ? "Adds ~15–20% more production vs. fixed. Panels rotate east to west throughout the day."
                                  : field.value === "dual-axis"
                                  ? "Adds ~25–40% more production vs. fixed. Tracks sun in both axes. Higher cost and maintenance."
                                  : "Standard fixed-angle rack. No moving parts, lowest cost, easiest maintenance."}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )} />
                        ) : (
                          <FormField control={form.control} name="roofDirection" render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {isRoof ? "Roof Orientation" : "Panel Orientation"}
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={["South", "SW", "SE", "West", "East"].includes(field.value) ? field.value : "South"}
                              >
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="South">South — Optimal (most production)</SelectItem>
                                  <SelectItem value="SW">Southwest — Very good</SelectItem>
                                  <SelectItem value="SE">Southeast — Very good</SelectItem>
                                  <SelectItem value="West">West — Good for afternoon peak</SelectItem>
                                  <SelectItem value="East">East — Good for morning production</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription className="text-xs">
                                {isRoof
                                  ? "The compass direction your roof faces. South-facing roofs produce the most power in the northern hemisphere."
                                  : "Direction the panels face. South is optimal in the US."}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )} />
                        )}
                      </div>

                      {/* Ground/pole azimuth note */}
                      {isGround && (
                        <div className="rounded-md border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                          <strong className="text-foreground">Panel Azimuth:</strong> Ground and pole mounts are typically aimed true South (180°) for maximum annual production in the US. If your site has a specific orientation constraint, note it in your project name or design notes.
                        </div>
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
                          <FormDescription className="text-xs">
                            {isRoof
                              ? "Usable unshaded roof area for panels. Each 400W panel needs ~22 sq ft."
                              : isGround
                              ? "Ground area available for the array. Ground mounts need extra space between rows for maintenance access (1.5–2× panel area)."
                              : "Area available for the solar canopy."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="flex gap-6">
                        <FormField control={form.control} name="snowArea" render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            <FormLabel className="font-normal text-sm cursor-pointer">High Snow Load Area</FormLabel>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="highWindArea" render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            <FormLabel className="font-normal text-sm cursor-pointer">High Wind Area</FormLabel>
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  );
                })()}

                {/* Step 5: Budget */}
                {step === 5 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <FormField control={form.control} name="budgetTier" render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Equipment Tier</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="grid gap-3">
                            {[
                              { value: "economy", label: "Economy", desc: "Cost-effective components, good reliability" },
                              { value: "mid-range", label: "Mid-Range", desc: "Best value — performance and reliability" },
                              { value: "premium", label: "Premium", desc: "High efficiency, longest warranties, top brands" },
                              { value: "custom", label: "Custom Budget", desc: "Enter a specific target budget" },
                            ].map(opt => (
                              <FormItem key={opt.value} className="flex items-start space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                                <FormControl><RadioGroupItem value={opt.value} className="mt-0.5" /></FormControl>
                                <div>
                                  <FormLabel className="font-semibold cursor-pointer">{opt.label}</FormLabel>
                                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                                </div>
                              </FormItem>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {form.watch("budgetTier") === "custom" && (
                      <FormField control={form.control} name="customBudget" render={({ field }) => (
                        <FormItem><FormLabel>Target Budget ($)</FormLabel><FormControl><Input type="number" value={field.value || ""} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                      )} />
                    )}
                  </div>
                )}

              </CardContent>

              <CardFooter className="flex justify-between border-t pt-5 bg-muted/20">
                {step > 1 ? (
                  <Button type="button" variant="outline" onClick={prevStep} disabled={isBusy}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                ) : <div />}

                {step < 5 ? (
                  <Button type="button" onClick={nextStep}>
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={isBusy}>
                    {isBusy ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Calculating...</>
                    ) : (
                      <>Calculate Design <Zap className="w-4 h-4 ml-2" /></>
                    )}
                  </Button>
                )}
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </AppLayout>
  );
}
