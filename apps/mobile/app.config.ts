import fs from "node:fs";
import path from "node:path";

import { config as loadDotenv } from "dotenv";
import type { ExpoConfig } from "expo/config";

function loadMobileEnv() {
  const candidates = [path.join(process.cwd(), ".env"), path.join(process.cwd(), "apps/mobile/.env")];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      loadDotenv({ path: p });
      return;
    }
  }
}

loadMobileEnv();

const config: ExpoConfig = {
  name: "Bacup",
  slug: "bacup",
  scheme: "bacup",
  version: "1.0.0",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/icon.png",
    resizeMode: "contain",
    backgroundColor: "#e6f6fb",
  },
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "ai.bacup.app",
    icon: "./assets/icon.png",
  },
  android: {
    package: "ai.bacup.app",
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#e6f6fb",
    },
  },
  plugins: ["expo-router", "@react-native-community/datetimepicker", "expo-speech-recognition"],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    appUrl: process.env.EXPO_PUBLIC_APP_URL ?? "",
  },
};

export default config;
