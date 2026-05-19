import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { appEnv } from "@/config/env";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

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
import AdminPurchases from "@/pages/admin-purchases";

const queryClient = new QueryClient();

setBaseUrl(appEnv.routerBase || null);
setAuthTokenGetter(() => sessionStorage.getItem("offgrid.adminToken"));

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/projects" component={ProjectsDashboard} />
      <Route path="/wizard" component={Wizard} />
      <Route path="/proposal" component={QuickProposal} />
      <Route path="/results/:id" component={Results} />
      <Route path="/results/:id/placement" component={PlacementPage} />
      <Route path="/projects/:id/edit" component={EditProject} />
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/admin/purchases" component={AdminPurchases} />
      <Route path="/payment-success" component={PaymentSuccess} />
      <Route path="/payment-cancel" component={PaymentCancel} />
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
