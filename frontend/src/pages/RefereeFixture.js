import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Play, Flag, Users } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import StatusBadge from "@/components/StatusBadge";
import { endpoints, getRole } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { titleCase } from "@/lib/format";

export default function RefereeFixture() {
  const { id } = useParams();
  const nav = useNavigate();
  const [f, setF] = useState(null);
  const [teams, setTeams] = useState([]);
  const [assignMatch, setAssignMatch] = useState(null);

  useEffect(() => { if (!getRole()) nav("/ref", { replace: true }); }, [nav]);

  const load = async () => {
    try {
      const [fx, ts] = await Promise.all([endpoints.fixture(id), endpoints.teams()]);
      setF(fx);
      setTeams(ts);
    } catch (err) {
      void err;
    }
  };
  useEffect(() => { load(); }, [id]);
  useLive((msg) => {
    if (msg?.type === "fixture_changed" && msg.fixture_id && msg.fixture_id !== id) return;
    load();
  });

  if (!f) return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-4 text-sm text-muted-foreground">Loading…</main>
    </div>
  );

  const teamPlayers = (teamId) =>
    (teams.find((t) => t.id === teamId)?.players || []);

  const startRound = async (rn) => {
    try { await endpoints.startRound(id, rn); toast.success(`Round ${rn} started`); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const completeRound = async (rn) => {
    try { await endpoints.completeRound(id, rn); toast.success(`Round ${rn} completed`); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const startMatch = (mid, matchObj) => {
    // Navigate INSTANTLY with an optimistic 'live' state so the scoring UI
    // renders sub-100ms. Fire the POST /start in the background; the scoring
    // page will reconcile via its own load() + WebSocket on arrival.
    const optimistic = {
      ...matchObj,
      status: "live",
      fixture_id: f.id,
      court_number: f.court_number,
      team_a_name: f.team_a_name,
      team_b_name: f.team_b_name,
    };
    nav(`/referee/match/${mid}`, { state: { match: optimistic, needsStart: true } });
    endpoints.startMatch(mid).catch((e) => {
      toast.error(e?.response?.data?.detail || "Cannot start");
    });
  };

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-4">
        <Link
          to="/referee"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground hover:text-primary"
          data-testid="back-to-referee"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>

        <section className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={f.status} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Court {f.court_number} · Target {f.target_score}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="display text-2xl font-black uppercase tracking-tight">
              {f.team_a_name} <span className="text-muted-foreground">vs</span> {f.team_b_name}
            </div>
            <div className="display num-mono text-3xl font-black">
              <span className="text-primary">{f.total_a}</span> · <span className="text-primary">{f.total_b}</span>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-4">
          {(f.rounds || []).map((r) => (
            <section
              key={r.round_number}
              data-testid={`ref-round-${r.round_number}`}
              className="rounded-sm border border-border bg-card"
            >
              <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="display text-lg font-black uppercase tracking-tight">
                    Round {r.round_number}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex items-center gap-2">
                  {r.status === "scheduled" && (
                    <button
                      onClick={() => startRound(r.round_number)}
                      data-testid={`start-round-${r.round_number}`}
                      className="inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-primary-foreground tap-feedback"
                    >
                      <Play className="h-3 w-3" /> Start
                    </button>
                  )}
                  {r.status === "live" && (
                    <button
                      onClick={() => completeRound(r.round_number)}
                      data-testid={`complete-round-${r.round_number}`}
                      className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest hover:border-primary/60 tap-feedback"
                    >
                      <Flag className="h-3 w-3" /> Complete
                    </button>
                  )}
                </div>
              </header>
              <ul className="divide-y divide-border">
                {(r.matches || []).map((m) => (
                  <li key={m.id} className="px-4 py-3" data-testid={`ref-match-${m.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Match {m.match_number}
                      </span>
                      <StatusBadge status={m.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{f.team_a_name}</div>
                        <div className="text-xs">
                          {(m.team_a_players || []).length
                            ? m.team_a_players.map((p) => titleCase(p.name)).join(" · ")
                            : <span className="text-muted-foreground">— not assigned —</span>}
                        </div>
                      </div>
                      <div className="display num-mono text-3xl font-black text-center">
                        {m.score_a}<span className="mx-1 text-muted-foreground">·</span>{m.score_b}
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{f.team_b_name}</div>
                        <div className="text-xs">
                          {(m.team_b_players || []).length
                            ? m.team_b_players.map((p) => titleCase(p.name)).join(" · ")
                            : <span className="text-muted-foreground">— not assigned —</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => setAssignMatch(m)}
                        data-testid={`assign-match-${m.id}`}
                        className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest hover:border-primary/60"
                      >
                        <Users className="h-3 w-3" /> Assign
                      </button>
                      {m.status !== "completed" && m.status !== "live" && (
                        <button
                          onClick={() => startMatch(m.id, m)}
                          data-testid={`start-match-${m.id}`}
                          className="inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-primary-foreground tap-feedback"
                        >
                          <Play className="h-3 w-3" /> Start match
                        </button>
                      )}
                      {(m.status === "live" || m.status === "paused") && (
                        <Link
                          to={`/referee/match/${m.id}`}
                          state={{ match: { ...m, fixture_id: f.id, court_number: f.court_number, team_a_name: f.team_a_name, team_b_name: f.team_b_name } }}
                          data-testid={`score-match-${m.id}`}
                          className="inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-primary-foreground tap-feedback"
                        >
                          Score →
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>

      {assignMatch && (
        <AssignSheet
          match={assignMatch}
          teamAName={f.team_a_name}
          teamBName={f.team_b_name}
          playersA={teamPlayers(f.team_a_id)}
          playersB={teamPlayers(f.team_b_id)}
          target={f.target_score}
          onClose={() => setAssignMatch(null)}
          onSaved={() => { setAssignMatch(null); load(); }}
        />
      )}
    </div>
  );
}

function AssignSheet({ match, teamAName, teamBName, playersA, playersB, target, onClose, onSaved }) {
  const [selA, setSelA] = useState(match.team_a_player_ids || []);
  const [selB, setSelB] = useState(match.team_b_player_ids || []);
  const [tgt, setTgt] = useState(match.target_score || target || 15);
  const [saving, setSaving] = useState(false);

  const toggle = (side, id) => {
    const setState = side === "a" ? setSelA : setSelB;
    const arr = side === "a" ? selA : selB;
    if (arr.includes(id)) setState(arr.filter((x) => x !== id));
    else if (arr.length < 2) setState([...arr, id]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await endpoints.updateMatch(match.id, {
        team_a_player_ids: selA,
        team_b_player_ids: selB,
        target_score: Number(tgt) || 15,
      });
      toast.success("Match updated");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="assign-sheet">
      <div className="w-full max-w-lg rounded-t-sm sm:rounded-sm border border-border bg-card p-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Assign players · R{match.round_number} · M{match.match_number}
            </div>
            <h2 className="display text-xl font-black uppercase tracking-tight">
              Pick 1 or 2 per side
            </h2>
          </div>
          <button
            onClick={onClose}
            data-testid="assign-close"
            className="rounded-sm border border-border px-2 py-1 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <RosterSelect team={teamAName} players={playersA} selected={selA} onToggle={(id) => toggle("a", id)} testPrefix="assign-a" />
          <RosterSelect team={teamBName} players={playersB} selected={selB} onToggle={(id) => toggle("b", id)} testPrefix="assign-b" />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Target score
          </label>
          <input
            type="number"
            min={1}
            value={tgt}
            onChange={(e) => setTgt(e.target.value)}
            data-testid="assign-target"
            className="w-20 rounded-sm border border-border bg-background px-2 py-1 text-sm num-mono"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-sm border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            data-testid="assign-save"
            className="rounded-sm bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground tap-feedback disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RosterSelect({ team, players, selected, onToggle, testPrefix }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {team} · {selected.length}/2 max
      </div>
      <ul className="grid gap-1.5">
        {players.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button
                onClick={() => onToggle(p.id)}
                data-testid={`${testPrefix}-${p.id}`}
                className={`w-full text-left rounded-sm border px-2.5 py-1.5 text-xs ${
                  on
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/60"
                }`}
              >
                {titleCase(p.name)}
                {p.is_captain && <span className="ml-1 inline-block rounded-sm bg-primary/15 px-1 text-[11px] font-black uppercase leading-tight text-primary" style={{ fontFeatureSettings: '"case" on' }}>(C)</span>}
                <span className="ml-1 text-[9px] uppercase tracking-widest">
                  {p.category === "advance" ? "· ADV" : "· BEG"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
