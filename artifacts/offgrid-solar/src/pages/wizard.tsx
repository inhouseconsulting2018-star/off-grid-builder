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

// Wizard Schema
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
    } catch (error) {
      toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
    }
  };

  const nextStep = async () => {
    let fieldsToValidate: any[] = [];
    if (step === 1) fieldsToValidate = ["name", "address", "city", "state", "zip", "installationType"];
    else if (step === 2) fieldsToValidate = ["annualKwh", "monthlyBill", "utilityRatePerKwh", "systemType"];
    else if (step === 3) fieldsToValidate = ["backupHours", "customBackupHours"];
    else if (step === 4) fieldsToValidate = ["shadeLevel", "roofPitch", "roofDirection", "availableSqft"];

    const isStepValid = await form.trigger(fieldsToValidate as any);
    if (isStepValid) setStep((s) => Math.min(5, s + 1));
  };

  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  const steps = [
    { id: 1, name: "Property", icon: Home },
    { id: 2, name: "Energy", icon: Zap },
    { id: 3, name: "Backup", icon: Battery },
    { id: 4, name: "Site", icon: Map },
    { id: 5, name: "Budget", icon: DollarSign },
  ];

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto py-8">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            {steps.map((s, i) => (
              <div key={s.id} className="flex flex-col items-center gap-2 flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    step > s.id
                      ? "bg-primary border-primary text-primary-foreground"
                      : step === s.id
                      ? "border-primary text-primary"
                      : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {step > s.id ? <CheckCircle2 className="w-6 h-6" /> : <s.icon className="w-5 h-5" />}
                </div>
                <span className={`text-xs font-medium ${step >= s.id ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.name}
                </span>
                {i < steps.length - 1 && (
                  <div className={`hidden sm:block absolute h-[2px] w-full max-w-[100px] translate-x-1/2 -z-10 top-5 ${step > s.id ? "bg-primary" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <Card className="shadow-lg border-primary/10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle className="text-2xl">{steps[step - 1].name} Details</CardTitle>
                <CardDescription>Fill out the information below to proceed.</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6 min-h-[300px]">
                {/* Step 1: Property */}
                {step === 1 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input placeholder="e.g. Smith Residence" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <FormField control={form.control} name="city" render={({ field }) => (
                        <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="state" render={({ field }) => (
                        <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="zip" render={({ field }) => (
                        <FormItem><FormLabel>ZIP Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="installationType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Installation Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
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
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <FormField control={form.control} name="systemType" render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>System Type</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid sm:grid-cols-3 gap-4">
                            <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary">
                              <FormControl><RadioGroupItem value="grid-tied" /></FormControl>
                              <FormLabel className="font-normal cursor-pointer">Grid-Tied</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary">
                              <FormControl><RadioGroupItem value="hybrid" /></FormControl>
                              <FormLabel className="font-normal cursor-pointer">Hybrid</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary">
                              <FormControl><RadioGroupItem value="off-grid" /></FormControl>
                              <FormLabel className="font-normal cursor-pointer">Off-Grid</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="annualKwh" render={({ field }) => (
                        <FormItem><FormLabel>Annual Usage (kWh)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="monthlyBill" render={({ field }) => (
                        <FormItem><FormLabel>Average Monthly Bill ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="utilityRatePerKwh" render={({ field }) => (
                      <FormItem><FormLabel>Utility Rate ($/kWh)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                )}

                {/* Step 3: Backup */}
                {step === 3 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <FormField control={form.control} name="backupHours" render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Desired Backup Duration</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={(v) => field.onChange(parseInt(v))} value={field.value.toString()} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[0, 12, 24, 48, 72].map(hrs => (
                              <FormItem key={hrs} className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary">
                                <FormControl><RadioGroupItem value={hrs.toString()} /></FormControl>
                                <FormLabel className="font-normal cursor-pointer">{hrs === 0 ? "No Battery" : `${hrs} Hours`}</FormLabel>
                              </FormItem>
                            ))}
                            <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary">
                              <FormControl><RadioGroupItem value="-1" /></FormControl>
                              <FormLabel className="font-normal cursor-pointer">Custom</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {form.watch("backupHours") === -1 && (
                      <FormField control={form.control} name="customBackupHours" render={({ field }) => (
                        <FormItem><FormLabel>Custom Backup Hours</FormLabel><FormControl><Input type="number" value={field.value || ''} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                      )} />
                    )}
                  </div>
                )}

                {/* Step 4: Site */}
                {step === 4 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <FormField control={form.control} name="shadeLevel" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shade Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select shade" /></SelectTrigger></FormControl>
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
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="roofPitch" render={({ field }) => (
                        <FormItem><FormLabel>Roof Pitch (degrees)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="roofDirection" render={({ field }) => (
                        <FormItem><FormLabel>Roof Orientation</FormLabel><FormControl><Input placeholder="e.g. South, SW" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="availableSqft" render={({ field }) => (
                      <FormItem><FormLabel>Available Space (sq ft)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="flex gap-6 mt-4">
                      <FormField control={form.control} name="snowArea" render={({ field }) => (
                        <FormItem className="flex items-end space-x-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">High Snow Load Area</FormLabel></FormItem>
                      )} />
                      <FormField control={form.control} name="highWindArea" render={({ field }) => (
                        <FormItem className="flex items-end space-x-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">High Wind Area</FormLabel></FormItem>
                      )} />
                    </div>
                  </div>
                )}

                {/* Step 5: Budget */}
                {step === 5 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <FormField control={form.control} name="budgetTier" render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Equipment Tier</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid gap-4">
                            <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary">
                              <FormControl><RadioGroupItem value="economy" /></FormControl>
                              <div className="flex-1"><FormLabel className="font-normal cursor-pointer block">Economy</FormLabel><FormDescription>Cost-effective components</FormDescription></div>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary">
                              <FormControl><RadioGroupItem value="mid-range" /></FormControl>
                              <div className="flex-1"><FormLabel className="font-normal cursor-pointer block">Mid-Range</FormLabel><FormDescription>Best value and reliability</FormDescription></div>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary">
                              <FormControl><RadioGroupItem value="premium" /></FormControl>
                              <div className="flex-1"><FormLabel className="font-normal cursor-pointer block">Premium</FormLabel><FormDescription>High efficiency, longest warranties</FormDescription></div>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-accent [&:has([data-state=checked])]:border-primary">
                              <FormControl><RadioGroupItem value="custom" /></FormControl>
                              <div className="flex-1"><FormLabel className="font-normal cursor-pointer block">Custom Budget</FormLabel></div>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {form.watch("budgetTier") === "custom" && (
                      <FormField control={form.control} name="customBudget" render={({ field }) => (
                        <FormItem><FormLabel>Target Budget ($)</FormLabel><FormControl><Input type="number" value={field.value || ''} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                      )} />
                    )}
                  </div>
                )}
              </CardContent>
              
              <CardFooter className="flex justify-between border-t pt-6 bg-muted/20">
                {step > 1 ? (
                  <Button type="button" variant="outline" onClick={prevStep}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                ) : <div />}
                
                {step < 5 ? (
                  <Button type="button" onClick={nextStep}>
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={createProject.isPending || calculateProject.isPending}>
                    {createProject.isPending || calculateProject.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
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
