import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Music, Video, Image, Smartphone, Globe, Mic, Zap,
  ShoppingBag, Archive, Key, Users, DollarSign, Download,
  Settings, Plus, Clock, Bot, LayoutTemplate, Upload,
  Cloud, Palette, BarChart3, CreditCard, ChevronLeft,
  ChevronRight, Bell, Search, Menu, X, Sparkles, LogOut,
  Cpu, ChevronDown, Activity, Monitor
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AIChatPanel } from "./AIChatPanel";
import { InstallPwaButton } from "./InstallPwaButton";
import AppNotificationCenter from "./AppNotificationCenter";

const mainNavItems = [
  { id: "home", label: "Home", icon: Home, path: "/" },
  { id: "music", label: "Music Studio", icon: Music, path: "/music", badge: "AI", badgeColor: "purple" },
  { id: "video", label: "Video Studio", icon: Video, path: "/video", badge: "AI", badgeColor: "pink" },
  { id: "director", label: "Director Console", icon: Activity, path: "/director", badge: "LIVE", badgeColor: "purple" },
  { id: "image", label: "Image Generator", icon: Image, path: "/image", badge: "AI", badgeColor: "cyan" },
  { id: "app", label: "App Builder", icon: Smartphone, path: "/app" },
  { id: "website", label: "Website Builder", icon: Globe, path: "/website" },
  { id: "voice", label: "Voice Lab", icon: Mic, path: "/voice", badge: "AI", badgeColor: "purple" },
  { id: "automation", label: "Automation", icon: Zap, path: "/automation" },
  { id: "marketplace", label: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
  { id: "assets", label: "Asset Library", icon: Archive, path: "/assets" },
  { id: "api", label: "API Integrations", icon: Key, path: "/api" },
  { id: "byoh", label: "BYOH Runners", icon: Monitor, path: "/byoh", badge: "HARDWARE", badgeColor: "cyan" },
  { id: "team", label: "Team Workspace", icon: Users, path: "/team" },
  { id: "monetization", label: "Monetization", icon: DollarSign, path: "/monetization" },
  { id: "export", label: "Export Center", icon: Download, path: "/export" },
  { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
];

const sidebarPanelItems = [
  { id: "create", label: "Create New", icon: Plus },
  { id: "recent", label: "Recent Projects", icon: Clock },
  { id: "assistant", label: "AI Assistant", icon: Bot },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "uploads", label: "Uploads", icon: Upload },
  { id: "storage", label: "Cloud Storage", icon: Cloud },
  { id: "brand", label: "Brand Kit", icon: Palette },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "subscription", label: "Subscription", icon: CreditCard },
];

const badgeColors: Record<string, string> = {
  purple: "genei-badge-purple",
  pink: "genei-badge-pink",
  cyan: "genei-badge-cyan",
  gold: "genei-badge-gold",
};

interface GeneiLayoutProps {
  children: React.ReactNode;
}

