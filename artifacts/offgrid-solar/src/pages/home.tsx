import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Sun, ArrowRight, Zap, ShieldCheck, FileText, MapPin, Battery, TrendingDown } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-5 py-4 flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Sun className="h-6 w-6 text-primary" />
          <span>OffGrid Builder</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/projects">
            <Button variant="ghost" size="sm">My Projects</Button>
          </Link>
          <Link href="/wizard">
            <Button size="sm">Start Design</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center max-w-6xl w-full mx-auto px-5">
        {/* Hero */}
        <div className="py-16 sm:py-24 text-center max-w-3xl">
          <div className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 tracking-wide uppercase">
            Professional Solar Design Software
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08]">
            Know what solar setup your property needs before you spend thousands.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Start with a free solar preview, then unlock a contractor-grade report only when the numbers are worth seeing.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/wizard">
              <Button size="lg" className="h-12 px-8 text-base w-full sm:w-auto">
                Start Free Design
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/projects">
              <Button variant="outline" size="lg" className="h-12 px-8 text-base w-full sm:w-auto">
                View Sample Report
              </Button>
            </Link>
          </div>
        </div>

        <section className="w-full pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-[1fr_1.5fr] gap-8 items-start">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight">Simple launch pricing</h2>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Fast solar sizing reports for contractors without another expensive monthly bill.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ["Free Preview", "$0", "System size range, panel count range, production range, rough cost range, and basic system recommendation."],
                ["Homeowner Report", "$19", "One full report for one project with monthly production, battery and inverter sizing, BOM, losses, and PDF."],
                ["Property Pack", "$39", "Three full report credits tied to guest project access for homeowners comparing multiple properties."],
                ["Contractor Annual", "$149/year", "50 full report credits, unlimited previews, saved customer projects, PDF exports, and contractor report mode."],
                ["Contractor Lifetime Beta", "$199", "Founding Contractor Plan — pay once during beta and keep access to the core calculator."],
              ].map(([title, price, desc]) => (
                <div key={title} className="rounded-lg border bg-card p-5">
                  <div className="text-sm font-semibold text-muted-foreground">{title}</div>
                  <div className="mt-2 text-3xl font-black">{price}</div>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <div className="pb-16 sm:pb-24 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
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

        {/* CTA Banner */}
        <div className="w-full mb-16 rounded-2xl bg-primary/10 border border-primary/20 p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to size your system?</h2>
          <p className="text-muted-foreground mb-6">Takes about 3 minutes. No account required.</p>
          <Link href="/wizard">
            <Button size="lg" className="h-12 px-10 text-base">
              Start Free Solar Design <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </main>

      <footer className="py-6 text-center text-muted-foreground text-sm border-t">
        <p>&copy; {new Date().getFullYear()} OffGrid Solar Builder. All rights reserved.</p>
      </footer>
    </div>
  );
}
