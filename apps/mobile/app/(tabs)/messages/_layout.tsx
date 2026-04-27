import { Stack } from "expo-router";

/** Messages hub → Communicator | Email; Email nests account list → today’s inbox per account. */
export default function MessagesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="communicator" />
      <Stack.Screen name="email" />
    </Stack>
  );
}
