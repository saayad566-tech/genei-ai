import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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
import ApiIntegrations from "./pages/ApiIntegrations";
import TeamWorkspace from "./pages/TeamWorkspace";
import Monetization from "./pages/Monetization";
import ExportCenter from "./pages/ExportCenter";
import Settings from "./pages/Settings";

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
        <Route path="/team" component={TeamWorkspace} />
        <Route path="/monetization" component={Monetization} />
        <Route path="/export" component={ExportCenter} />
        <Route path="/settings" component={Settings} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
