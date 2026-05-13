import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateProject, useGetProject, useCalculateProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const editSchema = z.object({
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

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
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
  });

  useEffect(() => {
    if (project) {
      form.reset({
        name: project.name,
        address: project.address,
        city: project.city,
        state: project.state,
        zip: project.zip,
        installationType: project.installationType,
        annualKwh: project.annualKwh,
        monthlyBill: project.monthlyBill,
        utilityRatePerKwh: project.utilityRatePerKwh,
        systemType: project.systemType,
        backupHours: project.backupHours,
        customBackupHours: project.customBackupHours ?? null,
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
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 pb-2 border-b">Battery Backup</h3>
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
                    {form.watch("backupHours") === -1 && (
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
                  </div>
                </div>

                {/* ── Section: Site Conditions ──────────────────── */}
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
                    <FormField control={form.control} name="roofPitch" render={({ field }) => (
                      <FormItem><FormLabel>Roof Pitch (degrees)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="roofDirection" render={({ field }) => (
                      <FormItem><FormLabel>Roof Orientation</FormLabel><FormControl><Input placeholder="e.g. South, SW" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="availableSqft" render={({ field }) => (
                      <FormItem><FormLabel>Available Space (sq ft)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
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
