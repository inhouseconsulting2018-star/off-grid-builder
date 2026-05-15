import { AppLayout } from "@/components/layout/AppLayout";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Settings as SettingsIcon, Save } from "lucide-react";

const settingsSchema = z.object({
  panelWattage: z.coerce.number().min(100).max(1000),
  baseSystemLossPct: z.coerce.number().min(0).max(100),
  inverterLossPct: z.coerce.number().min(0).max(100),
  wireLossPct: z.coerce.number().min(0).max(100),
  dirtLossPct: z.coerce.number().min(0).max(100),
  tempLossPct: z.coerce.number().min(0).max(100),
  batteryRoundTripLossPct: z.coerce.number().min(0).max(100),
  batteryDod: z.coerce.number().min(10).max(100),
  defaultUtilityRate: z.coerce.number().min(0.01),
  economyDiyPerWatt: z.coerce.number().min(0.1),
  economyInstalledPerWatt: z.coerce.number().min(0.1),
  midRangeDiyPerWatt: z.coerce.number().min(0.1),
  midRangeInstalledPerWatt: z.coerce.number().min(0.1),
  premiumDiyPerWatt: z.coerce.number().min(0.1),
  premiumInstalledPerWatt: z.coerce.number().min(0.1),
  inverterCostPerKw: z.coerce.number().min(0),
  mountingCostPerPanel: z.coerce.number().min(0),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      panelWattage: 400,
      baseSystemLossPct: 10,
      inverterLossPct: 5,
      wireLossPct: 2,
      dirtLossPct: 3,
      tempLossPct: 10,
      batteryRoundTripLossPct: 5,
      batteryDod: 80,
      defaultUtilityRate: 0.15,
      economyDiyPerWatt: 1.5,
      economyInstalledPerWatt: 2.5,
      midRangeDiyPerWatt: 2.0,
      midRangeInstalledPerWatt: 3.5,
      premiumDiyPerWatt: 2.5,
      premiumInstalledPerWatt: 4.5,
      inverterCostPerKw: 300,
      mountingCostPerPanel: 125,
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        ...settings,
        inverterCostPerKw: settings.inverterCostPerKw ?? 300,
        mountingCostPerPanel: settings.mountingCostPerPanel ?? 125,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormValues) => {
    updateSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Settings updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to update settings", variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded w-full"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-8 w-8" />
            Calculation Settings
          </h1>
          <p className="text-muted-foreground mt-1">Configure global parameters used in solar calculations.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System & Components</CardTitle>
                <CardDescription>Default equipment specs and rates</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="panelWattage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Panel Wattage (W)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="batteryDod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Battery Depth of Discharge (%)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultUtilityRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Utility Rate ($/kWh)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Losses (%)</CardTitle>
                <CardDescription>Percentages deducted during calculation</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="baseSystemLossPct" render={({ field }) => (
                  <FormItem><FormLabel>Base Loss</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="inverterLossPct" render={({ field }) => (
                  <FormItem><FormLabel>Inverter Loss</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="wireLossPct" render={({ field }) => (
                  <FormItem><FormLabel>Wire Loss</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="dirtLossPct" render={({ field }) => (
                  <FormItem><FormLabel>Dirt/Soiling Loss</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="tempLossPct" render={({ field }) => (
                  <FormItem><FormLabel>Temperature Loss</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="batteryRoundTripLossPct" render={({ field }) => (
                  <FormItem><FormLabel>Battery R/T Loss</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pricing Tiers ($/Watt)</CardTitle>
                <CardDescription>Used to estimate solar array project costs by budget tier</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm">Economy</h4>
                  <FormField control={form.control} name="economyDiyPerWatt" render={({ field }) => (
                    <FormItem><FormLabel>DIY ($/W)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="economyInstalledPerWatt" render={({ field }) => (
                    <FormItem><FormLabel>Installed ($/W)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm">Mid-Range</h4>
                  <FormField control={form.control} name="midRangeDiyPerWatt" render={({ field }) => (
                    <FormItem><FormLabel>DIY ($/W)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="midRangeInstalledPerWatt" render={({ field }) => (
                    <FormItem><FormLabel>Installed ($/W)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm">Premium</h4>
                  <FormField control={form.control} name="premiumDiyPerWatt" render={({ field }) => (
                    <FormItem><FormLabel>DIY ($/W)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="premiumInstalledPerWatt" render={({ field }) => (
                    <FormItem><FormLabel>Installed ($/W)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Component Cost Estimates</CardTitle>
                <CardDescription>Used to generate per-component cost breakdowns on the results page</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="inverterCostPerKw" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inverter Cost ($/kW)</FormLabel>
                    <FormControl><Input type="number" step="10" {...field} /></FormControl>
                    <FormDescription className="text-xs">Cost per kW of inverter capacity. Multiplied by the inverter size to estimate inverter line item.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mountingCostPerPanel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mounting Cost ($/panel)</FormLabel>
                    <FormControl><Input type="number" step="5" {...field} /></FormControl>
                    <FormDescription className="text-xs">Racking and mounting hardware cost per panel. Multiplied by panel count to estimate mounting line item.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={updateSettings.isPending}>
                <Save className="h-5 w-5 mr-2" />
                Save Settings
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}
