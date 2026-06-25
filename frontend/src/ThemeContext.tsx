// Theme provider + hook
import React, { createContext, useContext } from "react";
import { Theme, ThemeMode, useThemeMode } from "@/src/theme";

type Ctx = {
  theme: Theme;
  mode: ThemeMode;
  effectiveMode: "light" | "dark";
  setMode: (m: ThemeMode) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const t = useThemeMode();
  return <ThemeCtx.Provider value={t}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme must be used within ThemeProvider");
  return v;
}
