import { useState, useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateProject, useGetProject, useCalculateProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";

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

export default function EditProject() {
  const { id } = useParams();
  const projectId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: project, isLoading: isLoadingProject } = useGetProject(projectId);
  const updateProject = useUpdateProject();
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
        customBackupHours: project.customBackupHours,
        shadeLevel: project.shadeLevel,
        roofPitch: project.roofPitch,
        roofDirection: project.roofDirection,
        availableSqft: project.availableSqft,
        snowArea: project.snowArea,
        highWindArea: project.highWindArea,
        budgetTier: project.budgetTier,
        customBudget: project.customBudget,
      });
    }
  }, [project, form]);

  const onSubmit = async (data: WizardFormValues) => {
    try {
      await updateProject.mutateAsync({ id: projectId, data });
      await calculateProject.mutateAsync({ id: projectId });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      toast({ title: "Project Updated", description: "Design recalculated." });
      setLocation(`/results/${projectId}`);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update project", variant: "destructive" });
    }
  };

  if (isLoadingProject) {
    return <AppLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto py-8">
        <Card>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle className="text-2xl">Edit Project: {project?.name}</CardTitle>
                <CardDescription>Update parameters and recalculate.</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-8">
                {/* Single page full form for editing */}
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Column 1 */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg border-b pb-2">Property & Location</h3>
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-3 gap-2">
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

                    <h3 className="font-semibold text-lg border-b pb-2 mt-8">Energy Needs</h3>
                    <FormField control={form.control} name="systemType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>System Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="grid-tied">Grid-Tied</SelectItem>
                            <SelectItem value="hybrid">Hybrid</SelectItem>
                            <SelectItem value="off-grid">Off-Grid</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-2">
                      <FormField control={form.control} name="annualKwh" render={({ field }) => (
                        <FormItem><FormLabel>Annual kWh</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="monthlyBill" render={({ field }) => (
                        <FormItem><FormLabel>Monthly Bill ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>

                  {/* Column 2 */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg border-b pb-2">Site Conditions</h3>
                    <FormField control={form.control} name="installationType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mount Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="roof">Roof</SelectItem>
                            <SelectItem value="ground">Ground</SelectItem>
                            <SelectItem value="pole">Pole</SelectItem>
                            <SelectItem value="carport">Carport</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-2">
                      <FormField control={form.control} name="shadeLevel" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shade</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="heavy">Heavy</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="availableSqft" render={({ field }) => (
                        <FormItem><FormLabel>Space (sq ft)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                    
                    <h3 className="font-semibold text-lg border-b pb-2 mt-8">Budget & Backup</h3>
                    <FormField control={form.control} name="budgetTier" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Budget Tier</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="economy">Economy</SelectItem>
                            <SelectItem value="mid-range">Mid-Range</SelectItem>
                            <SelectItem value="premium">Premium</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                </div>
              </CardContent>
              
              <CardFooter className="flex justify-end border-t pt-6">
                <Button type="submit" disabled={updateProject.isPending || calculateProject.isPending}>
                  {(updateProject.isPending || calculateProject.isPending) ? (
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
