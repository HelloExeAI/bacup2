import * as React from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SaveTick } from "@/components/settings/SaveTick";
import { useAuth } from "@/context/AuthContext";
import { useSaveFeedback } from "@/context/SaveFeedbackContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { useAppTheme } from "@/context/ThemeContext";
import { postMobileUserPassword } from "@/lib/mobileSettingsApi";
import { getAppApiOrigin } from "@/lib/apiOrigin";

export default function SecuritySettingsScreen() {
  const { theme } = useAppTheme();
  const { notifySaved } = useSaveFeedback();
  const { session } = useAuth();
  const { data } = useUserSettings();
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const api = Boolean(getAppApiOrigin());

  async function changePassword() {
    if (!api || !session?.access_token) {
      Alert.alert("Not available", "Set EXPO_PUBLIC_APP_URL to update your password from the mobile app.");
      return;
    }
    if (pw.length < 8 || pw.length > 128) {
      Alert.alert("Invalid password", "Use 8–128 characters.");
      return;
    }
    if (pw !== pw2) {
      Alert.alert("Mismatch", "Password confirmation does not match.");
      return;
    }
    setBusy(true);
    try {
      await postMobileUserPassword(session.access_token, pw);
      setPw("");
      setPw2("");
      notifySaved();
    } catch (e) {
      Alert.alert("Could not update", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = api && Boolean(session?.access_token) && pw.length >= 8 && pw.length <= 128 && pw === pw2 && !busy;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["bottom", "left", "right"]}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.p, { color: theme.mutedForeground }]}>Choose a strong password.</Text>

        <Text style={[styles.label, { color: theme.mutedForeground }]}>New password</Text>
        <TextInput
          value={pw}
          onChangeText={setPw}
          secureTextEntry
          autoCapitalize="none"
          placeholder="••••••••"
          placeholderTextColor={theme.mutedForeground}
          style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.card }]}
        />
        <Text style={[styles.label, { color: theme.mutedForeground }]}>Confirm</Text>
        <TextInput
          value={pw2}
          onChangeText={setPw2}
          secureTextEntry
          autoCapitalize="none"
          placeholder="••••••••"
          placeholderTextColor={theme.mutedForeground}
          style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.card }]}
        />

        </ScrollView>

        <View style={[styles.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <SaveTick
            disabled={!canSubmit}
            onPress={() => void changePassword()}
            theme={theme}
            accessibilityLabel="Save password"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1 },
  scroll: { padding: 14, paddingBottom: 110 },
  p: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  label: { fontSize: 10, fontWeight: "800", marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 15, marginBottom: 4 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
