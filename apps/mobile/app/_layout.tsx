import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MissingEnvScreen } from "@/components/MissingEnvScreen";
import { AuthProvider } from "@/context/AuthContext";
import { PreferencesProvider } from "@/context/PreferencesContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { SaveFeedbackProvider } from "@/context/SaveFeedbackContext";
import { UserSettingsProvider } from "@/context/UserSettingsContext";
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
              <UserSettingsProvider>
                <SaveFeedbackProvider>
                  <StatusBar style="auto" />
                  <Stack screenOptions={{ headerShown: false }} />
                </SaveFeedbackProvider>
              </UserSettingsProvider>
            </PreferencesProvider>
          </AuthProvider>
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
