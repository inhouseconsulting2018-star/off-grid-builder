import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Sun,
  ArrowRight,
  Zap,
  ShieldCheck,
  FileText,
  MapPin,
  Battery,
  TrendingDown,
  CheckCircle2,
  Clock,
  Star,
} from "lucide-react";
import { useEffect } from "react";
import { trackEvent } from "@/services/analytics";

export default function Home() {
  useEffect(() => {
    trackEvent("pricing_viewed", { source: window.location.pathname });
  }, []);

  const trackStart = () => trackEvent("start_estimate", { source: window.location.pathname });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-5 py-4 flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Sun className="h-6 w-6 text-primary" />
          <span>OffGrid Solar Builder</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/wizard" onClick={trackStart}>
            <Button size="sm">Get My Solar Report</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center max-w-6xl w-full mx-auto px-5">

        {/* Hero */}
        <div className="py-16 sm:py-24 text-center max-w-3xl">
          <div className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 tracking-wide uppercase">
            <Clock className="h-3 w-3" /> Takes about 3 minutes
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08]">
            Know Exactly What Solar{" "}
            <span className="text-primary">Your Home Needs</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Answer a few questions about your home and we'll calculate the exact panels, battery bank, and inverter you need — with a professional report you can hand straight to a contractor.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/wizard" onClick={trackStart}>
              <Button size="lg" className="h-12 px-8 text-base w-full sm:w-auto">
                Start Free Solar Design
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No account required. Free design, detailed report available to download.</p>
        </div>

        {/* What's in the report */}
        <div className="w-full pb-16 sm:pb-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">What you get in your report</h2>
            <p className="mt-2 text-muted-foreground">A full engineering-grade design — not a rough estimate</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              "Exact panel count and array wattage for your location",
              "Battery bank sizing for 12, 24, 48, or 72-hour backup",
              "Inverter and charge controller specifications",
              "Full bill of materials with brands and price ranges",
              "Real-world loss modeling (shade, temperature, wiring)",
              "NEC 690 code notes for your contractor",
              "Interactive map showing your system placement",
              "Estimated annual savings and payback period",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 p-4 rounded-lg border bg-card">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span className="text-sm leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div id="pricing" className="w-full pb-16 sm:pb-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">Paid report pricing</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ["Homeowner Full Report", "$19", "one-time", "1 full report credit"],
              ["Property Pack", "$39", "one-time", "3 full report credits"],
              ["Contractor Annual", "$149/year", "subscription", "Contractor access + 50 credits"],
              ["Contractor Lifetime Beta", "$199", "one-time", "Contractor access + 100 credits"],
            ].map(([name, price, cadence, detail]) => (
              <div key={name} className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold">{name}</h3>
                <div className="mt-3 text-3xl font-extrabold text-primary">{price}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mt-1">{cadence}</div>
                <p className="text-sm text-muted-foreground mt-4">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="w-full pb-16 sm:pb-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">How it works</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                title: "Describe your home",
                desc: "Enter your address, monthly electric bill, and what you want to power. Takes about 2 minutes.",
              },
              {
                step: "2",
                title: "We run the numbers",
                desc: "Our engine pulls your local sun data and calculates a complete system sized to your actual needs.",
              },
              {
                step: "3",
                title: "Get your report",
                desc: "Download a professional PDF with your full parts list, specs, and cost breakdown — ready to share with contractors.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col gap-3 p-6 rounded-xl border bg-card text-center">
                <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center mx-auto">
                  {step}
                </div>
                <h3 className="font-semibold text-base">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features Grid */}
        <div className="pb-16 sm:pb-20 w-full">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">Built for accuracy, not guesswork</h2>
            <p className="mt-2 text-muted-foreground">The same calculations solar installers use, available to homeowners</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {[
              {
                icon: Zap,
                title: "Complete System Sizing",
                desc: "Precisely calculates array size, inverter rating, and battery bank based on your usage, location, and goals.",
              },
              {
                icon: TrendingDown,
                title: "Real-World Loss Modeling",
                desc: "Accounts for shade, temperature, wire resistance, and inverter losses for realistic production numbers.",
              },
              {
                icon: FileText,
                title: "Professional BOM Report",
                desc: "Generates a full bill of materials with brands, quantities, and price ranges — ready for contractor review.",
              },
              {
                icon: MapPin,
                title: "Location-Aware Design",
                desc: "Uses your address to pull accurate peak sun hours and show your project on an interactive map.",
              },
              {
                icon: Battery,
                title: "Battery Backup Sizing",
                desc: "Design battery banks for 12, 24, 48, or 72-hour backup, with LiFePO4 cycle life recommendations.",
              },
              {
                icon: ShieldCheck,
                title: "Code-Referenced Notes",
                desc: "Design notes reference NEC 690 and AHJ requirements so your contractor knows what to verify.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col gap-3 p-5 rounded-xl border bg-card hover:shadow-sm transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Who it's for */}
        <div className="w-full pb-16 sm:pb-20">
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">For homeowners going solar</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Stop relying on installer quotes you can't verify. Know exactly what system you need before anyone sets foot on your roof — so you can compare bids confidently.
              </p>
            </div>
            <div className="p-6 rounded-xl border bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">For off-grid and backup power</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Building a cabin, RV setup, or whole-home battery backup? Get a parts list sized to your actual loads, not a generic kit that leaves you short.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="w-full mb-16 rounded-2xl bg-primary/10 border border-primary/20 p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to see what solar costs for your home?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">Start free. Takes 3 minutes. Get a professional report you can actually use.</p>
          <Link href="/wizard" onClick={trackStart}>
            <Button size="lg" className="h-12 px-10 text-base">
              Start My Free Solar Design <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">No account required</p>
        </div>
      </main>

      <footer className="py-6 text-center text-muted-foreground text-sm border-t">
        <p>&copy; {new Date().getFullYear()} OffGrid Solar Builder. All rights reserved.</p>
      </footer>
    </div>
  );
}