export default function GeneiLayout({ children }: GeneiLayoutProps) {
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location]);

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-sidebar-border ${sidebarCollapsed ? "justify-center" : ""}`}>
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))", boxShadow: "0 0 20px oklch(0.65 0.22 285 / 0.5)" }}>
            <Cpu className="w-5 h-5 text-white" />
          </div>
        </div>
        {!sidebarCollapsed && (
          <div>
            <span className="font-orbitron font-bold text-lg tracking-wider genei-gradient-text">GENEI</span>
            <span className="font-orbitron font-bold text-lg tracking-wider text-foreground"> AI</span>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Creator Ecosystem</div>
          </div>
        )}
      </div>

      {/* Main Nav */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {!sidebarCollapsed && (
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
            Studios
          </div>
        )}
        {mainNavItems.slice(0, 10).map((item) => (
          <NavItem key={item.id} item={item} collapsed={sidebarCollapsed} active={isActive(item.path)} />
        ))}

        {!sidebarCollapsed && (
          <div className="px-3 py-1.5 mt-2 text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
            Platform
          </div>
        )}
        {mainNavItems.slice(10).map((item) => (
          <NavItem key={item.id} item={item} collapsed={sidebarCollapsed} active={isActive(item.path)} />
        ))}

        {!sidebarCollapsed && (
          <div className="px-3 py-1.5 mt-2 text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
            Tools
          </div>
        )}
        {sidebarPanelItems.map((item) => (
          <PanelItem
            key={item.id}
            item={item}
            collapsed={sidebarCollapsed}
            onChatOpen={() => setChatOpen(true)}
          />
        ))}
      </div>

      {/* User Profile */}
      <div className={`border-t border-sidebar-border p-3 ${sidebarCollapsed ? "flex justify-center" : ""}`}>
        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-3 w-full rounded-lg p-2 hover:bg-sidebar-accent transition-colors duration-150 ${sidebarCollapsed ? "justify-center" : ""}`}>
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarFallback className="text-xs font-bold" style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }}>
                    {(user.name || user.email || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {!sidebarCollapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-sm font-medium text-foreground truncate">{user.name || "Creator"}</div>
                      <div className="text-xs text-muted-foreground truncate">{user.email || "Pro Plan"}</div>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="w-4 h-4 mr-2" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <a href={getLoginUrl()} className={`flex min-h-11 items-center gap-3 rounded-lg p-2 genei-btn-primary text-sm ${sidebarCollapsed ? "justify-center" : ""}`} aria-label="Sign in to Genei AI">
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            {!sidebarCollapsed && <span>Sign In</span>}
          </a>
        )}
      </div>

      {/* Collapse Toggle (desktop only) */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border border-border bg-card items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-200 z-10"
      >
        {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: sidebarCollapsed ? 64 : 240 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="hidden lg:flex flex-col relative flex-shrink-0 border-r border-sidebar-border"
        style={{ background: "var(--sidebar)" }}
      >
        <SidebarContent />
      </motion.aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="fixed left-0 top-0 bottom-0 w-64 z-50 lg:hidden border-r border-sidebar-border"
              style={{ background: "var(--sidebar)" }}
            >
              <div className="absolute top-4 right-4">
                <button onClick={() => setMobileSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex min-w-0 min-h-0 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex min-h-16 items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4"
          style={{ background: "oklch(0.09 0.012 265 / 0.95)", backdropFilter: "blur(12px)" }}>
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden min-h-11 min-w-11 p-2 rounded-lg hover:bg-secondary text-muted-foreground inline-flex items-center justify-center"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search projects, assets, tools..."
                className="w-full min-h-11 bg-secondary/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <InstallPwaButton />

            {/* AI Assistant Button */}
            <button
              onClick={() => setChatOpen(true)}
              className="flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: "linear-gradient(135deg, oklch(0.65 0.22 285 / 0.2), oklch(0.60 0.25 310 / 0.2))",
                border: "1px solid oklch(0.65 0.22 285 / 0.3)",
                color: "oklch(0.80 0.18 285)"
              }}
            >
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">AI Assistant</span>
            </button>

            {/* Notifications */}
            <AppNotificationCenter />

            {/* Create Button */}
            <Link href="/image">
              <button className="genei-btn-primary min-h-11 flex items-center gap-2 text-sm" aria-label="Create a new image">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Create</span>
              </button>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* AI Chat Panel */}
      <AIChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

function NavItem({ item, collapsed, active }: { item: typeof mainNavItems[0]; collapsed: boolean; active: boolean }) {
  return (
    <Link href={item.path}>
      <motion.div
        whileTap={{ scale: 0.97 }}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 group relative ${
          active
            ? "text-foreground"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        } ${collapsed ? "justify-center" : ""}`}
        style={active ? {
          background: "linear-gradient(135deg, oklch(0.65 0.22 285 / 0.2), oklch(0.60 0.25 310 / 0.1))",
          border: "1px solid oklch(0.65 0.22 285 / 0.25)",
        } : {}}
      >
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
            style={{ background: "linear-gradient(to bottom, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }} />
        )}
        <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-primary" : ""}`} />
        {!collapsed && (
          <>
            <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
            {item.badge && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColors[item.badgeColor || "purple"]}`}>
                {item.badge}
              </span>
            )}
          </>
        )}
        {collapsed && item.badge && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.65 0.22 285)" }} />
        )}
      </motion.div>
    </Link>
  );
}

function PanelItem({ item, collapsed, onChatOpen }: { item: typeof sidebarPanelItems[0]; collapsed: boolean; onChatOpen: () => void }) {
  const [, navigate] = useLocation();

  const handleClick = () => {
    if (item.id === "assistant") {
      onChatOpen();
    } else if (item.id === "assets" || item.id === "storage") {
      navigate("/assets");
    } else if (item.id === "analytics") {
      navigate("/monetization");
    } else if (item.id === "subscription") {
      navigate("/monetization");
    } else if (item.id === "create") {
      navigate("/image");
    } else if (item.id === "recent") {
      navigate("/assets");
    } else if (item.id === "templates") {
      navigate("/marketplace");
    } else if (item.id === "brand") {
      navigate("/settings");
    } else if (item.id === "uploads") {
      navigate("/assets");
    }
  };

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={handleClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent ${collapsed ? "justify-center" : ""}`}
    >
      <item.icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span className="text-sm truncate">{item.label}</span>}
    </motion.div>
  );
}
