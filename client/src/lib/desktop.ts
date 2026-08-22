export type DesktopCapabilityStatus =
  | "ready"
  | "browser-preview"
  | "bundled-sidecar-missing"
  | "probe-timeout"
  | "probe-error";

export type DesktopHardwareProfile = {
  source?: string;
  status?: DesktopCapabilityStatus;
  message?: string;
  system?: string;
  release?: string;
  machine?: string;
  processor?: string;
  python_version?: string;
  disk_free_gb?: number;
  memory_total_gb?: number | null;
  memory_available_gb?: number | null;
  cpu_count?: number | null;
  gpu_count?: number;
  gpus?: Array<{ name: string; vram_mb: number | null; backend?: string }>;
  accelerators?: string[];
  runtimes?: Record<string, boolean>;
  recommended_models?: string[];
};

export type DesktopStatus = {
  product: string;
  packaged: boolean;
  platform: string;
  arch: string;
  serverPort?: number;
  hardware: DesktopHardwareProfile | null;
  dataDirectory?: string;
};

type DesktopBridge = {
  isDesktop: true;
  getStatus: () => Promise<DesktopStatus>;
  refreshHardware: () => Promise<DesktopHardwareProfile>;
};

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { geneiDesktop?: DesktopBridge }).geneiDesktop;
  return bridge?.isDesktop ? bridge : null;
}

export async function readDesktopStatus(): Promise<DesktopStatus> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return {
      product: "Genei AI Desktop",
      packaged: false,
      platform: "browser-preview",
      arch: "unknown",
      hardware: {
        source: "browser-preview",
        status: "browser-preview",
        message: "Hardware detection runs inside the installed desktop application. This browser preview does not claim local hardware access.",
      },
    };
  }
  return bridge.getStatus();
}
