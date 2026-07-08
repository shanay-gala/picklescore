import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { endpoints } from "@/lib/api";
import { useLive } from "@/lib/useLive";

export default function StandingsPage() {
  const [rows, setRows] = useState([]);
  const load = async () => setRows(await endpoints.leaderboard());
  useEffect(() => { load(); }, []);
  useLive(() => load());

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        <h1 className="display text-3xl font-black uppercase tracking-tight">Standings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sorted by total tournament points (baseline + live).
        </p>

        <div
          data-testid="standings-table"
          className="mt-5 overflow-hidden rounded-sm border border-border bg-card"
        >
          <div className="grid grid-cols-[42px_1fr_44px_44px_60px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>#</span>
            <span>Team</span>
            <span className="text-right">MP</span>
            <span className="text-right">MW</span>
            <span className="text-right">PTS</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.team_id}
              data-testid={`standing-row-${r.team_name}`}
              className="grid grid-cols-[42px_1fr_44px_44px_60px] items-center gap-2 border-b border-border/60 px-3 py-3 last:border-b-0"
            >
              <span className={`display text-lg font-black num-mono ${r.rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>
                {r.rank}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-primary/15 text-primary display text-xs font-black">
                  {r.team_name.slice(0, 2)}
                </span>
                <span className="display truncate text-base font-bold uppercase">
                  {r.team_name}
                </span>
              </div>
              <span className="text-right text-sm num-mono">{r.matches_played}</span>
              <span className="text-right text-sm num-mono">{r.match_wins}</span>
              <span className="text-right display text-xl font-black num-mono">
                {r.tournament_points}
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No standings yet.
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          MP = matches played · MW = match wins · PTS = tournament points
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
