import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getAdminToken } from "@/hooks/useAdminToken";
import { apiGet, apiPatch, apiPost } from "@/services/apiService";
import { ArrowLeft, Loader2, Plus, Save, TicketCheck } from "lucide-react";

type Redemption = {
  id: number;
  projectId: number;
  email: string;
  redeemedAt: string;
};

type PromoCode = {
  id: number;
  code: string;
  purpose: string;
  active: boolean;
  maxRedemptions: number | null;
  maxRedemptionsPerEmail: number;
  expiresAt: string | null;
  redemptionCount: number;
  redemptions: Redemption[];
};

type PromoDraft = {
  purpose: string;
  active: boolean;
  maxRedemptions: string;
  maxRedemptionsPerEmail: string;
  expiresAt: string;
};

function dateTimeInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function PromoEditor({
  promo,
  token,
  onSaved,
}: {
  promo: PromoCode;
  token: string;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<PromoDraft>({
    purpose: promo.purpose,
    active: promo.active,
    maxRedemptions: promo.maxRedemptions?.toString() ?? "",
    maxRedemptionsPerEmail: String(promo.maxRedemptionsPerEmail),
    expiresAt: dateTimeInput(promo.expiresAt),
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    setSaving(true);
    try {
      await apiPatch(`/promo-codes/${promo.id}`, {
        ...draft,
        maxRedemptions: draft.maxRedemptions || null,
        expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
      }, { headers: { "x-admin-token": token } });
      await onSaved();
      toast({ title: `${promo.code} updated` });
    } catch (error) {
      toast({
        title: "Could not update promo code",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-mono text-lg">{promo.code}</CardTitle>
          <span className={`text-xs font-semibold rounded-full px-2 py-1 ${draft.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
            {draft.active ? "Active" : "Inactive"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            <span className="font-medium">Purpose</span>
            <Input value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} />
          </label>
          <label className="text-sm space-y-1">
            <span className="font-medium">Expiration</span>
            <Input type="datetime-local" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} />
          </label>
          <label className="text-sm space-y-1">
            <span className="font-medium">Total usage limit</span>
            <Input type="number" min="1" placeholder="Unlimited" value={draft.maxRedemptions} onChange={(event) => setDraft({ ...draft, maxRedemptions: event.target.value })} />
          </label>
          <label className="text-sm space-y-1">
            <span className="font-medium">Limit per email</span>
            <Input type="number" min="1" value={draft.maxRedemptionsPerEmail} onChange={(event) => setDraft({ ...draft, maxRedemptionsPerEmail: event.target.value })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
          Accept this code
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {promo.redemptionCount} redemption{promo.redemptionCount === 1 ? "" : "s"}
          </span>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
        {promo.redemptions.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent redemptions</div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {promo.redemptions.map((redemption) => (
                <div key={redemption.id} className="text-xs flex flex-wrap justify-between gap-2 rounded border px-3 py-2">
                  <span>{redemption.email}</span>
                  <span className="text-muted-foreground">Project {redemption.projectId} · {new Date(redemption.redeemedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PromoCodesPage() {
  const token = getAdminToken();
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "",
    purpose: "Free professional solar report",
    maxRedemptions: "",
    maxRedemptionsPerEmail: "1",
    expiresAt: "",
  });
  const { toast } = useToast();

  const loadCodes = async () => {
    if (!token) return;
    setLoading(true);
    try {
      setCodes(await apiGet<PromoCode[]>("/promo-codes", undefined, { headers: { "x-admin-token": token } }));
    } catch (error) {
      toast({
        title: "Could not load promo codes",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCodes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setCreating(true);
    try {
      await apiPost("/promo-codes", {
        ...form,
        maxRedemptions: form.maxRedemptions || null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        active: true,
      }, { headers: { "x-admin-token": token } });
      setForm({ code: "", purpose: "Free professional solar report", maxRedemptions: "", maxRedemptionsPerEmail: "1", expiresAt: "" });
      await loadCodes();
      toast({ title: "Promo code created" });
    } catch (error) {
      toast({
        title: "Could not create promo code",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  if (!token) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto text-center py-16 space-y-4">
          <TicketCheck className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Admin access required</h1>
          <p className="text-muted-foreground">Unlock admin access from Settings before managing promo codes.</p>
          <Link href="/settings"><Button>Open Settings</Button></Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><TicketCheck className="h-7 w-7" /> Promo Codes</h1>
            <p className="text-muted-foreground mt-1">Create and audit server-validated professional report trials.</p>
          </div>
          <Link href="/settings"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Settings</Button></Link>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Create promo code</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Input placeholder="CODE" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} />
            <Input placeholder="Purpose" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
            <Input type="number" min="1" placeholder="Total limit (optional)" value={form.maxRedemptions} onChange={(event) => setForm({ ...form, maxRedemptions: event.target.value })} />
            <Input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
            <Button onClick={create} disabled={creating || form.code.trim().length < 4}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {codes.map((promo) => <PromoEditor key={promo.id} promo={promo} token={token} onSaved={loadCodes} />)}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
