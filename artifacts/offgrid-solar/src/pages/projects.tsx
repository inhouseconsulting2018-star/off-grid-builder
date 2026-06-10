import { AppLayout } from "@/components/layout/AppLayout";
import { useListProjects, useGetProjectsSummary, useDeleteProject, getListProjectsQueryKey, getGetProjectsSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { PlusCircle, Search, Trash2, Edit, Eye, Zap, ShieldCheck, ZapOff, MapPin, BarChart3, Map, Lock, Download, FileText, Loader2, CheckCircle2, AlertTriangle, LogOut } from "lucide-react";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";
import { getAdminToken, saveAdminToken, adminRequestOpts } from "@/hooks/useAdminToken";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { DashboardMap } from "@/components/maps/DashboardMap";
import { appEnv } from "@/config/env";
import { getProjectRegistry, removeProjectFromRegistry, type ProjectRegistryEntry } from "@/services/projectRegistry";

const systemTypeBadge: Record<string, string> = {
  "off-grid": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "grid-tied": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "hybrid": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

const planLabels: Record<string, string> = {
  homeowner: "Homeowner Report",
  homeowner_report: "Homeowner Report",
  property_pack: "Property Pack",
  contractor_annual: "Contractor Annual",
  contractor_lifetime: "Contractor Lifetime",
  contractor_lifetime_beta: "Contractor Lifetime",
};

// ---------------------------------------------------------------------------
// Customer dashboard — driven by the local "my projects" registry.
// No admin token needed; each project is fetched with its own access token.
// ---------------------------------------------------------------------------

type CustomerProject = {
  id: number;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  systemType?: string;
  createdAt?: string;
  paidAt?: string | null;
  paymentStatus?: string | null;
  selectedPlan?: string | null;
  calculationResult?: {
    preview?: boolean;
    adjustedArraySizeKw?: number;
    arraySizeKw?: number;
    systemSizeKwRange?: { low?: number; high?: number };
  } | null;
};

type FetchResult = CustomerProject | { notFound: true };

async function fetchRegistryProject(entry: ProjectRegistryEntry): Promise<FetchResult> {
  const res = await fetch(`${appEnv.apiBaseUrl}/projects/${entry.id}`, {
    headers: { "x-access-token": entry.accessToken },
  });
  // 404 = deleted or invalid token; treat as "remove from my list".
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    return { notFound: true };
  }
  if (!res.ok) throw new Error(`Failed to load project (${res.status})`);
  return (await res.json()) as CustomerProject;
}

function isPaidProject(p: CustomerProject): boolean {
  return !!p.paidAt && p.paymentStatus !== "unpaid";
}

function capacityLabel(p: CustomerProject): string | null {
  const calc = p.calculationResult;
  if (!calc) return null;
  const exact = calc.adjustedArraySizeKw ?? calc.arraySizeKw;
  if (typeof exact === "number" && Number.isFinite(exact)) return `${exact.toFixed(2)} kW`;
  const range = calc.systemSizeKwRange;
  if (range && typeof range.low === "number" && typeof range.high === "number") {
    return `${range.low.toFixed(1)}–${range.high.toFixed(1)} kW`;
  }
  return null;
}

function CustomerDashboard({ onUseAdmin }: { onUseAdmin: (token: string) => void }) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<ProjectRegistryEntry[]>(() => getProjectRegistry());
  const [showAdmin, setShowAdmin] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const queries = useQueries({
    queries: entries.map((entry) => ({
      queryKey: ["my-project", entry.id],
      queryFn: () => fetchRegistryProject(entry),
      retry: false,
      staleTime: 15_000,
    })),
  });

  // Prune projects that 404 (deleted elsewhere or invalid token) from the registry.
  const notFoundIds = entries
    .filter((_, i) => {
      const data = queries[i]?.data;
      return !!data && "notFound" in data;
    })
    .map((e) => e.id);
  const notFoundKey = notFoundIds.join(",");
  useEffect(() => {
    if (notFoundIds.length === 0) return;
    notFoundIds.forEach((id) => removeProjectFromRegistry(id));
    setEntries((prev) => prev.filter((e) => !notFoundIds.includes(e.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notFoundKey]);

  const handleDelete = async (entry: ProjectRegistryEntry) => {
    setDeletingId(entry.id);
    try {
      const res = await fetch(`${appEnv.apiBaseUrl}/projects/${entry.id}`, {
        method: "DELETE",
        headers: { "x-access-token": entry.accessToken },
      });
      if (!res.ok && res.status !== 404) throw new Error("Delete failed");
      removeProjectFromRegistry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      toast({ title: "Project deleted" });
    } catch {
      toast({ title: "Delete failed.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const isInitialLoading = entries.length > 0 && queries.some((q) => q.isLoading);
  const loadedProjects = entries
    .map((entry, i) => {
      const data = queries[i]?.data;
      if (!data || "notFound" in data) return null;
      return { entry, project: data as CustomerProject };
    })
    .filter((x): x is { entry: ProjectRegistryEntry; project: CustomerProject } => x !== null);

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Projects</h1>
            <p className="text-muted-foreground mt-1 text-sm">Your saved solar designs and purchased reports on this device.</p>
          </div>
          <Link href="/wizard">
            <Button className="gap-2 w-full sm:w-auto">
              <PlusCircle className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>

        {isInitialLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-28 animate-pulse bg-muted" />
            ))}
          </div>
        ) : loadedProjects.length > 0 ? (
          <div className="grid gap-3">
            {loadedProjects.map(({ entry, project }) => {
              const paid = isPaidProject(project);
              const name = project.name || entry.name || `Project #${entry.id}`;
              const token = entry.accessToken;
              const cap = capacityLabel(project);
              const planLabel = project.selectedPlan ? planLabels[project.selectedPlan] ?? null : null;
              const resultsHref = `/results/${entry.id}?accessToken=${encodeURIComponent(token)}`;
              const editHref = `/projects/${entry.id}/edit?accessToken=${encodeURIComponent(token)}`;
              const pdfHref = `${appEnv.apiBaseUrl}/projects/${entry.id}/report.pdf?accessToken=${encodeURIComponent(token)}`;
              return (
                <Card key={entry.id} className="overflow-hidden">
                  <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={resultsHref}>
                          <h3 className="font-semibold text-base hover:text-primary hover:underline cursor-pointer truncate">{name}</h3>
                        </Link>
                        {paid ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 inline-flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Paid
                          </span>
                        ) : project.calculationResult ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shrink-0">
                            Preview
                          </span>
                        ) : (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground shrink-0">
                            Draft
                          </span>
                        )}
                        {project.systemType && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${systemTypeBadge[project.systemType] || "bg-secondary text-secondary-foreground"}`}>
                            {project.systemType}
                          </span>
                        )}
                      </div>
                      {(project.city || project.state) && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[project.city, project.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {cap && <span className="font-medium text-foreground">{cap}</span>}
                        {project.createdAt && <span>{format(new Date(project.createdAt), "MMM d, yyyy")}</span>}
                        {paid && planLabel && <span className="text-green-700 dark:text-green-400 font-medium">{planLabel}</span>}
                        {paid && project.paidAt && <span>Purchased {format(new Date(project.paidAt), "MMM d, yyyy")}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <Link href={resultsHref}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Eye className="h-3.5 w-3.5" /> {paid ? "View Report" : "View"}
                        </Button>
                      </Link>
                      {paid ? (
                        <Button
                          variant="default"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => { window.location.href = pdfHref; }}
                        >
                          <Download className="h-3.5 w-3.5" /> PDF
                        </Button>
                      ) : (
                        <Link href={editHref}>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <Edit className="h-3.5 w-3.5" /> Edit
                          </Button>
                        </Link>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={deletingId === entry.id}>
                            {deletingId === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this project?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes "{name}"{paid ? ", including the purchased report" : ""}. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(entry)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="text-center py-16 px-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Search className="h-7 w-7 text-muted-foreground opacity-50" />
              </div>
              <h3 className="text-lg font-semibold">No projects yet</h3>
              <p className="text-muted-foreground mt-1 mb-6 text-sm max-w-md mx-auto">
                Create your first solar design to get a free preview. After purchase, your full report and PDF download appear here.
              </p>
              <Link href="/wizard">
                <Button><PlusCircle className="h-4 w-4 mr-2" /> Start New Design</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground flex items-start gap-1.5 max-w-2xl">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/70" />
          Projects are saved to this browser and linked to your secure report access. Use the link emailed after purchase to reopen a report on another device.
        </p>

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
// Admin dashboard — full all-projects view, stats, and map (admin token only).
// ---------------------------------------------------------------------------

function AdminDashboard({ adminToken, onExit }: { adminToken: string; onExit: () => void }) {
  const reqOpts = adminRequestOpts(adminToken);
  const { data: projects, isLoading: isProjectsLoading } = useListProjects({ request: reqOpts });
  const { data: summary, isLoading: isSummaryLoading } = useGetProjectsSummary({ request: reqOpts });
  const deleteProject = useDeleteProject({ request: reqOpts });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const [mapSelectedId, setMapSelectedId] = useState<number | null>(null);

  const handleDelete = (id: number) => {
    deleteProject.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Project deleted" });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectsSummaryQueryKey() });
      },
      onError: () => {
        toast({ title: "Delete failed.", variant: "destructive" });
      }
    });
  };

  const handleViewOnMap = (id: number) => {
    setMapSelectedId(id);
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              Solar Projects
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Admin</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">All projects across every customer.</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" className="gap-2" onClick={onExit}>
              <LogOut className="h-4 w-4" /> Exit admin
            </Button>
            <Link href="/wizard">
              <Button className="gap-2">
                <PlusCircle className="h-4 w-4" />
                New Project
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        {isSummaryLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="animate-pulse bg-muted h-24" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total Projects</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold">{summary.totalProjects}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total Capacity</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold">{summary.totalSystemKw.toFixed(1)} kW</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">Off-Grid</CardTitle>
                <ZapOff className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold">{summary.offGridCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">Grid-Tied</CardTitle>
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold">{summary.gridTiedCount}</div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Projects Map */}
        {!isProjectsLoading && projects && projects.length > 0 && (
          <Card ref={mapSectionRef}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Map className="h-4 w-4 text-primary" />
                  Project Locations
                </CardTitle>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-orange-500" /> Off-Grid</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-blue-500" /> Grid-Tied</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-purple-500" /> Hybrid</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <DashboardMap
                projects={projects}
                selectedId={mapSelectedId}
                onPinClick={setMapSelectedId}
              />
            </CardContent>
          </Card>
        )}

        {/* Project List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All Designs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isProjectsLoading ? (
              <div className="space-y-0 divide-y px-6 pb-6 pt-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 animate-pulse bg-muted rounded-md my-2" />
                ))}
              </div>
            ) : projects && projects.length > 0 ? (
              <div className="divide-y">
                {projects.map(project => {
                  const adjKw = project.calculationResult?.adjustedArraySizeKw;
                  const grossKw = project.calculationResult?.arraySizeKw;
                  const displayKw = adjKw ?? grossKw;
                  const isMapSelected = project.id === mapSelectedId;
                  return (
                    <div
                      key={project.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 gap-3 transition-colors ${isMapSelected ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-muted/30"}`}
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/results/${project.id}`}>
                            <h3 className="font-semibold text-base hover:text-primary hover:underline cursor-pointer truncate">{project.name}</h3>
                          </Link>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${systemTypeBadge[project.systemType] || "bg-secondary text-secondary-foreground"}`}>
                            {project.systemType}
                          </span>
                          {project.paidAt && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 shrink-0">Paid</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {project.city}, {project.state}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {displayKw != null && (
                            <span className="font-medium text-foreground">{displayKw.toFixed(2)} kW</span>
                          )}
                          <span>{format(new Date(project.createdAt), 'MMM d, yyyy')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link href={`/results/${project.id}`}>
                          <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5">
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                          <Button variant="outline" size="icon" className="sm:hidden h-8 w-8">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button
                          variant={isMapSelected ? "default" : "outline"}
                          size="icon"
                          className="h-8 w-8"
                          title="View on map"
                          onClick={() => handleViewOnMap(project.id)}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                        </Button>
                        <Link href={`/projects/${project.id}/edit`}>
                          <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5">
                            <Edit className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button variant="outline" size="icon" className="sm:hidden h-8 w-8">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. "{project.name}" will be permanently deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(project.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 px-4">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Search className="h-7 w-7 text-muted-foreground opacity-50" />
                </div>
                <h3 className="text-lg font-semibold">No projects yet</h3>
                <p className="text-muted-foreground mt-1 mb-6 text-sm">Create your first solar design to get started.</p>
                <Link href="/wizard">
                  <Button><PlusCircle className="h-4 w-4 mr-2" /> Start New Design</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

export default function ProjectsDashboard() {
  const [adminToken, setAdminTokenState] = useState<string>(getAdminToken);

  if (adminToken) {
    return (
      <AdminDashboard
        adminToken={adminToken}
        onExit={() => { saveAdminToken(""); setAdminTokenState(""); }}
      />
    );
  }

  return (
    <CustomerDashboard
      onUseAdmin={(token) => { saveAdminToken(token); setAdminTokenState(token); }}
    />
  );
}
