import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Ticket, Lock, Plus, Users, Pencil } from "lucide-react";
import { getAdminToken, saveAdminToken } from "@/hooks/useAdminToken";
import {
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  listPromoRedemptions,
  type PromoCode,
  type PromoRedemption,
} from "@/services/promoCodeService";

/** ISO timestamp -> value for a <input type="datetime-local">, in local time. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value -> ISO string (or null when blank). */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isExpired(code: PromoCode): boolean {
  return code.expiresAt != null && new Date(code.expiresAt).getTime() < Date.now();
}

function isLimitReached(code: PromoCode): boolean {
  return code.maxRedemptions != null && code.redemptionCount >= code.maxRedemptions;
}

function statusBadge(code: PromoCode) {
  if (!code.active) return <Badge variant="secondary">Inactive</Badge>;
  if (isExpired(code)) return <Badge variant="destructive">Expired</Badge>;
  if (isLimitReached(code)) return <Badge variant="destructive">Limit reached</Badge>;
  return <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>;
}

export default function AdminPromosPage() {
  const [adminToken, setAdminToken] = useState<string>(() => getAdminToken());
  const [tokenInput, setTokenInput] = useState("");
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [newCode, setNewCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMax, setNewMax] = useState("");
  const [newExpires, setNewExpires] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // edit dialog
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editMax, setEditMax] = useState("");
  const [editExpires, setEditExpires] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // redemptions dialog
  const [redemptionsFor, setRedemptionsFor] = useState<PromoCode | null>(null);
  const [redemptions, setRedemptions] = useState<PromoRedemption[] | null>(null);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);
  const [redemptionsError, setRedemptionsError] = useState<string | null>(null);

  const fetchCodes = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      setCodes(await listPromoCodes(token));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load promo codes");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = () => {
    const t = tokenInput.trim();
    if (!t) return;
    saveAdminToken(t);
    setAdminToken(t);
    fetchCodes(t);
  };

  const handleReenter = () => {
    saveAdminToken("");
    setAdminToken("");
    setCodes(null);
    setError(null);
  };

  const handleCreate = async () => {
    const code = newCode.trim();
    if (!code) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createPromoCode(adminToken, {
        code,
        description: newDescription.trim() || undefined,
        maxRedemptions: newMax.trim() ? Number(newMax) : null,
        expiresAt: localInputToIso(newExpires),
      });
      setNewCode("");
      setNewDescription("");
      setNewMax("");
      setNewExpires("");
      await fetchCodes(adminToken);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create promo code");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (code: PromoCode) => {
    setEditing(code);
    setEditDescription(code.description ?? "");
    setEditMax(code.maxRedemptions != null ? String(code.maxRedemptions) : "");
    setEditExpires(isoToLocalInput(code.expiresAt));
    setEditActive(code.active);
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await updatePromoCode(adminToken, editing.id, {
        description: editDescription.trim(),
        maxRedemptions: editMax.trim() ? Number(editMax) : null,
        expiresAt: localInputToIso(editExpires),
        active: editActive,
      });
      setEditing(null);
      await fetchCodes(adminToken);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to update promo code");
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleActive = async (code: PromoCode) => {
    try {
      await updatePromoCode(adminToken, code.id, { active: !code.active });
      await fetchCodes(adminToken);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update promo code");
    }
  };

  const openRedemptions = async (code: PromoCode) => {
    setRedemptionsFor(code);
    setRedemptions(null);
    setRedemptionsError(null);
    setRedemptionsLoading(true);
    try {
      setRedemptions(await listPromoRedemptions(adminToken, code.id));
    } catch (e: unknown) {
      setRedemptionsError(e instanceof Error ? e.message : "Failed to load redemptions");
    } finally {
      setRedemptionsLoading(false);
    }
  };

  // Auto-load when a stored token is present.
  if (adminToken && codes === null && !loading && !error) {
    fetchCodes(adminToken);
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Ticket className="h-8 w-8" />
            Promo Codes
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and manage trial / promo codes that unlock a paid report without Stripe. Admin access required.
          </p>
        </div>

        {/* Admin token gate */}
        {!adminToken && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" /> Admin Authentication
              </CardTitle>
              <CardDescription>Enter your ADMIN_TOKEN to manage promo codes.</CardDescription>
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

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-6 text-destructive text-sm flex items-center">
              {error}
              {adminToken && (
                <Button variant="outline" size="sm" className="ml-4" onClick={handleReenter}>
                  Re-enter Token
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {adminToken && (
          <>
            {/* Create form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Plus className="h-5 w-5" /> New Promo Code
                </CardTitle>
                <CardDescription>
                  Codes are stored uppercase. Leave the limit blank for unlimited, and the expiry blank for never.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-code">Code</Label>
                  <Input
                    id="new-code"
                    placeholder="e.g. SOLAR2026"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-max">Max redemptions (blank = unlimited)</Label>
                  <Input
                    id="new-max"
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={newMax}
                    onChange={(e) => setNewMax(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-expires">Expires (blank = never)</Label>
                  <Input
                    id="new-expires"
                    type="datetime-local"
                    value={newExpires}
                    onChange={(e) => setNewExpires(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-desc">Description</Label>
                  <Textarea
                    id="new-desc"
                    placeholder="Internal note (optional)"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={1}
                  />
                </div>
                {createError && (
                  <p className="text-sm text-destructive sm:col-span-2">{createError}</p>
                )}
                <div className="sm:col-span-2">
                  <Button onClick={handleCreate} disabled={creating || !newCode.trim()}>
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Create Code
                  </Button>
                </div>
              </CardContent>
            </Card>

            {loading && (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {codes && !loading && (
              <Card>
                <CardHeader>
                  <CardTitle>All Promo Codes</CardTitle>
                  <CardDescription>{codes.length} code{codes.length === 1 ? "" : "s"} total</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {codes.length === 0 ? (
                    <p className="py-12 text-center text-muted-foreground">No promo codes yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-4 py-2 font-medium">Code</th>
                            <th className="text-left px-4 py-2 font-medium">Status</th>
                            <th className="text-left px-4 py-2 font-medium">Redemptions</th>
                            <th className="text-left px-4 py-2 font-medium">Expires</th>
                            <th className="text-center px-4 py-2 font-medium">Active</th>
                            <th className="text-right px-4 py-2 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {codes.map((c) => (
                            <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-mono font-medium">{c.code}</div>
                                {c.description && (
                                  <div className="text-xs text-muted-foreground max-w-xs truncate">{c.description}</div>
                                )}
                              </td>
                              <td className="px-4 py-3">{statusBadge(c)}</td>
                              <td className="px-4 py-3">
                                {c.redemptionCount}
                                {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : " / ∞"}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {c.expiresAt ? new Date(c.expiresAt).toLocaleString() : "Never"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Switch
                                  checked={c.active}
                                  onCheckedChange={() => toggleActive(c)}
                                  aria-label={`Toggle ${c.code} active`}
                                />
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <Button variant="outline" size="sm" className="mr-2" onClick={() => openEdit(c)}>
                                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => openRedemptions(c)}>
                                  <Users className="mr-1.5 h-3.5 w-3.5" /> Redemptions
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="text-right">
              <Button variant="outline" size="sm" onClick={() => fetchCodes(adminToken)}>
                Refresh
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.code}</DialogTitle>
            <DialogDescription>The code itself cannot be changed so existing links stay valid.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-max">Max redemptions (blank = unlimited)</Label>
              <Input
                id="edit-max"
                type="number"
                min="1"
                placeholder="Unlimited"
                value={editMax}
                onChange={(e) => setEditMax(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-expires">Expires (blank = never)</Label>
              <Input
                id="edit-expires"
                type="datetime-local"
                value={editExpires}
                onChange={(e) => setEditExpires(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="edit-active" checked={editActive} onCheckedChange={setEditActive} />
              <Label htmlFor="edit-active">Active</Label>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redemptions dialog */}
      <Dialog open={redemptionsFor !== null} onOpenChange={(open) => !open && setRedemptionsFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redemptions — {redemptionsFor?.code}</DialogTitle>
            <DialogDescription>Everyone who has unlocked a report with this code.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {redemptionsLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {redemptionsError && <p className="text-sm text-destructive py-4">{redemptionsError}</p>}
            {redemptions && !redemptionsLoading && (
              redemptions.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground text-sm">No redemptions yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium">Email</th>
                      <th className="text-left px-3 py-2 font-medium">Project</th>
                      <th className="text-left px-3 py-2 font-medium">Redeemed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {redemptions.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="px-3 py-2">{r.email}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.projectName ?? `#${r.projectId}`}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {new Date(r.redeemedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
