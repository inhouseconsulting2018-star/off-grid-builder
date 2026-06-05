import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { PlusCircle, Search, Trash2, Edit, Eye, Zap, ShieldCheck, ZapOff, MapPin, BarChart3, Map } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRef, useState } from "react";
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

const systemTypeBadge: Record<string, string> = {
  "off-grid": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "grid-tied": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "hybrid": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

export default function ProjectsDashboard() {
  const projects: any[] = [];
  const summary = {
    totalProjects: 0,
    totalSystemKw: 0,
    offGridCount: 0,
    gridTiedCount: 0,
  };
  const isProjectsLoading = false;
  const isSummaryLoading = false;
  const { toast } = useToast();
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const [mapSelectedId, setMapSelectedId] = useState<number | null>(null);

  const handleDelete = (id: number) => {
    void id;
    toast({ title: "Open the project with its secure access link to delete it." });
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
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Solar Projects</h1>
            <p className="text-muted-foreground mt-1 text-sm">Manage and view your solar system designs.</p>
          </div>
          <Link href="/wizard">
            <Button className="gap-2 w-full sm:w-auto">
              <PlusCircle className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Stats Grid — 2 cols on mobile, 4 on desktop */}
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
            <CardTitle className="text-base">Recent Designs</CardTitle>
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

                      {/* Action buttons */}
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
