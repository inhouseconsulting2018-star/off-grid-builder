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
import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Save, Lock, FolderOpen, FileDown, Mail, PlusCircle, Home, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { getAdminToken, saveAdminToken, adminRequestOpts } from "@/hooks/useAdminToken";
import { clearProjectRegistry, getProjectRegistry } from "@/services/projectRegistry";

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

// ---------------------------------------------------------------------------
// Customer-facing settings / help — shown by default (no login required).
// ---------------------------------------------------------------------------

function CustomerSettings({ onUseAdmin }: { onUseAdmin: (token: string) => void }) {
  const [showAdmin, setShowAdmin] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [savedProjectCount, setSavedProjectCount] = useState(() => getProjectRegistry().length);
  const { toast } = useToast();

  const clearBrowserAccess = () => {
    const confirmed = window.confirm(
      "Remove saved project links from this browser? Projects are not deleted, but you will need their original secure links to reopen them.",
    );
    if (!confirmed) return;
    clearProjectRegistry();
    setSavedProjectCount(0);
    toast({
      title: "Saved browser access cleared",
      description: "Your projects still exist on the server.",
    });
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-8 w-8" />
            Account &amp; Settings
          </h1>
          <p className="text-muted-foreground mt-1">How your projects, reports, and report access work.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Your account
            </CardTitle>
            <CardDescription>No password needed</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              OffGrid Solar Builder doesn&apos;t require an account or login. Each project you create gets its own
              private, secure access link. Your projects are saved in this browser so you can pick up where you left off.
            </p>
            <p className="font-medium text-foreground">
              {savedProjectCount} project{savedProjectCount === 1 ? "" : "s"} saved in this browser.
            </p>
            <p>
              After you buy a report, we email a secure link so you can reopen your full report and download the PDF
              from any device — keep that email for your records.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              Your projects &amp; reports
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              View all your saved designs on the <Link href="/projects" className="text-primary hover:underline">My Projects</Link> page.
              Paid projects show a “Paid” badge with a <span className="inline-flex items-center gap-1"><FileDown className="h-3.5 w-3.5" /> PDF</span> download button.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/projects"><Button variant="outline" size="sm" className="gap-1.5"><FolderOpen className="h-3.5 w-3.5" /> My Projects</Button></Link>
              <Link href="/wizard"><Button variant="outline" size="sm" className="gap-1.5"><PlusCircle className="h-3.5 w-3.5" /> New Project</Button></Link>
              <Link href="/"><Button variant="outline" size="sm" className="gap-1.5"><Home className="h-3.5 w-3.5" /> Home</Button></Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Need help?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Lost your report link, or have a question about a purchase? Reply directly to your purchase
              confirmation email or contact{" "}
              <a className="text-primary hover:underline" href="mailto:support@offgridsolarbuilder.com">
                support@offgridsolarbuilder.com
              </a>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Browser access</CardTitle>
            <CardDescription>Remove secure project links saved on this device.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive"
              disabled={savedProjectCount === 0}
              onClick={clearBrowserAccess}
            >
              <Trash2 className="h-4 w-4" />
              Clear Saved Project Access
            </Button>
          </CardContent>
        </Card>

        {/* Subtle admin entry for the site owner */}
        <div className="border-t pt-4">
          {showAdmin ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Admin
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Input
                  type="password"
                  placeholder="Admin token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && tokenInput.trim() && onUseAdmin(tokenInput.trim())}
                  className="h-8 text-sm w-full sm:w-52"
                />
                <Button size="sm" onClick={() => tokenInput.trim() && onUseAdmin(tokenInput.trim())} disabled={!tokenInput.trim()}>Unlock</Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdmin(true)}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground"
            >
              Admin access
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// Admin calculation settings (admin token only).
// ---------------------------------------------------------------------------

function AdminSettings({ adminToken, onExit }: { adminToken: string; onExit: () => void }) {
  const reqOpts = adminRequestOpts(adminToken);
  const { data: settings, isLoading } = useGetSettings({ request: reqOpts });
  const updateSettings = useUpdateSettings({ request: reqOpts });
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
      batteryRoundTripLossPct: 8,
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <SettingsIcon className="h-8 w-8" />
              Calculation Settings
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Admin</span>
            </h1>
            <p className="text-muted-foreground mt-1">Configure global parameters used in solar calculations.</p>
          </div>
          <Button variant="outline" className="gap-2 shrink-0" onClick={onExit}>
            <LogOut className="h-4 w-4" /> Exit admin
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System &amp; Components</CardTitle>
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

export default function SettingsPage() {
  const [adminToken, setAdminTokenState] = useState<string>(getAdminToken);

  if (adminToken) {
    return (
      <AdminSettings
        adminToken={adminToken}
        onExit={() => { saveAdminToken(""); setAdminTokenState(""); }}
      />
    );
  }

  return (
    <CustomerSettings
      onUseAdmin={(token) => { saveAdminToken(token); setAdminTokenState(token); }}
    />
  );
}
