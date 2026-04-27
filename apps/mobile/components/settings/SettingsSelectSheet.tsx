import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppTheme } from "@/lib/theme";

export type SettingsSelectOption = {
  value: string;
  label: string;
  subtitle?: string;
};

type Props = {
  title: string;
  value: string;
  options: SettingsSelectOption[];
  onChange: (value: string) => void;
  theme: AppTheme;
  /** Search filter on label + value (for long lists). */
  searchable?: boolean;
  placeholder?: string;
};

const WINDOW_H = Dimensions.get("window").height;

export function SettingsSelectSheet({
  title,
  value,
  options,
  onChange,
  theme,
  searchable = false,
  placeholder = "Search…",
}: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s) || (o.subtitle ?? "").toLowerCase().includes(s),
    );
  }, [options, q]);

  const sheetMaxH = React.useMemo(() => Math.min(Math.round(WINDOW_H * 0.72), 520), []);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ("");
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: theme.border,
            backgroundColor: theme.card,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <View style={styles.triggerText}>
          <Text style={[styles.triggerLabel, { color: theme.foreground }]} numberOfLines={2}>
            {selected?.label ?? (value || "Choose")}
          </Text>
          {selected?.subtitle ? (
            <Text style={[styles.triggerSub, { color: theme.mutedForeground }]} numberOfLines={2}>
              {selected.subtitle}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={18} color={theme.mutedForeground} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: 12 + insets.bottom, maxHeight: sheetMaxH }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.sheetTitle, { color: theme.foreground }]}>{title}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={theme.mutedForeground} />
              </Pressable>
            </View>
            {searchable ? (
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={placeholder}
                placeholderTextColor={theme.mutedForeground}
                style={[
                  styles.search,
                  { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.background },
                ]}
              />
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: sheetMaxH - (searchable ? 140 : 100) }}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    onPress={() => pick(item.value)}
                    style={({ pressed }) => [
                      styles.row,
                      { borderBottomColor: theme.border, opacity: pressed ? 0.85 : 1 },
                      active && { backgroundColor: theme.muted },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: theme.foreground }]}>{item.label}</Text>
                      {item.subtitle ? (
                        <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{item.subtitle}</Text>
                      ) : null}
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={20} color={theme.accent} /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    gap: 8,
  },
  triggerText: { flex: 1, minWidth: 0 },
  // Match `ToggleRow` label scale.
  triggerLabel: { fontSize: 13, fontWeight: "600" },
  triggerSub: { fontSize: 11, marginTop: 4, lineHeight: 15 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700" },
  search: {
    marginHorizontal: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rowLabel: { fontSize: 15, fontWeight: "600" },
  rowSub: { fontSize: 11, marginTop: 3, lineHeight: 15 },
});
