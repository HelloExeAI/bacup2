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
    /**
     * iOS 18+ groups header bar items in a shared “glass” / light capsule behind custom `headerRight` views.
     * Opt out so a green save chip is not wrapped in an extra white disk (requires a dev / production build, not Expo Go).
     * @see https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility
     */
    infoPlist: {
      UIDesignRequiresCompatibility: true,
      // Required for expo-location on iOS (otherwise it crashes at runtime).
      NSLocationWhenInUseUsageDescription: "Allow Bacup to use your location to fill your city and country.",
      // Some iOS versions / tooling still reference the legacy key in error messages.
      NSLocationUsageDescription: "Allow Bacup to use your location to fill your city and country.",
    },
  },
  android: {
    package: "ai.bacup.app",
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#e6f6fb",
    },
  },
  plugins: [
    "expo-router",
    "@react-native-community/datetimepicker",
    "expo-speech-recognition",
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Allow Bacup to use your location to fill your city and country.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow Bacup to access your photos to set a profile picture.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    appUrl: process.env.EXPO_PUBLIC_APP_URL ?? "",
    googleOAuthClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? "",
    microsoftOAuthClientId: process.env.EXPO_PUBLIC_MICROSOFT_OAUTH_CLIENT_ID ?? "",
    microsoftTenantId: process.env.EXPO_PUBLIC_MICROSOFT_TENANT_ID ?? "common",
  },
};

export default config;
