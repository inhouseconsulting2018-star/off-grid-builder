import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { useGetProject, useCalculateProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, PlusCircle, AlertTriangle, Zap, Battery, DollarSign, Settings2, Edit } from "lucide-react";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Results() {
  const { id } = useParams();
  const projectId = parseInt(id || "0", 10);
  const { data: project, isLoading, error } = useGetProject(projectId);
  const calculateProject = useCalculateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const hasTriggeredCalc = useRef(false);

  useEffect(() => {
    // If project loaded but has no calculation result, calculate it (only once)
    if (project && !project.calculationResult && !hasTriggeredCalc.current) {
      hasTriggeredCalc.current = true;
      calculateProject.mutate({ id: projectId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        },
        onError: () => {
          toast({ title: "Calculation failed", variant: "destructive" });
        }
      });
    }
  }, [project, projectId, queryClient, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !project?.calculationResult) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
          <h2 className="text-2xl font-bold">Crunching the numbers...</h2>
          <p className="text-muted-foreground mt-2">Generating your engineering-grade solar report.</p>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-destructive">Failed to load project report.</div>
      </AppLayout>
    );
  }

  const calc = project.calculationResult;

  const handlePrint = () => window.print();

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto flex flex-col gap-8 print:block print:max-w-none">
        
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{project.name}</h1>
            <p className="text-muted-foreground mt-1">{project.address}, {project.city}, {project.state}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/projects/${project.id}/edit`}>
              <Button variant="outline"><Edit className="h-4 w-4 mr-2" /> Edit</Button>
            </Link>
            <Button variant="outline" onClick={handlePrint}>
              <Download className="h-4 w-4 mr-2" /> Download Report
            </Button>
            <Link href="/wizard">
              <Button><PlusCircle className="h-4 w-4 mr-2" /> New Design</Button>
            </Link>
          </div>
        </div>

        {/* Primary Recommendations */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" /> Array Size
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-black text-primary">{calc.adjustedArraySizeKw.toFixed(2)} kW</div>
              <p className="text-sm font-medium mt-2">{calc.numPanels} Panels required</p>
              <p className="text-sm text-muted-foreground">Est. {calc.yearlyProductionKwh.toLocaleString()} kWh / year</p>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Battery className="h-5 w-5 text-primary" /> Storage
              </CardTitle>
            </CardHeader>
            <CardContent>
              {project.systemType === "grid-tied" && project.backupHours === 0 ? (
                <div className="text-4xl font-black text-muted-foreground">N/A</div>
              ) : (
                <>
                  <div className="text-4xl font-black text-primary">{calc.batteryUsableKwh.toFixed(1)} kWh</div>
                  <p className="text-sm font-medium mt-2">Usable Capacity</p>
                  <p className="text-sm text-muted-foreground">{calc.totalBatteryBankKwh.toFixed(1)} kWh Total Bank</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" /> Inverter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-black text-primary">{calc.inverterSizeKw.toFixed(1)} kW</div>
              <p className="text-sm font-medium mt-2">Recommended Rating</p>
            </CardContent>
          </Card>
        </div>

        {/* Financials & Equipment */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Estimated Costs</CardTitle>
              <CardDescription>Based on {project.budgetTier} tier pricing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Installed by Professional</h4>
                <div className="text-2xl font-bold">
                  ${calc.installedCostLow.toLocaleString()} - ${calc.installedCostHigh.toLocaleString()}
                </div>
              </div>
              <div className="h-px bg-border" />
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">DIY Equipment Only</h4>
                <div className="text-xl font-semibold text-muted-foreground">
                  ${calc.diyEquipmentCostLow.toLocaleString()} - ${calc.diyEquipmentCostHigh.toLocaleString()}
                </div>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg mt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Est. Yearly Savings:</span>
                  <span className="font-bold text-green-600 dark:text-green-400">${calc.estimatedYearlySavings.toLocaleString()}</span>
                </div>
                {calc.paybackYears && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-medium">Est. Payback Period:</span>
                    <span className="font-bold">{calc.paybackYears.toFixed(1)} Years</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Equipment Recommendations</CardTitle>
              <CardDescription>High quality brands matching your profile</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                <li className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Solar Panels</span>
                  <span className="font-semibold">{calc.recommendedPanelBrand}</span>
                </li>
                <li className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Inverter</span>
                  <span className="font-semibold">{calc.recommendedInverterBrand}</span>
                </li>
                <li className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Battery Storage</span>
                  <span className="font-semibold">{calc.recommendedBatteryBrand || "N/A"}</span>
                </li>
                <li className="flex justify-between pb-2">
                  <span className="text-muted-foreground">Mounting Hardware</span>
                  <span className="font-semibold">{calc.recommendedMountingBrand}</span>
                </li>
              </ul>

              <div className="mt-6">
                <h4 className="text-sm font-semibold mb-3">System Loss Breakdown ({calc.totalSystemLossPct.toFixed(1)}% Total)</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Inverter:</span> <span>{calc.inverterLossPct}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Wire:</span> <span>{calc.wireLossPct}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Shade:</span> <span>{calc.shadeLossPct}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Temp:</span> <span>{calc.tempLossPct}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Dirt:</span> <span>{calc.dirtLossPct}%</span></div>
                  {calc.batteryLossPct > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Battery:</span> <span>{calc.batteryLossPct}%</span></div>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes & Warnings */}
        {calc.notes && calc.notes.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-amber-700 dark:text-amber-500">
                <AlertTriangle className="h-5 w-5" /> Engineering Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2 text-amber-900 dark:text-amber-200">
                {calc.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Disclaimer */}
        <div className="text-xs text-muted-foreground text-center p-6 border-t mt-8 print:mt-auto">
          <p>
            This tool provides preliminary solar estimates only. Final system design, electrical work, permitting, and interconnection should be verified by a licensed solar/electrical professional and local authority having jurisdiction.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
