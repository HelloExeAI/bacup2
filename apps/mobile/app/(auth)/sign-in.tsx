import { router } from "expo-router";
import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";

export default function SignInScreen() {
  const { signIn } = useAuth();
  const { theme } = useAppTheme();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit() {
    setErr(null);
    setBusy(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        setErr(error);
        return;
      }
      router.replace("/(tabs)/overview");
    } finally {
      setBusy(false);
    }
  }

  function onGoogle() {
    Alert.alert(
      "Google sign-in",
      "Google login will be enabled next. For now, sign in with your email + password (same account as the web app).",
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.root}>
          <View style={styles.topHalf}>
            <View style={styles.brandCenter}>
              <View
                style={[
                  styles.logoOuter,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    shadowColor: theme.foreground,
                  },
                ]}
              >
                <View style={styles.logoInner}>
                  <Image source={require("../../assets/icon.png")} style={styles.logoImg} resizeMode="cover" />
                </View>
              </View>
              <Text style={[styles.h1, { color: theme.foreground }]}>The Bacup</Text>
            </View>
          </View>

          <View style={[styles.form, { backgroundColor: theme.background }]}>
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.card }]}
              placeholder="Email"
              placeholderTextColor={theme.mutedForeground}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.card }]}
              placeholder="Password"
              placeholderTextColor={theme.mutedForeground}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {err ? <Text style={styles.err}>{err}</Text> : null}

            <Pressable
              style={[styles.btn, { backgroundColor: theme.foreground }]}
              onPress={() => void onSubmit()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <Text style={[styles.btnText, { color: theme.background }]}>Sign in</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.mutedForeground }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            <Pressable
              style={[styles.btnGoogle, { borderColor: theme.border, backgroundColor: theme.card }]}
              onPress={onGoogle}
            >
              <View style={styles.googleGlyph} />
              <Text style={[styles.googleText, { color: theme.foreground }]}>Google</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  root: { flex: 1, paddingHorizontal: 24 },
  topHalf: { flex: 1, justifyContent: "center" },
  brandCenter: { alignItems: "center" },
  form: { paddingBottom: 28 },
  logoOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    // iOS shadow
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    // Android
    elevation: 3,
  },
  logoInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  logoImg: { width: "100%", height: "100%" },
  h1: { marginTop: 14, fontSize: 28, fontWeight: "700", letterSpacing: 0.6, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  err: { color: "#b91c1c", marginBottom: 12, fontSize: 13 },
  btn: { borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  btnText: { fontSize: 16, fontWeight: "600" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  btnGoogle: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleGlyph: { width: 18, height: 18, borderRadius: 4, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dadce0" },
  googleText: { fontSize: 15, fontWeight: "700" },
});
