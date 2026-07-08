import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { endpoints } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { titleCase } from "@/lib/format";

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    const t = await endpoints.teams();
    setTeams(t);
  };
  useEffect(() => { load(); }, []);
  useLive((msg) => { if (msg?.type === "teams_changed") load(); });

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        <h1 className="display text-3xl font-black uppercase tracking-tight">Teams</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Eight squads. Six players each. One tournament.
        </p>

        <div className="mt-5 grid gap-3">
          {teams.map((t) => {
            const isOpen = openId === t.id;
            const advance = (t.players || []).filter((p) => p.category === "advance");
            const beginner = (t.players || []).filter((p) => p.category !== "advance");
            return (
              <div
                key={t.id}
                data-testid={`team-card-${t.name}`}
                className="rounded-sm border border-border bg-card"
              >
                <button
                  onClick={() => setOpenId(isOpen ? null : t.id)}
                  data-testid={`team-toggle-${t.name}`}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-sm bg-primary/15 text-primary display text-lg font-black">
                      {t.name.slice(0, 2)}
                    </span>
                    <div>
                      <div className="display text-xl font-black uppercase tracking-tight">
                        {t.name}
                      </div>
                      <div className="text-[11px] font-medium text-muted-foreground">
                        Captain · {titleCase(t.captain_name || "—")}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                    {(t.players || []).length} players
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-border px-4 py-3">
                    <RosterGroup label="Advance" players={advance} />
                    <RosterGroup label="Beginner" players={beginner} className="mt-3" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function RosterGroup({ label, players, className = "" }) {
  if (!players.length) return null;
  return (
    <div className={className}>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
        {label}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        {players.map((p) => (
          <li
            key={p.id}
            data-testid={`player-${p.id}`}
            className="flex items-center justify-between border-b border-border/60 py-1.5"
          >
            <span className="text-sm">
              {titleCase(p.name)}
              {p.is_captain && (
                <span className="ml-1.5 text-[10px] font-bold text-primary">(C)</span>
              )}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {p.category === "advance" ? "ADV" : "BEG"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
