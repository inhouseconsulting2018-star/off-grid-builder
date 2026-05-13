import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/home";
import NotFound from "@/pages/not-found";
import ProjectsDashboard from "@/pages/projects";
import Wizard from "@/pages/wizard";
import Results from "@/pages/results";
import EditProject from "@/pages/edit-project";
import AIAssistant from "@/pages/ai-assistant";
import SettingsPage from "@/pages/settings";
import QuickProposal from "@/pages/quick-proposal";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/projects" component={ProjectsDashboard} />
      <Route path="/wizard" component={Wizard} />
      <Route path="/proposal" component={QuickProposal} />
      <Route path="/results/:id" component={Results} />
      <Route path="/projects/:id/edit" component={EditProject} />
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
