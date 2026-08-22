import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ai.genei.creator",
  appName: "Genei AI",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: {
    // The APK keeps a bundled UI for launch resilience and can use the hosted
    // Genei origin for authenticated tRPC/API calls when a network is present.
    url: process.env.GENEI_ANDROID_SERVER_URL || "https://genieai-tc7qfq5i.manus.space",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
