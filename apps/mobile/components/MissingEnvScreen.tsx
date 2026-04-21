import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "@/context/ThemeContext";

export function MissingEnvScreen() {
  const { theme } = useAppTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={[styles.title, { color: theme.foreground }]}>Supabase env not loaded</Text>
        <Text style={[styles.body, { color: theme.mutedForeground }]}>
          Create a file named <Text style={{ fontWeight: "700", color: theme.foreground }}>.env</Text> inside{" "}
          <Text style={{ fontWeight: "700", color: theme.foreground }}>apps/mobile</Text> (same folder as this app’s
          package.json). Use the variable names below — they must start with{" "}
          <Text style={{ fontWeight: "700", color: theme.foreground }}>EXPO_PUBLIC_</Text> (not NEXT_PUBLIC_).
        </Text>
        <View style={[styles.code, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.mono, { color: theme.foreground }]}>
            EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co{"\n"}
            EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
          </Text>
        </View>
        <Text style={[styles.body, { color: theme.mutedForeground }]}>
          Copy the values from your web app’s <Text style={{ fontWeight: "600" }}>.env.local</Text> (NEXT_PUBLIC_*),
          then restart Metro with a clean cache:
        </Text>
        <View style={[styles.code, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.mono, { color: theme.foreground }]}>npx expo start --clear</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pad: { padding: 20 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  code: { borderWidth: 1, borderRadius: 12, padding: 14, marginVertical: 8 },
  mono: { fontSize: 13, fontFamily: "Menlo" },
});
