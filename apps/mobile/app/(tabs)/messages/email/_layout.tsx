import { Stack } from "expo-router";

export default function MessagesEmailLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[accountId]" />
    </Stack>
  );
}
