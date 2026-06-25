// PickleScore design tokens — Dark-First Utility, Volt Green brand
import { useColorScheme } from "react-native";
import { useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";

export type ThemeMode = "light" | "dark" | "system";

export const palette = {
  surface: { light: "#F2F4F7", dark: "#0B0D0F" },
  onSurface: { light: "#111418", dark: "#FFFFFF" },
  surfaceSecondary: { light: "#FFFFFF", dark: "#16191D" },
  onSurfaceSecondary: { light: "#4A5568", dark: "#A0ABC0" },
  surfaceTertiary: { light: "#E2E8F0", dark: "#20242A" },
  onSurfaceTertiary: { light: "#2D3748", dark: "#CBD5E1" },
  surfaceInverse: { light: "#0B0D0F", dark: "#F2F4F7" },
  onSurfaceInverse: { light: "#FFFFFF", dark: "#111418" },
  brand: { light: "#D4FF00", dark: "#D4FF00" },
  onBrand: { light: "#000000", dark: "#000000" },
  brandSecondary: { light: "#000000", dark: "#FFFFFF" },
  brandTertiary: { light: "#EEFF99", dark: "#333D00" },
  onBrandTertiary: { light: "#1A1D00", dark: "#D4FF00" },
  success: { light: "#10B981", dark: "#10B981" },
  warning: { light: "#F59E0B", dark: "#F59E0B" },
  error: { light: "#EF4444", dark: "#EF4444" },
  border: { light: "#E2E8F0", dark: "#2A2F36" },
  borderStrong: { light: "#CBD5E1", dark: "#3F4652" },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const font = {
  display: "Bebas Neue",
  text: "DM Sans",
};

export const fontSize = { xs: 11, sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32, score: 96, scoreSm: 64 };

export type Theme = {
  mode: "light" | "dark";
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
  onSurfaceSecondary: string;
  surfaceTertiary: string;
  onSurfaceTertiary: string;
  surfaceInverse: string;
  onSurfaceInverse: string;
  brand: string;
  onBrand: string;
  brandSecondary: string;
  brandTertiary: string;
  onBrandTertiary: string;
  success: string;
  warning: string;
  error: string;
  border: string;
  borderStrong: string;
};

export function buildTheme(mode: "light" | "dark"): Theme {
  return {
    mode,
    surface: palette.surface[mode],
    onSurface: palette.onSurface[mode],
    surfaceSecondary: palette.surfaceSecondary[mode],
    onSurfaceSecondary: palette.onSurfaceSecondary[mode],
    surfaceTertiary: palette.surfaceTertiary[mode],
    onSurfaceTertiary: palette.onSurfaceTertiary[mode],
    surfaceInverse: palette.surfaceInverse[mode],
    onSurfaceInverse: palette.onSurfaceInverse[mode],
    brand: palette.brand[mode],
    onBrand: palette.onBrand[mode],
    brandSecondary: palette.brandSecondary[mode],
    brandTertiary: palette.brandTertiary[mode],
    onBrandTertiary: palette.onBrandTertiary[mode],
    success: palette.success[mode],
    warning: palette.warning[mode],
    error: palette.error[mode],
    border: palette.border[mode],
    borderStrong: palette.borderStrong[mode],
  };
}

const STORAGE_KEY = "ps_theme_mode";

export function useThemeMode() {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await storage.getItem<string>(STORAGE_KEY, "system");
      if (stored === "light" || stored === "dark" || stored === "system") {
        setModeState(stored);
      }
      setHydrated(true);
    })();
  }, []);

  const effectiveMode: "light" | "dark" =
    mode === "system" ? (system === "light" ? "light" : "dark") : mode;

  const setMode = async (next: ThemeMode) => {
    setModeState(next);
    await storage.setItem(STORAGE_KEY, next);
  };

  return {
    mode,
    effectiveMode,
    setMode,
    theme: buildTheme(effectiveMode),
    hydrated,
  };
}
