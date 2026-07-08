import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "picklewave.theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return (
    <button
      data-testid="theme-toggle"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
