import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  CalendarDays,
  Download,
  Edit,
  Eye,
  FileText,
  Loader2,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { appEnv } from "@/config/env";
import {
  listCustomerProjectAccess,
  removeCustomerProjectAccess,
  type CustomerProjectAccess,
} from "@/services/customerProjects";

type DashboardProject = {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string | null;
  paymentStatus?: string;
  selectedPlan?: string | null;
  calculationResult?: unknown;
  accessToken: string;
};

type LoadFailure = CustomerProjectAccess & { reason: string };

function planLabel(plan?: string | null): string {
  switch (plan) {
    case "homeowner_report": return "Homeowner Full Report";
    case "property_pack": return "Property Pack";
    case "contractor_annual": return "Contractor Annual";
    case "contractor_lifetime_beta": return "Contractor Lifetime";
    default: return "No plan selected";
  }
}

function hasActivePaidAccess(project: DashboardProject): boolean {
  if (!project.paidAt) return false;
  if (project.selectedPlan === "contractor_annual") {
    return project.paymentStatus === "paid"
      || project.paymentStatus === "active"
      || project.paymentStatus === "trialing";
  }
  return project.paymentStatus === "paid";
}

function projectStatus(project: DashboardProject): { label: string; className: string } {
  if (hasActivePaidAccess(project)) {
    return { label: "Paid - report unlocked", className: "bg-green-100 text-green-800 border-green-200" };
  }
  if (project.paymentStatus === "failed") {
    return { label: "Payment failed", className: "bg-red-100 text-red-800 border-red-200" };
  }
  if (project.paymentStatus === "canceled") {
    return { label: "Checkout canceled", className: "bg-amber-100 text-amber-800 border-amber-200" };
  }
  if (project.paymentStatus === "pending") {
    return { label: "Checkout pending", className: "bg-blue-100 text-blue-800 border-blue-200" };
  }
  if (project.calculationResult) {
    return { label: "Preview generated - unpaid", className: "bg-slate-100 text-slate-800 border-slate-200" };
  }
  return { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" };
}

export default function ProjectsDashboard() {
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [failures, setFailures] = useState<LoadFailure[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const accessEntries = listCustomerProjectAccess();
    const loaded = await Promise.all(accessEntries.map(async (entry) => {
      try {
        const base = appEnv.apiBaseUrl.replace(/\/+$/, "");
        const response = await fetch(`${base}/projects/${entry.id}`, {
          headers: { "x-access-token": entry.accessToken },
        });
        if (!response.ok) {
          return { failure: { ...entry, reason: response.status === 404 ? "Access link is no longer valid." : `HTTP ${response.status}` } };
        }
        const project = await response.json() as Omit<DashboardProject, "accessToken">;
        return { project: { ...project, accessToken: entry.accessToken } };
      } catch {
        return { failure: { ...entry, reason: "Could not reach the project service." } };
      }
    }));

    setProjects(
      loaded.flatMap((result) => result.project ? [result.project] : [])
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    );
    setFailures(loaded.flatMap((result) => result.failure ? [result.failure] : []));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const paidCount = useMemo(() => projects.filter(hasActivePaidAccess).length, [projects]);
  const previewCount = projects.length - paidCount;

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your Solar Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Projects saved in this browser are verified against the live backend each time this page loads.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void loadProjects()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Link href="/wizard">
              <Button><PlusCircle className="mr-2 h-4 w-4" /> New Project</Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold">{projects.length}</div>
              <div className="text-sm text-muted-foreground">Saved in this browser</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold text-green-700">{paidCount}</div>
              <div className="text-sm text-muted-foreground">Paid reports</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold">{previewCount}</div>
              <div className="text-sm text-muted-foreground">Drafts and previews</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Saved Projects</CardTitle>
            <CardDescription>
              Paid status and PDF access shown here come from the server, not browser-only state.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : projects.length ? (
              <div className="grid gap-4">
                {projects.map((project) => {
                  const status = projectStatus(project);
                  const isPaid = hasActivePaidAccess(project);
                  const query = `accessToken=${encodeURIComponent(project.accessToken)}`;
                  return (
                    <div key={project.id} className="rounded-lg border p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-lg font-semibold">{project.name}</h2>
                            <Badge variant="outline" className={status.className}>{status.label}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {project.address}, {project.city}, {project.state} {project.zip}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Created {new Date(project.createdAt).toLocaleDateString()}</span>
                            <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                            <span>{planLabel(project.selectedPlan)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/results/${project.id}?${query}`}>
                            <Button size="sm" variant={isPaid ? "default" : "outline"}>
                              {isPaid ? <FileText className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                              {isPaid ? "View Paid Report" : "View Preview"}
                            </Button>
                          </Link>
                          {isPaid ? (
                            <a href={`${appEnv.apiBaseUrl}/projects/${project.id}/report.pdf?${query}`} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="outline"><Download className="mr-2 h-4 w-4" /> PDF</Button>
                            </a>
                          ) : (
                            <Link href={`/projects/${project.id}/edit?${query}`}>
                              <Button size="sm" variant="outline"><Edit className="mr-2 h-4 w-4" /> Continue/Edit</Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-14 text-center">
                <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold">No projects saved in this browser</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                  Create a new design here. Projects created on another browser or device need their original secure report link because customer accounts are not implemented yet.
                </p>
                <Link href="/wizard"><Button className="mt-5">Start New Design</Button></Link>
              </div>
            )}
          </CardContent>
        </Card>

        {failures.length > 0 && (
          <Card className="border-amber-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><AlertCircle className="h-5 w-5" /> Access problems</CardTitle>
              <CardDescription>These locally saved entries could not be verified.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {failures.map((failure) => (
                <div key={failure.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{failure.name || `Project #${failure.id}`}</div>
                    <div className="text-sm text-muted-foreground">{failure.reason}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    removeCustomerProjectAccess(failure.id);
                    void loadProjects();
                  }}>Remove stale entry</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" /> Current access model
          </div>
          Project access is tied to this browser and each project&apos;s secure token. Clearing browser storage removes the dashboard index but does not delete projects from the database.
        </div>
      </div>
    </AppLayout>
  );
}
