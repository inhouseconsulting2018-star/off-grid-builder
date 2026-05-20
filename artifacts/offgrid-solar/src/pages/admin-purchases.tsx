import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminPurchases } from "@/services/projectService";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CreditCard, FileText, Loader2, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function AdminPurchases() {
  const [token, setToken] = useState(() => sessionStorage.getItem("offgrid.adminToken") ?? "");
  const [draftToken, setDraftToken] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-purchases", token ? "token" : "missing"],
    queryFn: getAdminPurchases,
    enabled: !!token,
  });

  const purchases = data?.purchases ?? [];
  const deliveredCount = purchases.filter((p) => p.reportDeliveryStatus === "sent").length;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {!token && (
          <Card>
            <CardHeader>
              <CardTitle>Admin Access</CardTitle>
              <CardDescription>Enter the configured admin token for this browser session.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-2">
              <Input type="password" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} placeholder="ADMIN_TOKEN" />
              <Button onClick={() => {
                sessionStorage.setItem("offgrid.adminToken", draftToken.trim());
                setToken(draftToken.trim());
              }}>
                Continue
              </Button>
            </CardContent>
          </Card>
        )}
        {token && (
        <>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Purchases</h1>
            <p className="text-sm text-muted-foreground mt-1">Report purchases, launch plans, guest checkout emails, and delivery state.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-black">{purchases.length}</div>
              <div className="text-xs text-muted-foreground">Total purchases</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-black">{deliveredCount}</div>
              <div className="text-xs text-muted-foreground">Reports delivered</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-black">{purchases.filter((p) => p.purchaserEmail).length}</div>
              <div className="text-xs text-muted-foreground">Guest emails captured</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Unlocked Reports</CardTitle>
            <CardDescription>Stripe Checkout sessions include homeowner, pack, annual contractor, and lifetime beta purchases.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="py-10 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading purchases...
              </div>
            )}
            {error && <div className="py-8 text-destructive">Could not load purchases.</div>}
            {!isLoading && !error && purchases.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">No report purchases yet.</div>
            )}
            {purchases.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>System</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((purchase) => (
                      <TableRow key={purchase.projectId}>
                        <TableCell>
                          <div className="font-medium">{purchase.projectName}</div>
                          <div className="text-xs text-muted-foreground">{purchase.city}, {purchase.state}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            {purchase.purchaserEmail ?? "Not captured"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {purchase.paidAt ? new Date(purchase.paidAt).toLocaleString() : "Unpaid"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{purchase.selectedPlan ?? "homeowner_report"}</div>
                          <div className="text-xs text-muted-foreground">{purchase.reportCredits ?? 0} credits</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={purchase.reportDeliveryStatus === "sent" ? "default" : "secondary"}>
                            {purchase.reportDeliveryStatus}
                          </Badge>
                          {purchase.reportDeliveredAt && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(purchase.reportDeliveredAt).toLocaleString()}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {purchase.systemType} · {purchase.installationType}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/results/${purchase.projectId}`}>
                            <Button variant="outline" size="sm" className="gap-1.5">
                              <FileText className="h-3.5 w-3.5" />
                              Report
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        </>
        )}
      </div>
    </AppLayout>
  );
}
