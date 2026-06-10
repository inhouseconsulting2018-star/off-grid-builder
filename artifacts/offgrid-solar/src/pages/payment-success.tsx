import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, FileText, ArrowRight, Loader2 } from "lucide-react";
import { Link, useSearch } from "wouter";
import { trackEvent } from "@/services/analytics";
import { apiGet } from "@/services/apiService";
import { addProjectToRegistry } from "@/services/projectRegistry";
import { appEnv } from "@/config/env";

type EntitlementStatus = "checking" | "unlocked" | "delayed";

function hasActiveEntitlement(project: {
  paidAt?: string | Date | null;
  selectedPlan?: string | null;
  paymentStatus?: string | null;
}): boolean {
  if (!project.paidAt) return false;
  if (project.selectedPlan !== "contractor_annual") return project.paymentStatus === "paid";
  return ["paid", "active", "trialing"].includes(project.paymentStatus ?? "");
}

export default function PaymentSuccess() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId");
  const accessToken = params.get("accessToken");
  const [entitlementStatus, setEntitlementStatus] = useState<EntitlementStatus>("checking");

  // Persist the token + register the project so the dashboard and results
  // page can reopen this paid project later on this device.
  useEffect(() => {
    if (projectId && accessToken) {
      const numericId = Number(projectId);
      if (Number.isFinite(numericId)) {
        addProjectToRegistry({ id: numericId, accessToken });
      }
      trackEvent("purchase_completed", { projectId: numericId || projectId });
    }
  }, [projectId, accessToken]);

  useEffect(() => {
    if (!projectId || !accessToken) {
      setEntitlementStatus("delayed");
      return;
    }

    let cancelled = false;
    const checkEntitlement = async () => {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
        try {
          const project = await apiGet<{
            paidAt?: string | Date | null;
            selectedPlan?: string | null;
            paymentStatus?: string | null;
            name?: string;
          }>(
            `/projects/${projectId}`,
            undefined,
            { headers: { "x-access-token": accessToken } },
          );
          if (hasActiveEntitlement(project)) {
            addProjectToRegistry({
              id: Number(projectId),
              accessToken,
              name: project.name,
            });
            setEntitlementStatus("unlocked");
            return;
          }
        } catch {
          // Stripe can redirect before the webhook update is visible. Retry briefly.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
      if (!cancelled) setEntitlementStatus("delayed");
    };

    void checkEntitlement();
    return () => { cancelled = true; };
  }, [projectId, accessToken]);

  // Build the results URL — always include accessToken so the page can load
  // the project without relying solely on sessionStorage (handles fresh tabs).
  const resultsHref = projectId
    ? `/results/${projectId}${accessToken ? `?accessToken=${encodeURIComponent(accessToken)}` : ""}`
    : null;
  const pdfHref = projectId && accessToken
    ? `${appEnv.apiBaseUrl}/projects/${projectId}/report.pdf?accessToken=${encodeURIComponent(accessToken)}`
    : null;

  useEffect(() => {
    if (entitlementStatus !== "unlocked" || !pdfHref) return;
    const timeout = window.setTimeout(() => {
      window.location.replace(pdfHref);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [entitlementStatus, pdfHref]);

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto text-center py-20 flex flex-col items-center gap-6">
        <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-950">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            Payment Successful!
          </h1>
          <p className="text-muted-foreground text-base">
            {entitlementStatus === "unlocked"
              ? "Your solar report is fully unlocked. Opening the detailed PDF now."
              : entitlementStatus === "checking"
              ? "Payment received. We are finishing your report unlock now."
              : "Payment received. Stripe is still confirming the report unlock; open the report and refresh in a moment if it remains locked."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {entitlementStatus === "checking" && (
            <Button size="lg" disabled className="gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Unlocking Report
            </Button>
          )}
          {entitlementStatus === "unlocked" && pdfHref && (
            <Button size="lg" className="gap-2" onClick={() => {
              trackEvent("pdf_downloaded", { projectId: Number(projectId) || projectId });
              window.location.href = pdfHref;
            }}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          )}
          {resultsHref && (
            <Link href={resultsHref}>
              <Button size="lg" variant={entitlementStatus === "unlocked" ? "outline" : "default"} className="gap-2 w-full sm:w-auto">
                <FileText className="h-4 w-4" />
                {entitlementStatus === "unlocked" ? "View Full Report" : "Open Report"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
          <Link href="/projects">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              All Projects
            </Button>
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
