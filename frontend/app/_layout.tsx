import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ThemeProvider, useTheme } from "@/src/ThemeContext";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function Inner() {
  const { theme, effectiveMode } = useTheme();
  return (
    <>
      <StatusBar
        barStyle={effectiveMode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={theme.surface}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.surface },
          animation: "fade",
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Inner />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
