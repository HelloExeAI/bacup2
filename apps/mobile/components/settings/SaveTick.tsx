import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { AppTheme } from "@/lib/theme";

const SAVE_GREEN = "#22c55e";

export function SaveTick({
  disabled,
  onPress,
  theme,
  accessibilityLabel = "Save",
}: {
  disabled: boolean;
  onPress: () => void;
  theme: AppTheme;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={({ pressed }) => [{ opacity: disabled ? 1 : pressed ? 0.88 : 1 }]}
    >
      <View
        style={[
          styles.disk,
          {
            backgroundColor: disabled ? theme.muted : SAVE_GREEN,
          },
        ]}
      >
        <Ionicons
          name="checkmark"
          size={18}
          color={disabled ? theme.mutedForeground : "#fff"}
          style={styles.tick}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disk: { width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  tick: { marginLeft: 1 },
});

