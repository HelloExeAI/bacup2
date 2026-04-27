import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CountryCodePicker } from "@/components/settings/CountryCodePicker";
import { SaveTick } from "@/components/settings/SaveTick";
import { useAuth } from "@/context/AuthContext";
import { useSaveFeedback } from "@/context/SaveFeedbackContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { useAppTheme } from "@/context/ThemeContext";
import { clearProfileAvatar, pickAndUploadProfileAvatar } from "@/lib/avatarUploadMobile";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import { readDeviceIanaTimeZone } from "@/lib/deviceIanaTimeZone";
import type { AppTheme } from "@/lib/theme";

type ExpoLocation = typeof import("expo-location");

function loadExpoLocation(): ExpoLocation | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-location") as ExpoLocation;
  } catch {
    return null;
  }
}

function formatCityRegionCountry(p: { city?: string | null; region?: string | null; country?: string | null }) {
  const city = String(p.city ?? "").trim();
  const region = String(p.region ?? "").trim();
  const country = String(p.country ?? "").trim();
  if (city && region && country) return `${city}, ${region} ${country}`;
  if (city && country) return `${city}, ${country}`;
  if (region && country) return `${region}, ${country}`;
  return city || country || region || "";
}

export default function AccountSettingsScreen() {
  const { theme } = useAppTheme();
  const { user, session } = useAuth();
  const { notifySaved } = useSaveFeedback();
  const { data, patch, loading, refresh } = useUserSettings();
  const api = Boolean(getAppApiOrigin());
  const [saving, setSaving] = React.useState(false);
  const [avatarBusy, setAvatarBusy] = React.useState(false);
  const [, setTzTick] = React.useState(0);

  const [email, setEmail] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [middleName, setMiddleName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [displayNameManuallyEdited, setDisplayNameManuallyEdited] =
    React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [phoneCc, setPhoneCc] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [locationManuallyEdited, setLocationManuallyEdited] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setTzTick((n) => n + 1);
    }, []),
  );

  React.useEffect(() => {
    if (!data) return;
    const ln = data.profile.last_name ?? "";
    const dn = data.profile.display_name ?? "";
    setEmail(data.email ?? "");
    setFirstName(data.profile.first_name ?? "");
    setMiddleName(data.profile.middle_name ?? "");
    setLastName(ln);
    setDisplayName(dn.trim() ? dn : ln);
    setDisplayNameManuallyEdited(dn.trim() !== "" && dn.trim() !== ln.trim());
    setPhone(data.profile.phone ?? "");
    setPhoneCc(data.profile.phone_country_code ?? "");
    setLocation(data.profile.location ?? "");
    setLocationManuallyEdited(false);
  }, [data]);

  // Auto-fill location like timezone: only if user hasn't typed and field is empty.
  React.useEffect(() => {
    if (locationManuallyEdited) return;
    if (location.trim()) return;
    const loc = loadExpoLocation();
    if (!loc) return;

    let cancelled = false;
    void (async () => {
      try {
        const perm = await loc.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          const asked = await loc.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (!asked.granted) return;
        }

        const pos = await loc.getCurrentPositionAsync({ accuracy: loc.Accuracy.Balanced });
        if (cancelled) return;
        const items = await loc.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (cancelled) return;
        const first = items?.[0] as any;
        const formatted = first
          ? formatCityRegionCountry({
              city: first.city ?? first.subregion ?? null,
              region: first.region ?? first.administrativeArea ?? null,
              country: first.country ?? null,
            })
          : "";
        if (!formatted) return;
        // Don't clobber if user started typing while we were fetching.
        if (!locationManuallyEdited) setLocation(formatted);
      } catch {
        // Silent: location is optional and permissions can be denied.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location, locationManuallyEdited]);

  const hasChanges = React.useMemo(() => {
    if (!data) return false;
    const p = data.profile;
    const deviceTz = readDeviceIanaTimeZone()?.trim() || null;
    const next = {
      first_name: firstName.trim() || null,
      middle_name: middleName.trim() || null,
      last_name: lastName.trim() || null,
      display_name: displayName.trim() || null,
      phone: phone.trim() || null,
      phone_country_code: phoneCc.trim() || null,
      timezone: deviceTz,
      location: location.trim() || null,
    };
    const cur = {
      first_name: (p.first_name ?? "").trim() || null,
      middle_name: (p.middle_name ?? "").trim() || null,
      last_name: (p.last_name ?? "").trim() || null,
      display_name: (p.display_name ?? "").trim() || null,
      phone: (p.phone ?? "").trim() || null,
      phone_country_code: (p.phone_country_code ?? "").trim() || null,
      timezone: (p.timezone ?? "").trim() || null,
      location: (p.location ?? "").trim() || null,
    };
    const emailNext = email.trim().toLowerCase();
    const emailCur = String(data.email ?? "").trim().toLowerCase();
    const emailChanged = Boolean(emailNext && emailNext !== emailCur);
    return (
      emailChanged ||
      Object.keys(next).some((k) => (next as any)[k] !== (cur as any)[k])
    );
  }, [data, displayName, email, firstName, location, middleName, phone, phoneCc, lastName]);

  const onSave = React.useCallback(async () => {
    if (!data) return;
    if (!api) {
      Alert.alert("Not available", "Set EXPO_PUBLIC_APP_URL to sync account settings with the web app.");
      return;
    }
    setSaving(true);
    try {
      const deviceTz = readDeviceIanaTimeZone();
      const body: Record<string, unknown> = {
        profile: {
          first_name: firstName.trim() || null,
          middle_name: middleName.trim() || null,
          last_name: lastName.trim() || null,
          display_name: displayName.trim() || null,
          phone: phone.trim() || null,
          phone_country_code: phoneCc.trim() || null,
          timezone: deviceTz?.trim() || null,
          location: location.trim() || null,
        },
      };
      const nextEmail = email.trim().toLowerCase();
      const cur = (data.email ?? "").trim().toLowerCase();
      if (nextEmail && nextEmail !== cur) {
        body.email = nextEmail;
      }
      await patch(body);
      notifySaved();
    } catch (e) {
      Alert.alert(
        "Could not save",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setSaving(false);
    }
  }, [
    api,
    data,
    displayName,
    email,
    firstName,
    lastName,
    location,
    middleName,
    notifySaved,
    patch,
    phone,
    phoneCc,
  ]);

  function onChangeLastName(v: string) {
    setLastName(v);
    if (!displayNameManuallyEdited) {
      setDisplayName(v);
    }
  }

  function onChangeDisplayName(v: string) {
    setDisplayName(v);
    setDisplayNameManuallyEdited(true);
  }

  const userId = user?.id ?? data?.profile.id ?? null;

  async function onPickAvatar() {
    const token = session?.access_token;
    if (!userId || !token) return;
    setAvatarBusy(true);
    try {
      await pickAndUploadProfileAvatar(token);
      await refresh();
      notifySaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg !== "Canceled") Alert.alert("Photo", msg);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onRemoveAvatar() {
    const token = session?.access_token;
    if (!userId || !token) return;
    setAvatarBusy(true);
    try {
      await clearProfileAvatar(token);
      await refresh();
      notifySaved();
    } catch (e) {
      Alert.alert("Photo", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAvatarBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: theme.background }]}
      >
        <Text style={{ color: theme.mutedForeground }}>
          Configure EXPO_PUBLIC_APP_URL and pull to refresh on Settings.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.background }]}
      edges={["bottom", "left", "right"]}
    >
      <View style={styles.accountRoot}>
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.fieldLabel, { color: theme.mutedForeground }]}>Profile photo</Text>
          <View style={styles.avatarBlock}>
            <Pressable
              onPress={() => void onPickAvatar()}
              disabled={avatarBusy || !userId}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              style={({ pressed }) => [
                styles.avatarCircle,
                { borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              {data.profile.avatar_url?.trim() ? (
                <Image
                  source={{ uri: data.profile.avatar_url.trim() }}
                  style={styles.avatarImage}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: theme.muted }]}>
                  <Ionicons name="person" size={36} color={theme.mutedForeground} />
                </View>
              )}
              {avatarBusy ? (
                <View style={styles.avatarBusy}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : null}
            </Pressable>
            <View style={styles.avatarMeta}>
              <Text style={[styles.avatarHint, { color: theme.mutedForeground }]}>
                Tap the image to choose a new photo (saved immediately).
              </Text>
              {data.profile.avatar_url?.trim() ? (
                <Pressable
                  onPress={() => void onRemoveAvatar()}
                  disabled={avatarBusy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove profile photo"
                >
                  <Text style={[styles.avatarRemove, { color: theme.accent }]}>Remove photo</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Field label="Email" theme={theme}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@company.com"
              placeholderTextColor={theme.mutedForeground}
              style={[
                styles.input,
                {
                  color: theme.foreground,
                  borderColor: theme.border,
                  backgroundColor: theme.card,
                },
              ]}
            />
          </Field>

          <View style={styles.pairRow}>
            <Field label="First name" theme={theme} style={styles.pairCol}>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholderTextColor={theme.mutedForeground}
                style={[
                  styles.input,
                  {
                    color: theme.foreground,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  },
                ]}
              />
            </Field>
            <Field label="Middle name" theme={theme} style={styles.pairCol}>
              <TextInput
                value={middleName}
                onChangeText={setMiddleName}
                placeholderTextColor={theme.mutedForeground}
                style={[
                  styles.input,
                  {
                    color: theme.foreground,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  },
                ]}
              />
            </Field>
          </View>

          <View style={styles.pairRow}>
            <Field label="Last name" theme={theme} style={styles.pairCol}>
              <TextInput
                value={lastName}
                onChangeText={onChangeLastName}
                placeholderTextColor={theme.mutedForeground}
                style={[
                  styles.input,
                  {
                    color: theme.foreground,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  },
                ]}
              />
            </Field>
            <Field label="Display name" theme={theme} style={styles.pairCol}>
              <TextInput
                value={displayName}
                onChangeText={onChangeDisplayName}
                placeholderTextColor={theme.mutedForeground}
                style={[
                  styles.input,
                  {
                    color: theme.foreground,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  },
                ]}
              />
            </Field>
          </View>

          <View style={styles.pairRow}>
            <Field label="Country Code" theme={theme} style={styles.pairCol}>
              <CountryCodePicker value={phoneCc} onChange={setPhoneCc} theme={theme} />
            </Field>
            <Field label="Phone" theme={theme} style={styles.pairCol}>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholderTextColor={theme.mutedForeground}
                style={[
                  styles.input,
                  {
                    color: theme.foreground,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  },
                ]}
              />
            </Field>
          </View>

          <Text style={[styles.tzNote, { color: theme.mutedForeground }]}>
            Time zone follows your device (
            {readDeviceIanaTimeZone() ?? "unknown"}). Tap the green checkmark
            below to save.
          </Text>

          <Field label="Location" theme={theme}>
            <TextInput
              value={location}
              onChangeText={(v) => {
                setLocation(v);
                setLocationManuallyEdited(true);
              }}
              placeholder="City, region country"
              placeholderTextColor={theme.mutedForeground}
              style={[
                styles.input,
                {
                  color: theme.foreground,
                  borderColor: theme.border,
                  backgroundColor: theme.card,
                },
              ]}
            />
          </Field>
        </ScrollView>
        <View
          style={[
            styles.saveFooter,
            { borderTopColor: theme.border, backgroundColor: theme.background },
          ]}
        >
          <SaveTick
            disabled={saving || !data || !api || !hasChanges}
            onPress={() => void onSave()}
            theme={theme}
            accessibilityLabel="Save account"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Field({
  label,
  theme,
  children,
  style,
}: {
  label: string;
  theme: ReturnType<typeof useAppTheme>["theme"];
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  accountRoot: { flex: 1 },
  scrollFlex: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  scroll: { padding: 14, paddingBottom: 24 },
  /** Centered save control at the bottom of this tab (above the bottom tab bar + safe area). */
  saveFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  note: { fontSize: 11, lineHeight: 16, marginBottom: 12 },
  avatarBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  avatarMeta: { flex: 1, minWidth: 0 },
  avatarHint: { fontSize: 11, lineHeight: 16 },
  avatarRemove: { marginTop: 8, fontSize: 12, fontWeight: "700" },
  tzNote: { fontSize: 11, lineHeight: 16, marginBottom: 12, marginTop: -6 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  pairRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 12,
  },
  pairCol: { flex: 1, minWidth: 0, marginBottom: 0 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
});
