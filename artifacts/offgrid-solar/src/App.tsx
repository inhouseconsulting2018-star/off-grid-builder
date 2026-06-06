import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { appEnv } from "@/config/env";

import Home from "@/pages/home";
import NotFound from "@/pages/not-found";
import ProjectsDashboard from "@/pages/projects";
import Wizard from "@/pages/wizard";
import Results from "@/pages/results";
import PlacementPage from "@/pages/placement";
import EditProject from "@/pages/edit-project";
import AIAssistant from "@/pages/ai-assistant";
import SettingsPage from "@/pages/settings";
import QuickProposal from "@/pages/quick-proposal";
import PaymentSuccess from "@/pages/payment-success";
import PaymentCancel from "@/pages/payment-cancel";
import PurchasesPage from "@/pages/purchases";
import SeoCalculatorPage, { type SeoCalculatorConfig } from "@/pages/seo-calculator";

const queryClient = new QueryClient();

const seoPages: Record<string, SeoCalculatorConfig> = {
  "/off-grid-solar-calculator": {
    title: "Off-Grid Solar Calculator | OffGrid Solar Builder",
    headline: "Off-Grid Solar System Calculator",
    description: "Estimate solar panels, battery storage, inverter size, production, and cost ranges for an off-grid property.",
    canonicalPath: "/off-grid-solar-calculator",
  },
  "/solar-sizing-calculator": {
    title: "Solar Sizing Calculator | OffGrid Solar Builder",
    headline: "Solar Sizing Calculator",
    description: "Size a practical solar array, panel count, inverter, and battery system from your location and annual energy use.",
    canonicalPath: "/solar-sizing-calculator",
  },
  "/cabin-solar-calculator": {
    title: "Cabin Solar Calculator | OffGrid Solar Builder",
    headline: "Cabin Solar System Calculator",
    description: "Estimate an off-grid solar and battery system for a cabin using your loads, backup goals, and site location.",
    canonicalPath: "/cabin-solar-calculator",
  },
  "/barn-solar-calculator": {
    title: "Barn Solar Calculator | OffGrid Solar Builder",
    headline: "Barn Solar System Calculator",
    description: "Estimate solar production, panels, inverter capacity, batteries, and cost ranges for a barn or agricultural property.",
    canonicalPath: "/barn-solar-calculator",
  },
  "/shop-solar-calculator": {
    title: "Shop Solar Calculator | OffGrid Solar Builder",
    headline: "Shop Solar System Calculator",
    description: "Plan solar and battery capacity for a workshop, detached garage, or commercial shop before requesting installer bids.",
    canonicalPath: "/shop-solar-calculator",
  },
  "/solar-battery-bank-calculator": {
    title: "Solar Battery Bank Calculator | OffGrid Solar Builder",
    headline: "Solar Battery Bank Calculator",
    description: "Estimate usable battery capacity, total bank size, inverter capacity, and solar production for backup or off-grid operation.",
    canonicalPath: "/solar-battery-bank-calculator",
  },
  "/contractor-solar-estimating-tool": {
    title: "Contractor Solar Estimating Tool | OffGrid Solar Builder",
    headline: "Solar Estimating Tool for Contractors",
    description: "Create consistent preliminary solar sizing, production, battery, equipment, and cost-range estimates for customer properties.",
    canonicalPath: "/contractor-solar-estimating-tool",
    contractorFocus: true,
  },
};

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pricing" component={Home} />
      {Object.entries(seoPages).map(([path, config]) => (
        <Route key={path} path={path}>
          <SeoCalculatorPage config={config} />
        </Route>
      ))}
      <Route path="/projects" component={ProjectsDashboard} />
      <Route path="/wizard" component={Wizard} />
      <Route path="/proposal" component={QuickProposal} />
      <Route path="/results/:id" component={Results} />
      <Route path="/results/:id/placement" component={PlacementPage} />
      <Route path="/projects/:id/edit" component={EditProject} />
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/admin/settings" component={SettingsPage} />
      <Route path="/payment-success" component={PaymentSuccess} />
      <Route path="/payment-cancel" component={PaymentCancel} />
      <Route path="/purchases" component={PurchasesPage} />
      <Route path="/admin/purchases" component={PurchasesPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={appEnv.routerBase}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
