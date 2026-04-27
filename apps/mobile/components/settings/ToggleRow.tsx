import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.wrap,
        { borderColor: theme.border, backgroundColor: theme.card },
        disabled && { opacity: 0.55 },
      ]}
    >
      <View style={styles.textCol}>
        <Text style={[styles.label, { color: theme.foreground }]}>{label}</Text>
        {description ? <Text style={[styles.desc, { color: theme.mutedForeground }]}>{description}</Text> : null}
      </View>
      <View
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
        style={[
          styles.track,
          { borderColor: theme.border, backgroundColor: value ? theme.accent : theme.muted },
        ]}
      >
        <View style={[styles.thumb, { backgroundColor: "#fff" }, value && styles.thumbOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  textCol: { flex: 1 },
  label: { fontSize: 13, fontWeight: "600" },
  desc: { fontSize: 11, marginTop: 3, lineHeight: 15 },
  track: {
    width: 42,
    height: 24,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  thumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignSelf: "flex-start",
  },
  thumbOn: { alignSelf: "flex-end" },
});
