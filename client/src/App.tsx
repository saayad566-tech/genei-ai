import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { WebhookToastWatcher } from "./components/WebhookToastWatcher";
import { ThemeProvider } from "./contexts/ThemeContext";
import GeneiLayout from "./components/GeneiLayout";
import Home from "./pages/Home";
import MusicStudio from "./pages/MusicStudio";
import VideoStudio from "./pages/VideoStudio";
import DirectorConsole from "./pages/DirectorConsole";
import ImageGenerator from "./pages/ImageGenerator";
import AppBuilder from "./pages/AppBuilder";
import WebsiteBuilder from "./pages/WebsiteBuilder";
import VoiceLab from "./pages/VoiceLab";
import AutomationCenter from "./pages/AutomationCenter";
import Marketplace from "./pages/Marketplace";
import AssetLibrary from "./pages/AssetLibrary";
import ApiIntegrations from "@/pages/ApiIntegrations";
import ByohDashboard from "@/pages/ByohDashboard";
import ComfyWorkflowStudio from "@/pages/ComfyWorkflowStudio";
import DesktopSetupWizard from "./pages/DesktopSetupWizard";
import ModelLibrary from "./pages/ModelLibrary";
import AIStore from "./pages/AIStore";
import TeamWorkspace from "./pages/TeamWorkspace";
import Monetization from "./pages/Monetization";
import ExportCenter from "./pages/ExportCenter";
import Settings from "./pages/Settings";
import Onboarding, { ONBOARDING_KEY } from "./pages/Onboarding";

function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    // Storage is unavailable, so completion cannot be remembered. Skipping setup is
    // the kinder failure; /onboarding is always reachable to run it deliberately.
    return true;
  }
}

/**
 * First-launch setup. Until the user has been through it once, the setup screen is
 * the whole app; afterwards it is reachable on demand at /onboarding.
 */
function FirstRunGate({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [completed, setCompleted] = useState(hasCompletedOnboarding);

  useEffect(() => {
    setCompleted(hasCompletedOnboarding());
  }, [location]);

  if (!completed && location !== "/onboarding") {
    return <Onboarding />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <GeneiLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/music" component={MusicStudio} />
        <Route path="/video" component={VideoStudio} />
        <Route path="/director" component={DirectorConsole} />
        <Route path="/image" component={ImageGenerator} />
        <Route path="/app-builder" component={AppBuilder} />
        <Route path="/app" component={AppBuilder} />
        <Route path="/website" component={WebsiteBuilder} />
        <Route path="/voice" component={VoiceLab} />
        <Route path="/automation" component={AutomationCenter} />
        <Route path="/marketplace" component={Marketplace} />
        <Route path="/assets" component={AssetLibrary} />
        <Route path="/api" component={ApiIntegrations} />
        <Route path="/byoh" component={ByohDashboard} />
        <Route path="/comfy" component={ComfyWorkflowStudio} />
        <Route path="/setup-wizard" component={DesktopSetupWizard} />
        <Route path="/library" component={ModelLibrary} />
        <Route path="/ai-store" component={AIStore} />
        <Route path="/team" component={TeamWorkspace} />
        <Route path="/monetization" component={Monetization} />
        <Route path="/export" component={ExportCenter} />
        <Route path="/settings" component={Settings} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </GeneiLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster position="bottom-right" theme="dark" />
          <WebhookToastWatcher />
          <FirstRunGate>
            <Router />
          </FirstRunGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
