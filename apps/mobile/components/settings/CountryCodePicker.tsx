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
import {
  COUNTRY_DIAL_CODES_BY_NAME,
  dialFlagEmoji,
  findCountryByDial,
  normalizeDialCode,
  type CountryDial,
} from "@/lib/countryDialCodes";

type Props = {
  value: string;
  onChange: (dial: string) => void;
  theme: AppTheme;
};

const WINDOW_H = Dimensions.get("window").height;

export function CountryCodePicker({ value, onChange, theme }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const sheetMaxHeight = React.useMemo(
    () => Math.min(Math.round(WINDOW_H * 0.76), 560),
    [],
  );

  const selected = React.useMemo(() => findCountryByDial(value), [value]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_DIAL_CODES_BY_NAME;
    return COUNTRY_DIAL_CODES_BY_NAME.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.replace("+", "").includes(q) ||
        c.dial.includes(q) ||
        c.iso2.toLowerCase().includes(q),
    );
  }, [query]);

  function pick(c: CountryDial) {
    onChange(c.dial);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Choose country code"
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: theme.border,
            backgroundColor: theme.card,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={styles.flag}>{selected ? dialFlagEmoji(selected.iso2) : "🏳️"}</Text>
        <Text style={[styles.triggerDial, { color: theme.foreground }]} numberOfLines={1}>
          {(selected?.dial ?? "").trim() || normalizeDialCode(value) || "—"}
        </Text>
        <Text style={[styles.triggerName, { color: theme.mutedForeground }]} numberOfLines={1}>
          {selected?.name ?? "Select country"}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.mutedForeground} style={styles.chev} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalDim} onPress={() => setOpen(false)} accessibilityLabel="Dismiss" />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.background,
                height: sheetMaxHeight,
                paddingBottom: Math.max(insets.bottom, 10),
              },
            ]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.sheetTitle, { color: theme.foreground }]}>Country code</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={theme.mutedForeground} />
              </Pressable>
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search country or code"
              placeholderTextColor={theme.mutedForeground}
              style={[
                styles.search,
                {
                  color: theme.foreground,
                  borderColor: theme.border,
                  backgroundColor: theme.card,
                },
              ]}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => `${item.iso2}-${item.dial}-${item.name}`}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => pick(item)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: theme.border, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={styles.rowFlag}>{dialFlagEmoji(item.iso2)}</Text>
                  <Text style={[styles.rowDial, { color: theme.foreground }]}>{item.dial}</Text>
                  <Text style={[styles.rowName, { color: theme.mutedForeground }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.mutedForeground }]}>No matches.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 42,
  },
  flag: { fontSize: 18, lineHeight: 22 },
  triggerDial: { fontSize: 14, fontWeight: "800", minWidth: 36 },
  triggerName: { flex: 1, fontSize: 11, fontWeight: "600" },
  chev: { marginLeft: 2 },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  list: { flex: 1 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 16, fontWeight: "800" },
  search: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowFlag: { fontSize: 22, lineHeight: 26, width: 32, textAlign: "center" },
  rowDial: { fontSize: 15, fontWeight: "800", width: 52 },
  rowName: { flex: 1, fontSize: 13, lineHeight: 18 },
  empty: { padding: 24, textAlign: "center" },
});
