import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import type { AppTheme } from "@/lib/theme";

/** Yellow bell + red "!" badge + gentle ring anim (mobile analogue of web `NotificationBellGraphic`). */
export function OverviewInboxBell({
  onPress,
  theme,
  showBadge,
}: {
  onPress: () => void;
  theme: AppTheme;
  showBadge: boolean;
}) {
  const wobble = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!showBadge) {
      wobble.stopAnimation();
      wobble.setValue(0);
      return;
    }

    const seq = Animated.sequence([
      Animated.timing(wobble, { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(wobble, { toValue: -1, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(wobble, { toValue: 1, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(wobble, { toValue: 0, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(900),
    ]);

    const loop = Animated.loop(seq);
    loop.start();
    return () => loop.stop();
  }, [showBadge, wobble]);

  const rotate = wobble.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-10deg", "10deg"],
  });

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.wrap}>
        <View style={styles.bellBg}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="notifications" size={20} color="#EAB308" />
          </Animated.View>
        </View>
        {showBadge ? (
          <View style={[styles.badge, { borderColor: theme.background }]}>
            <Text style={styles.badgeText}>!</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  bellBg: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
    marginTop: -0.5,
  },
});
