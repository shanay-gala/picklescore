import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Undo2, Pause, Play, Flag } from "lucide-react";
import { endpoints, getRole } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { titleCase } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";

export default function RefereeMatch() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const initial = location.state?.match || null;
  const needsStart = !!location.state?.needsStart;
  const [m, setM] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!getRole()) nav("/ref", { replace: true }); }, [nav]);

  const load = async () => {
    try {
      setM(await endpoints.match(id));
    } catch (err) {
      void err;
    }
  };
  // If we arrived with optimistic state, skip the immediate fetch — the
  // WebSocket will push the confirmed state once the backend acknowledges
  // the start (usually 1-2s later). Otherwise fetch immediately.
  useEffect(() => {
    if (initial && needsStart) return;  // scoring UI renders instantly, WS reconciles
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useLive((msg) => {
    if (!msg) return;
    if (msg.type === "fixture_changed" && msg.match_id && msg.match_id !== id) return;
    load();
  });

  const doScore = async (side) => {
    if (busy || !m || m.status !== "live") return;
    setBusy(true);
    const attempt = async () => endpoints.score(id, side);
    try {
      let updated;
      try {
        updated = await attempt();
      } catch (e1) {
        const detail = e1?.response?.data?.detail || "";
        // Race: user tapped before the background start-match POST landed.
        // Wait a beat and try once more.
        if (/must be live/i.test(detail)) {
          await new Promise((r) => setTimeout(r, 500));
          updated = await attempt();
        } else {
          throw e1;
        }
      }
      setM(updated);
      if (updated.status === "completed") {
        toast.success(`${side === "a" ? updated.team_a_name : updated.team_b_name} wins the match`);
      }
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const doUndo = async () => {
    setBusy(true);
    try { setM(await endpoints.undo(id)); }
    catch (e) { toast.error(e?.response?.data?.detail || "Nothing to undo"); }
    finally { setBusy(false); }
  };
  const doPause = async () => {
    try { setM(await endpoints.pauseMatch(id)); toast.info("Paused"); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const doResume = async () => {
    try { setM(await endpoints.resumeMatch(id)); toast.info("Resumed"); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const doFinish = async () => {
    try { setM(await endpoints.finishMatch(id)); toast.success("Match finished"); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  if (!m) return (
    <div className="min-h-[100dvh] flex flex-col bg-background no-select">
      <div className="border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Loading match…
          </span>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 animate-pulse">
        <div className="border-r border-border bg-muted/40 flex items-center justify-center">
          <div className="display num-mono text-8xl font-black leading-none text-muted-foreground/30">0</div>
        </div>
        <div className="bg-muted/40 flex items-center justify-center">
          <div className="display num-mono text-8xl font-black leading-none text-muted-foreground/30">0</div>
        </div>
      </div>
    </div>
  );

  const target = m.target_score || 15;
  const isLive = m.status === "live";
  const isPaused = m.status === "paused";
  const isDone = m.status === "completed";

  const teamANames = (m.team_a_players || []).map((p) => titleCase(p.name)).join(" · ");
  const teamBNames = (m.team_b_players || []).map((p) => titleCase(p.name)).join(" · ");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background no-select">
      {/* Top control bar - Safe zone: undo/pause/finish */}
      <div className="border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-3 py-2">
          <Link
            to={`/referee/fixture/${m.fixture_id}`}
            data-testid="back-to-fixture"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:border-primary/60"
          >
            <ArrowLeft className="h-3 w-3" /> Fixture
          </Link>
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>R{m.round_number}</span>·<span>M{m.match_number}</span>·<span>Court {m.court_number}</span>·<span>Target {target}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={doUndo}
              disabled={busy || isDone}
              data-testid="btn-undo"
              className="inline-flex h-9 items-center gap-1 rounded-sm border border-border bg-card px-2 text-xs font-bold uppercase tracking-widest hover:border-primary/60 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
            {isLive && (
              <button
                onClick={doPause}
                data-testid="btn-pause"
                className="inline-flex h-9 items-center gap-1 rounded-sm border border-border bg-card px-2 text-xs font-bold uppercase tracking-widest hover:border-primary/60"
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            )}
            {isPaused && (
              <button
                onClick={doResume}
                data-testid="btn-resume"
                className="inline-flex h-9 items-center gap-1 rounded-sm border border-border bg-card px-2 text-xs font-bold uppercase tracking-widest hover:border-primary/60"
              >
                <Play className="h-3.5 w-3.5" /> Resume
              </button>
            )}
            {!isDone && (
              <button
                onClick={doFinish}
                data-testid="btn-finish"
                className="inline-flex h-9 items-center gap-1 rounded-sm border border-destructive bg-card px-2 text-xs font-bold uppercase tracking-widest text-destructive"
              >
                <Flag className="h-3.5 w-3.5" /> End
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Score display */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="grid grid-cols-2 border-b border-border">
          <div className="border-r border-border px-4 pt-4 pb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{m.team_a_name}</div>
            <div className="text-xs">{teamANames || "—"}</div>
          </div>
          <div className="px-4 pt-4 pb-2 text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{m.team_b_name}</div>
            <div className="text-xs">{teamBNames || "—"}</div>
          </div>
        </div>

        {/* Giant scoring tap targets */}
        <div className="grid flex-1 grid-cols-2">
          <button
            onClick={() => doScore("a")}
            disabled={!isLive || busy}
            data-testid="score-a-btn"
            className={`relative flex flex-col items-center justify-center border-r border-border tap-feedback ${
              isLive ? "bg-primary/10 hover:bg-primary/15" : "bg-card"
            } disabled:opacity-80`}
          >
            <div className={`display num-mono text-8xl md:text-9xl font-black leading-none ${isLive ? "text-primary" : ""}`}>
              {m.score_a}
            </div>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.35em] text-muted-foreground">
              Tap +1
            </div>
            <ProgressRail value={m.score_a} target={target} />
          </button>
          <button
            onClick={() => doScore("b")}
            disabled={!isLive || busy}
            data-testid="score-b-btn"
            className={`relative flex flex-col items-center justify-center tap-feedback ${
              isLive ? "bg-primary/10 hover:bg-primary/15" : "bg-card"
            } disabled:opacity-80`}
          >
            <div className={`display num-mono text-8xl md:text-9xl font-black leading-none ${isLive ? "text-primary" : ""}`}>
              {m.score_b}
            </div>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.35em] text-muted-foreground">
              Tap +1
            </div>
            <ProgressRail value={m.score_b} target={target} />
          </button>
        </div>

        {/* Bottom status bar */}
        <div className="border-t border-border bg-card px-4 py-2 text-center">
          {isDone ? (
            <span className="display text-lg font-black uppercase tracking-tight text-primary">
              {m.winner_team_id === m.team_a_id ? m.team_a_name : m.winner_team_id === m.team_b_id ? m.team_b_name : "Match"} · Completed
            </span>
          ) : isPaused ? (
            <span className="display text-lg font-black uppercase tracking-tight text-amber-500">Paused</span>
          ) : isLive ? (
            <span className="text-[11px] font-bold uppercase tracking-[0.35em] text-primary">
              <span className="live-dot mr-2 inline-block h-2 w-2 rounded-full bg-primary" />
              Live · First to {target}
            </span>
          ) : (
            <span className="text-[11px] font-bold uppercase tracking-[0.35em] text-muted-foreground">
              Waiting to start
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressRail({ value, target }) {
  const pct = Math.min(100, ((value || 0) / (target || 15)) * 100);
  return (
    <div className="absolute bottom-3 left-4 right-4 h-1 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}
