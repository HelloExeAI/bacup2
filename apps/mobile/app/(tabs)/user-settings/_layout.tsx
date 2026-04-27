import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAppTheme } from "@/context/ThemeContext";

const SCREEN_TITLE: Record<string, string> = {
  account: "Account",
  preferences: "Preferences",
  security: "Security",
  voice: "Voice",
  integrations: "Integrations",
  communications: "Communications",
  "team-setup": "Team setup",
  billing: "Billing",
};

export default function UserSettingsStackLayout() {
  const { theme } = useAppTheme();

  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: route.name !== "index",
        title: SCREEN_TITLE[String(route.name)] ?? "",
        headerBackTitle: "Settings",
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.accent,
        headerTitleStyle: { color: theme.foreground, fontWeight: "700", fontSize: 15 },
        /** Match body / field caption scale (~11px) for “&lt; Settings” back label. */
        headerBackTitleStyle: { fontSize: 11, fontWeight: "600" },
        headerBackImage: ({ tintColor }: { tintColor?: string }) => (
          <Ionicons
            name="chevron-back"
            size={18}
            color={tintColor ?? theme.accent}
            style={{ marginLeft: 6 }}
          />
        ),
        contentStyle: { backgroundColor: theme.background },
      })}
    />
  );
}
