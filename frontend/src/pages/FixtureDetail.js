import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import StatusBadge from "@/components/StatusBadge";
import { endpoints } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { titleCase } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

export default function FixtureDetail() {
  const { id } = useParams();
  const [f, setF] = useState(null);

  const load = async () => {
    try {
      const data = await endpoints.fixture(id);
      setF(data);
    } catch (err) {
      void err;
    }
  };
  useEffect(() => { load(); }, [id]);
  useLive((msg) => {
    if (!msg) return;
    if (msg.type === "fixture_changed" && msg.fixture_id && msg.fixture_id !== id) return;
    load();
  });

  if (!f) return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 text-sm text-muted-foreground">Loading fixture…</main>
      <BottomNav />
    </div>
  );

  const isLive = f.status === "live";

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground hover:text-primary"
          data-testid="back-to-games"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>

        <section className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={f.status} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Court {f.court_number} · Wk {f.week_number} · Target {f.target_score}
            </span>
          </div>
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex w-full items-center justify-between gap-3">
              <div className="display text-2xl sm:text-3xl font-black uppercase tracking-tight leading-none">
                {f.team_a_name}
              </div>
              <div className="text-right display text-2xl sm:text-3xl font-black uppercase tracking-tight leading-none">
                {f.team_b_name}
              </div>
            </div>
            <div className="display num-mono text-4xl sm:text-5xl font-black leading-none whitespace-nowrap">
              <span className={isLive ? "text-primary" : ""}>{f.total_a}</span>
              <span className="mx-3 text-muted-foreground">·</span>
              <span className={isLive ? "text-primary" : ""}>{f.total_b}</span>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
              Aggregate score
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-4">
          {(f.rounds || []).map((r) => (
            <RoundCard key={r.round_number} r={r} teamA={f.team_a_name} teamB={f.team_b_name} target={f.target_score} />
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function RoundCard({ r, teamA, teamB, target }) {
  return (
    <section
      data-testid={`round-${r.round_number}`}
      className="rounded-sm border border-border bg-card"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="display text-lg font-black uppercase tracking-tight">
            Round {r.round_number}
          </span>
          <StatusBadge status={r.status} />
        </div>
        <div className="display num-mono text-lg font-black">
          {r.total_a} <span className="text-muted-foreground">·</span> {r.total_b}
        </div>
      </header>
      <ul className="divide-y divide-border">
        {(r.matches || []).map((m) => (
          <li key={m.id} className="px-4 py-3" data-testid={`match-row-${m.id}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Match {m.match_number}
              </span>
              <StatusBadge status={m.status} />
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <PlayerLine players={m.team_a_players} team={teamA} align="right" />
              <div className="display num-mono text-3xl font-black text-center">
                {m.score_a}<span className="mx-1 text-muted-foreground">·</span>{m.score_b}
              </div>
              <PlayerLine players={m.team_b_players} team={teamB} align="left" />
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.min(100, (Math.max(m.score_a, m.score_b) / (target || 15)) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlayerLine({ players, team, align }) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{team}</div>
      <div className="text-xs leading-snug">
        {(players || []).length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          (players || []).map((p, idx) => (
            <span key={p.id}>
              {idx > 0 && <span className="text-muted-foreground"> · </span>}
              {titleCase(p.name)}
              {p.is_captain && (
                <span className="ml-1 text-[10px] font-bold text-primary">(C)</span>
              )}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
