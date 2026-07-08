import { NavLink } from "react-router-dom";
import { Trophy, Users, Zap } from "lucide-react";

const tabs = [
  { to: "/", label: "Games", icon: Zap, testid: "nav-games" },
  { to: "/teams", label: "Teams", icon: Users, testid: "nav-teams" },
  { to: "/standings", label: "Standings", icon: Trophy, testid: "nav-standings" },
];

export default function BottomNav() {
  return (
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-3xl">
        {tabs.map(({ to, label, icon: Icon, testid }) => (
          <li key={to} className="flex-1">
            <NavLink
              end={to === "/"}
              to={to}
              data-testid={testid}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-3 gap-1 no-select ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <Icon className="h-5 w-5" strokeWidth={2.25} />
              <span className="text-[11px] font-medium uppercase tracking-widest">
                {label}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
