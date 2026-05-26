import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileText, ArrowRight } from "lucide-react";
import { Link, useSearch } from "wouter";

export default function PaymentSuccess() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId");
  const accessToken = params.get("accessToken");

  // Persist the token in sessionStorage so the results page can pick it up
  // even if the user navigates without it in the URL.
  useEffect(() => {
    if (projectId && accessToken) {
      try {
        sessionStorage.setItem(`project-token-${projectId}`, accessToken);
      } catch {
        // ignore — private browsing may block sessionStorage
      }
    }
  }, [projectId, accessToken]);

  // Build the results URL — always include accessToken so the page can load
  // the project without relying solely on sessionStorage (handles fresh tabs).
  const resultsHref = projectId
    ? `/results/${projectId}${accessToken ? `?accessToken=${encodeURIComponent(accessToken)}` : ""}`
    : null;

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
            Your solar report is now fully unlocked. You can download the full
            PDF and view the complete equipment bill of materials.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {resultsHref && (
            <Link href={resultsHref}>
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                <FileText className="h-4 w-4" />
                View Full Report
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
