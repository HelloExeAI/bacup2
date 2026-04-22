import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MissingEnvScreen } from "@/components/MissingEnvScreen";
import { AuthProvider } from "@/context/AuthContext";
import { PreferencesProvider } from "@/context/PreferencesContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { readSupabaseEnv } from "@/lib/env";

export default function RootLayout() {
  const { isConfigured } = readSupabaseEnv();

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {!isConfigured ? (
          <MissingEnvScreen />
        ) : (
          <AuthProvider>
            <PreferencesProvider>
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false }} />
            </PreferencesProvider>
          </AuthProvider>
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
