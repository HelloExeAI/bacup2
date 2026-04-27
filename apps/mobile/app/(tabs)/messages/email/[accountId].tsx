import { useLocalSearchParams } from "expo-router";
import * as React from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { MessagesBackButton } from "@/components/MessagesBackButton";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import {
  fetchMobileEmailToday,
  localCalendarYmd,
  type MobileEmailTodayMessage,
} from "@/lib/mobileSettingsApi";

export default function MessagesEmailAccountToday() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { session } = useAuth();
  const { theme } = useAppTheme();
  const [messages, setMessages] = React.useState<MobileEmailTodayMessage[]>([]);
  const [listDate, setListDate] = React.useState("");
  const [accountEmail, setAccountEmail] = React.useState("");
  const [provider, setProvider] = React.useState("");
  const [placeholder, setPlaceholder] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const token = session?.access_token ?? "";
  const id = typeof accountId === "string" ? accountId : Array.isArray(accountId) ? accountId[0] : "";

  const load = React.useCallback(async () => {
    setError(null);
    setPlaceholder(null);
    const origin = getAppApiOrigin();
    if (!origin) {
      setError("Missing app URL (EXPO_PUBLIC_APP_URL).");
      return;
    }
    if (!token || !id) {
      setMessages([]);
      return;
    }
    try {
      const ymd = localCalendarYmd();
      const j = await fetchMobileEmailToday(token, { dateYmd: ymd, maxResults: 50, accountId: id });
      setListDate(j.date);
      const section = j.sections[0];
      if (!section) {
        setError("Account not found.");
        setMessages([]);
        setAccountEmail("");
        setProvider("");
        return;
      }
      setAccountEmail(section.accountEmail);
      setProvider(section.provider);
      if (section.error) {
        setError(section.error);
        setMessages([]);
        return;
      }
      if (section.provider !== "google") {
        setMessages([]);
        setPlaceholder(
          "Today’s inbox is available for Google accounts. Microsoft mail preview will be added in a future update.",
        );
        return;
      }
      setMessages(section.messages);
    } catch (e) {
      setMessages([]);
      setError(e instanceof Error ? e.message : "Could not load email.");
    }
  }, [token, id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const headerSubtitle = [accountEmail, listDate ? `Inbox · ${listDate}` : ""].filter(Boolean).join(" · ");

  return (
    <Screen
      leading={<MessagesBackButton />}
      title="Today’s inbox"
      subtitle={headerSubtitle || undefined}
      scroll={false}
    >
      {provider ? (
        <Text style={[styles.provider, { color: theme.mutedForeground }]}>{provider}</Text>
      ) : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {placeholder && !error ? (
        <Text style={[styles.placeholder, { color: theme.mutedForeground }]}>{placeholder}</Text>
      ) : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
        }
        ListEmptyComponent={
          !error && !placeholder ? (
            <Text style={{ color: theme.mutedForeground, marginTop: 16 }}>No messages in today’s inbox.</Text>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={[styles.msgCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.msgFrom, { color: theme.mutedForeground }]} numberOfLines={2}>
              {item.from}
            </Text>
            <Text style={[styles.msgSubject, { color: theme.foreground }]} numberOfLines={2}>
              {item.subject}
            </Text>
            {item.snippet ? (
              <Text style={[styles.msgSnippet, { color: theme.mutedForeground }]} numberOfLines={2}>
                {item.snippet}
              </Text>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  provider: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
  err: { color: "#b91c1c", marginBottom: 10 },
  placeholder: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  msgCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  msgFrom: { fontSize: 12, lineHeight: 16 },
  msgSubject: { fontSize: 15, fontWeight: "600", marginTop: 6, lineHeight: 20 },
  msgSnippet: { fontSize: 12, marginTop: 6, lineHeight: 17 },
});
