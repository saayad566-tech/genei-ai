import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import CommandPalette from "@/components/CommandPalette";
import { OfflineBanner, SlowNetworkNote } from "@/components/PlatformChrome";
import { installBackNavigation } from "@/lib/backnav";
import { focusMainContent } from "@/lib/a11y";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { WebhookToastWatcher } from "./components/WebhookToastWatcher";
import { ThemeProvider } from "./contexts/ThemeContext";
import GeneiLayout from "./components/GeneiLayout";
import Home from "./pages/Home";
const MusicStudio = lazy(() => import("./pages/MusicStudio"));
const VideoStudio = lazy(() => import("./pages/VideoStudio"));
const DirectorConsole = lazy(() => import("./pages/DirectorConsole"));
const ImageGenerator = lazy(() => import("./pages/ImageGenerator"));
const AppBuilder = lazy(() => import("./pages/AppBuilder"));
const WebsiteBuilder = lazy(() => import("./pages/WebsiteBuilder"));
const VoiceLab = lazy(() => import("./pages/VoiceLab"));
const AutomationCenter = lazy(() => import("./pages/AutomationCenter"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const AssetLibrary = lazy(() => import("./pages/AssetLibrary"));
import ApiIntegrations from "@/pages/ApiIntegrations";
import AvatarVideo from "@/pages/AvatarVideo";
import ByohDashboard from "@/pages/ByohDashboard";
import ComfyWorkflowStudio from "@/pages/ComfyWorkflowStudio";
const DesktopSetupWizard = lazy(() => import("./pages/DesktopSetupWizard"));
const ModelLibrary = lazy(() => import("./pages/ModelLibrary"));
const AIStore = lazy(() => import("./pages/AIStore"));
const TeamWorkspace = lazy(() => import("./pages/TeamWorkspace"));
const Monetization = lazy(() => import("./pages/Monetization"));
const ExportCenter = lazy(() => import("./pages/ExportCenter"));
const Settings = lazy(() => import("./pages/Settings"));
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
      {/* Route-level code splitting: only the page being visited is loaded, so the shell,
          sidebar and topbar paint immediately instead of waiting for every page's code. */}
      <Suspense
        fallback={
          <div className="flex h-[60vh] items-center justify-center" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
              Loading…
            </div>
          </div>
        }
      >
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
        <Route path="/avatar-video" component={AvatarVideo} />
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
      </Suspense>
    </GeneiLayout>
  );
}

function App() {
  // On Android the system back gesture is the primary way out of anything, so overlays
  // must close on it rather than the gesture leaving the app.
  useEffect(() => installBackNavigation(), []);
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster position="bottom-right" theme="dark" />
          <WebhookToastWatcher />
          {/* Ctrl/Cmd+K — reaches every page and the system state without the mouse. */}
          <CommandPalette />
          {/* Connectivity, stated but never used to block an action. */}
          <OfflineBanner />
          <SlowNetworkNote />
          <FirstRunGate>
            <Router />
          </FirstRunGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
