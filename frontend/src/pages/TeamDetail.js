import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import StatusBadge from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { endpoints } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { titleCase } from "@/lib/format";

export default function TeamDetail() {
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [matches, setMatches] = useState([]);
  const [board, setBoard] = useState([]);

  const load = async () => {
    try {
      const [t, ms, lb] = await Promise.all([
        endpoints.team(id),
        endpoints.teamMatches(id),
        endpoints.leaderboard(),
      ]);
      setTeam(t);
      setMatches(ms);
      setBoard(lb);
    } catch (err) {
      void err;
    }
  };
  useEffect(() => { load(); }, [id]);
  useLive(() => load());

  const rank = useMemo(() => board.find((r) => r.team_id === id), [board, id]);

  if (!team) {
    return (
      <div className="app-shell">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted-foreground">Loading team…</main>
        <BottomNav />
      </div>
    );
  }

  const advance = (team.players || []).filter((p) => p.category === "advance");
  const beginner = (team.players || []).filter((p) => p.category !== "advance");

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        <Link
          to="/standings"
          data-testid="back-to-standings"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Standings
        </Link>

        <section className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center gap-4">
            <div
              data-testid="team-rank-crest"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-sm bg-primary/15 text-primary leading-none"
            >
              <div className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-widest opacity-70 leading-none">Rank</div>
                <div className="display num-mono text-2xl font-black leading-none mt-0.5">
                  {rank ? `#${rank.rank}` : "—"}
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="display text-3xl font-black uppercase tracking-tight leading-none">
                {team.name}
              </div>
              <div className="mt-1 text-[11px] font-medium text-muted-foreground">
                Captain · {titleCase(team.captain_name || "—")}
              </div>
            </div>
          </div>

          {rank && (
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              <Stat label="PTS" value={rank.tournament_points} highlight />
              <Stat label="MP" value={rank.matches_played} />
              <Stat label="MW" value={rank.match_wins} />
              <Stat label="PD" value={rank.points_diff} />
            </div>
          )}
        </section>

        <Tabs defaultValue="matches" className="mt-5">
          <TabsList
            data-testid="team-tabs"
            className="grid w-full grid-cols-2 rounded-sm bg-muted p-1"
          >
            <TabsTrigger
              value="matches"
              data-testid="tab-matches"
              className="rounded-sm text-[11px] font-bold uppercase tracking-widest data-[state=active]:bg-background"
            >
              Matches · {matches.length}
            </TabsTrigger>
            <TabsTrigger
              value="squad"
              data-testid="tab-squad"
              className="rounded-sm text-[11px] font-bold uppercase tracking-widest data-[state=active]:bg-background"
            >
              Squad · {(team.players || []).length}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="mt-3">
            {matches.length === 0 ? (
              <EmptyLine text="No matches yet for this team." />
            ) : (
              <div className="grid gap-2">
                {matches.map((m) => <MatchRow key={m.match_id} m={m} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="squad" className="mt-3">
            <div className="rounded-sm border border-border bg-card p-4">
              <RosterGroup label="Advance" players={advance} />
              <RosterGroup label="Beginner" players={beginner} className="mt-4" />
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <BottomNav />
    </div>
  );
}

function Stat({ label, value, highlight = false }) {
  return (
    <div className="rounded-sm border border-border bg-background/40 py-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`display num-mono text-2xl font-black leading-none ${highlight ? "text-primary" : ""}`}>
        {value ?? 0}
      </div>
    </div>
  );
}

function MatchRow({ m }) {
  const tone =
    m.outcome === "win"
      ? "border-l-primary"
      : m.outcome === "loss"
      ? "border-l-destructive"
      : "border-l-border";
  return (
    <Link
      to={`/fixture/${m.fixture_id}`}
      data-testid={`team-match-${m.match_id}`}
      className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-sm border border-border border-l-4 ${tone} bg-card px-3 py-2.5 hover:border-primary/60`}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <div>R{m.round_number}</div>
        <div>M{m.match_number}</div>
      </div>
      <div className="min-w-0">
        <div className="display text-base font-black uppercase tracking-tight leading-tight truncate">
          {m.team_name} <span className="text-muted-foreground">vs</span> {m.opponent_name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <StatusBadge status={m.status} />
          {m.court_number && (
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Court {m.court_number} · Wk {m.week_number}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="display num-mono text-xl font-black leading-none">
          <span className={m.outcome === "win" ? "text-primary" : ""}>{m.team_score}</span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span className={m.outcome === "loss" ? "text-destructive" : ""}>{m.opponent_score}</span>
        </div>
        {m.status === "completed" && (
          <div className={`mt-1 text-[9px] font-bold uppercase tracking-widest ${
            m.outcome === "win" ? "text-primary" : m.outcome === "loss" ? "text-destructive" : "text-muted-foreground"
          }`}>
            {m.outcome}
          </div>
        )}
      </div>
    </Link>
  );
}

function RosterGroup({ label, players, className = "" }) {
  if (!players || players.length === 0) return null;
  return (
    <div className={className}>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
        {label}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        {players.map((p) => (
          <li
            key={p.id}
            data-testid={`squad-player-${p.id}`}
            className="flex items-center justify-between border-b border-border/60 py-1.5"
          >
            <span className="text-sm">
              {titleCase(p.name)}
              {p.is_captain && (
                <span className="ml-1.5 inline-block rounded-sm bg-primary/15 px-1 text-[11px] font-black uppercase leading-tight text-primary" style={{ fontFeatureSettings: '"case" on' }}>(C)</span>
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

function EmptyLine({ text }) {
  return (
    <div className="rounded-sm border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
