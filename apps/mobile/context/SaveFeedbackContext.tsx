import * as React from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/context/ThemeContext";

type SaveFeedbackContextValue = {
  notifySaved: (message?: string) => void;
};

const SaveFeedbackContext = React.createContext<SaveFeedbackContextValue | null>(null);

export function useSaveFeedback(): SaveFeedbackContextValue {
  const v = React.useContext(SaveFeedbackContext);
  if (!v) {
    return { notifySaved: () => {} };
  }
  return v;
}

/** Extra space so the toast clears a typical bottom tab bar. */
const TAB_CLEARANCE = 56;

export function SaveFeedbackProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = React.useState(false);
  const [text, setText] = React.useState("Settings Saved");
  const opacity = React.useRef(new Animated.Value(0)).current;
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = React.useRef("Settings Saved");

  const showNow = React.useCallback(
    (msg: string) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setText(msg);
      setVisible(true);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setVisible(false);
        });
      }, 2200);
    },
    [opacity],
  );

  const notifySaved = React.useCallback(
    (message = "Settings Saved") => {
      pendingRef.current = message;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        showNow(pendingRef.current);
      }, 380);
    },
    [showNow],
  );

  React.useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const value = React.useMemo(() => ({ notifySaved }), [notifySaved]);

  const bottom = TAB_CLEARANCE + Math.max(insets.bottom, 8);

  return (
    <SaveFeedbackContext.Provider value={value}>
      <View style={styles.flex}>
        {children}
        {visible ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Animated.View style={[styles.toastWrap, { bottom, opacity }]}>
              <View style={[styles.toast, { backgroundColor: theme.foreground }]}>
                <Text style={[styles.toastText, { color: theme.background }]} numberOfLines={2}>
                  {text}
                </Text>
              </View>
            </Animated.View>
          </View>
        ) : null}
      </View>
    </SaveFeedbackContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toastWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  toast: {
    maxWidth: 360,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  toastText: { fontSize: 13, fontWeight: "700", textAlign: "center" },
});
