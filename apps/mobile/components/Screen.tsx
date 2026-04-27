import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "@/context/ThemeContext";

export function Screen({
  title,
  subtitle,
  leading,
  headerRight,
  children,
  scroll = true,
  refreshControl,
}: {
  title: string;
  subtitle?: string;
  /** e.g. back control above the title row */
  leading?: React.ReactNode;
  /** e.g. toolbar icons aligned to the title row */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement;
}) {
  const { theme } = useAppTheme();

  const header = (
    <View style={styles.header}>
      {leading ? <View style={styles.leadingWrap}>{leading}</View> : null}
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: theme.mutedForeground }]}>{subtitle}</Text> : null}
        </View>
        {headerRight ? <View style={styles.headerRightWrap}>{headerRight}</View> : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, styles.fill]}>
          {header}
          <View style={styles.fill}>{children}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  scroll: { padding: 14, paddingBottom: 28 },
  header: { marginBottom: 12 },
  leadingWrap: { marginBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  headerTextCol: { flex: 1, minWidth: 0 },
  headerRightWrap: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 2 },
  title: { fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  subtitle: { marginTop: 4, fontSize: 11, lineHeight: 15 },
});
