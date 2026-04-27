import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";

import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";

export default function TabsLayout() {
  const { session } = useAuth();
  const { theme } = useAppTheme();

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.mutedForeground,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIconStyle: { marginBottom: -2 },
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{
          title: "Overview",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          // Hidden screen used for KPI drill-down lists.
          href: null,
        }}
      />
      <Tabs.Screen
        name="task/[id]"
        options={{
          // Hidden screen used for task editing.
          href: null,
        }}
      />
      <Tabs.Screen
        name="assignee/[name]"
        options={{
          // Hidden screen used for assignee drill-down.
          href: null,
        }}
      />
      <Tabs.Screen
        name="team-inbox/[kind]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          title: "Meetings",
          tabBarIcon: ({ color }) => <Ionicons name="videocam-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="consolidated"
        options={{
          title: "Team",
          tabBarIcon: ({ color }) => <Ionicons name="layers-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="user-settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={18} color={color} />,
        }}
      />
    </Tabs>
  );
}
