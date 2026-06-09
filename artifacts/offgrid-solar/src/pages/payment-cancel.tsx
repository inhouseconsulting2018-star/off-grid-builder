import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft } from "lucide-react";
import { Link, useSearch } from "wouter";
import { parseCheckoutPlan } from "@/services/checkoutPlans";

export default function PaymentCancel() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId");
  const accessToken = params.get("accessToken");
  const selectedPlan = parseCheckoutPlan(params.get("selectedPlan"));
  const resultsParams = new URLSearchParams({
    ...(accessToken ? { accessToken } : {}),
    ...(selectedPlan ? { selectedPlan } : {}),
  });
  const resultsHref = projectId
    ? `/results/${projectId}${resultsParams.size ? `?${resultsParams.toString()}` : ""}`
    : null;

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto text-center py-20 flex flex-col items-center gap-6">
        <div className="flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-950">
          <XCircle className="h-10 w-10 text-amber-600" />
        </div>

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            Payment Cancelled
          </h1>
          <p className="text-muted-foreground text-base">
            No charge was made. Your project is saved and you can unlock the
            full report whenever you're ready.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {resultsHref && (
            <Link href={resultsHref}>
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4" />
                Back to Report
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
