import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, FileText, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/services/analytics";
import { getPlanWizardHref } from "@/services/checkoutPlans";

export type SeoCalculatorConfig = {
  title: string;
  headline: string;
  description: string;
  canonicalPath: string;
  contractorFocus?: boolean;
};

const MAIN_MESSAGE =
  "Estimate the solar system size, battery bank, inverter size, panel count, production, and cost range for your home, cabin, shop, barn, or off-grid property before calling installers.";

function setMeta(name: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.name = name;
    document.head.appendChild(element);
  }
  element.content = content;
}

export default function SeoCalculatorPage({ config }: { config: SeoCalculatorConfig }) {
  useEffect(() => {
    document.title = config.title;
    setMeta("description", config.description);
    trackEvent("pricing_viewed", { source: config.canonicalPath });

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `https://offgridsolarbuilder.com${config.canonicalPath}`;
  }, [config]);

  const trackStart = () => trackEvent("start_estimate", { source: config.canonicalPath });
  const trackReport = () => trackEvent("start_estimate", { source: config.canonicalPath, offer: "homeowner_report" });
  const trackContractor = () => trackEvent("contractor_beta_clicked", { source: config.canonicalPath });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-col items-stretch gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <Sun className="h-5 w-5 text-primary" />
            OffGrid Solar Builder
          </Link>
          <Link href="/wizard" onClick={trackStart} className="w-full sm:w-auto">
            <Button size="sm" className="w-full sm:w-auto">
              Start Free Solar Estimate
            </Button>
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b bg-slate-950 text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-20">
            <div className="min-w-0">
              <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
                {config.headline}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-200">{config.description}</p>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">{MAIN_MESSAGE}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/wizard" onClick={trackStart}>
                  <Button size="lg" className="w-full sm:w-auto">
                    Start Free Solar Estimate <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href={getPlanWizardHref("homeowner_report")} onClick={trackReport}>
                  <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                    Unlock Full Report for $19
                  </Button>
                </Link>
              </div>
            </div>
            <img
              src="/opengraph.jpg"
              alt="OffGrid Solar Builder estimate and report interface"
              className="w-full border border-white/20 bg-white shadow-2xl"
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold">Plan before calling installers</h2>
              <div className="mt-6 space-y-4">
                {[
                  "Solar array size and estimated panel count",
                  "Battery bank and inverter sizing",
                  "Location-aware production estimate",
                  "Equipment and installed cost ranges",
                  "Paid report with complete BOM and printable PDF",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0 border bg-card p-6">
              <FileText className="h-8 w-8 text-primary" />
              <h2 className="mt-4 text-2xl font-bold">Professional report options</h2>
              <p className="mt-3 text-muted-foreground">
                Start with a free range-based preview. Unlock the complete project report for $19, including detailed sizing, equipment, cost assumptions, and PDF download.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Link href={getPlanWizardHref("homeowner_report")} onClick={trackReport}>
                  <Button className="w-full">Unlock Full Report for $19</Button>
                </Link>
                {config.contractorFocus && (
                  <Link href={getPlanWizardHref("contractor_lifetime_beta")} onClick={trackContractor}>
                    <Button variant="outline" className="h-auto w-full whitespace-normal py-2">
                      Get Founding Contractor Beta Access for $199
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground">
            Preliminary planning estimate only. Final design should be verified by a licensed solar/electrical professional. Estimates are not permit-ready engineering plans.
          </div>
        </section>
      </main>
    </div>
  );
}
