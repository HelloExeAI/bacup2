import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";

export function KpiTile({ label, value }: { label: string; value: number | string }) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.value, { color: theme.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: theme.mutedForeground }]}>{label}</Text>
    </View>
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
