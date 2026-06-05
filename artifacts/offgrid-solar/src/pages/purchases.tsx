import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingBag, DollarSign, Lock } from "lucide-react";
import { appEnv } from "@/config/env";

interface Purchase {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  systemType: string;
  paidAt: string | null;
  paidAmount: number | null;
  selectedPlan: string | null;
  entitlementType: string | null;
  reportCredits: number;
  creditsUsed: number;
  paymentStatus: string;
  stripeSessionId: string | null;
  purchaserEmail: string | null;
  createdAt: string;
}

function formatCents(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function planLabel(plan: string | null): string {
  switch (plan) {
    case "homeowner":
    case "homeowner_report":         return "Homeowner";
    case "property_pack":            return "Property Pack";
    case "contractor_annual":        return "Contractor Annual";
    case "contractor_lifetime":
    case "contractor_lifetime_beta": return "Contractor Lifetime";
    default:                         return plan ?? "Unknown";
  }
}

export default function PurchasesPage() {
  const [adminToken, setAdminToken] = useState<string>(() => {
    try { return sessionStorage.getItem("admin-token") ?? ""; } catch { return ""; }
  });
  const [tokenInput, setTokenInput] = useState("");
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalRevenue, setTotalRevenue] = useState(0);

  const fetchPurchases = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const base = appEnv.apiBaseUrl.replace(/\/+$/, "");
      const res = await fetch(`${base}/projects/purchases`, {
        headers: { "x-admin-token": token },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Purchase[];
      setPurchases(data);
      setTotalRevenue(data.reduce((sum, p) => sum + (p.paidAmount ?? 0), 0));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load purchases");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = () => {
    const t = tokenInput.trim();
    if (!t) return;
    try { sessionStorage.setItem("admin-token", t); } catch { /* ignore */ }
    setAdminToken(t);
    fetchPurchases(t);
  };

  // If we already have a stored token, auto-load on first render
  if (adminToken && purchases === null && !loading && !error) {
    fetchPurchases(adminToken);
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingBag className="h-8 w-8" />
            Purchases
          </h1>
          <p className="text-muted-foreground mt-1">All completed Stripe payments. Admin access required.</p>
        </div>

        {/* Admin token gate */}
        {!adminToken && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" /> Admin Authentication
              </CardTitle>
              <CardDescription>Enter your ADMIN_TOKEN to view purchases.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Input
                type="password"
                placeholder="Admin token"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                className="max-w-xs"
              />
              <Button onClick={handleUnlock} disabled={!tokenInput.trim()}>
                Unlock
              </Button>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-6 text-destructive text-sm">
              {error}
              {adminToken && (
                <Button variant="outline" size="sm" className="ml-4" onClick={() => {
                  setAdminToken("");
                  setPurchases(null);
                  setError(null);
                  try { sessionStorage.removeItem("admin-token"); } catch { /* ignore */ }
                }}>
                  Re-enter Token
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {purchases && !loading && (
          <>
            {/* Summary strip */}
            <div className="grid sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <ShoppingBag className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{purchases.length}</p>
                    <p className="text-xs text-muted-foreground">Total Purchases</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <DollarSign className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{formatCents(totalRevenue)}</p>
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <DollarSign className="h-8 w-8 text-amber-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {purchases.length > 0 ? formatCents(Math.round(totalRevenue / purchases.length)) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg. Order Value</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {purchases.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No completed purchases yet.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>All Paid Projects</CardTitle>
                  <CardDescription>Sorted by payment date (newest first)</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left px-4 py-2 font-medium">Project</th>
                          <th className="text-left px-4 py-2 font-medium">Location</th>
                          <th className="text-left px-4 py-2 font-medium">Plan</th>
                          <th className="text-right px-4 py-2 font-medium">Amount</th>
                          <th className="text-left px-4 py-2 font-medium">Credits</th>
                          <th className="text-left px-4 py-2 font-medium">Paid At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchases.map((p) => (
                          <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium">{p.name}</div>
                              <div className="text-xs text-muted-foreground">ID #{p.id}</div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {p.city}, {p.state} {p.zip}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className="text-xs">
                                {planLabel(p.selectedPlan)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-green-700">
                              {formatCents(p.paidAmount)}
                            </td>
                            <td className="px-4 py-3">
                              {p.creditsUsed}/{p.reportCredits}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {p.paidAt ? new Date(p.paidAt).toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="text-right">
              <Button variant="outline" size="sm" onClick={() => fetchPurchases(adminToken)}>
                Refresh
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
