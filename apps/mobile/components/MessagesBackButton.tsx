import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";

export function MessagesBackButton({ label = "Back" }: { label?: string }) {
  const { theme } = useAppTheme();
  if (!router.canGoBack()) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      onPress={() => router.back()}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 2 }}
    >
      <Ionicons name="chevron-back" size={18} color={theme.accent} />
      <Text style={{ color: theme.accent, fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
