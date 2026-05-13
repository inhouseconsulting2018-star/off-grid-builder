import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Sun, ArrowRight, Zap, ShieldCheck, FileText } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Sun className="h-6 w-6 text-primary" />
          <span>OffGrid Builder</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/projects">
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link href="/wizard">
            <Button>Start Design</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center max-w-7xl w-full mx-auto px-6 py-20 text-center">
        <div className="inline-block py-1 px-3 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
          Professional Solar Design Software
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight">
          Design Your Solar System in <span className="text-primary">Minutes</span>
        </h1>
        <p className="mt-6 text-xl text-muted-foreground max-w-2xl">
          The precision instrument for homeowners and contractors. Calculate off-grid, grid-tied, and hybrid solar requirements with engineering-grade accuracy.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link href="/wizard">
            <Button size="lg" className="h-14 px-8 text-lg w-full sm:w-auto">
              Start Free Solar Design
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <Link href="/projects">
            <Button variant="outline" size="lg" className="h-14 px-8 text-lg w-full sm:w-auto">
              View Sample Report
            </Button>
          </Link>
        </div>

        <div className="mt-24 grid md:grid-cols-3 gap-12 text-left w-full">
          <div className="flex flex-col gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold">Complete System Sizing</h3>
            <p className="text-muted-foreground">
              Calculates precise requirements for solar arrays, inverters, and battery banks based on your specific energy goals and location.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold">Real-World Losses</h3>
            <p className="text-muted-foreground">
              Factors in shade, temperature, wire, and inverter losses to give you realistic production numbers, not best-case scenarios.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold">Professional Reports</h3>
            <p className="text-muted-foreground">
              Generates a clear, trustworthy solar design report in minutes. Perfect for contractors presenting to clients or DIYers planning their build.
            </p>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-muted-foreground text-sm border-t">
        <p>&copy; {new Date().getFullYear()} OffGrid Solar Builder. All rights reserved.</p>
      </footer>
    </div>
  );
}
