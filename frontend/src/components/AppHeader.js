import { Link } from "react-router-dom";
import ThemeToggle from "@/components/ThemeToggle";

export default function AppHeader({ week, right }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5 no-select" data-testid="brand-home">
          <span className="grid h-9 w-9 place-items-center rounded-sm bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
          <div className="leading-tight">
            <div className="display text-lg font-black uppercase tracking-tight">Kurukshetra</div>
            <div className="-mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">Picklewave</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {typeof week === "number" && (
            <span
              data-testid="week-badge"
              className="hidden sm:inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
            >
              Week <span className="text-foreground num-mono">{week}</span>
            </span>
          )}
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
