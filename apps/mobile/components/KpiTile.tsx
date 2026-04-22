import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";

export function KpiTile({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number | string;
  onPress?: () => void;
}) {
  const { theme } = useAppTheme();
  const content = (
    <>
      <Text style={[styles.value, { color: theme.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: theme.mutedForeground }]}>{label}</Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "45%",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  value: { fontSize: 22, fontWeight: "700" },
  label: { marginTop: 4, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
});
