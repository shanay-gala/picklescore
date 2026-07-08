import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, Play, Flag, Settings, ChevronRight } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import StatusBadge from "@/components/StatusBadge";
import { endpoints, clearAuth, getRole, getName } from "@/lib/api";
import { useLive } from "@/lib/useLive";

export default function RefereeDashboard() {
  const nav = useNavigate();
  const [fixtures, setFixtures] = useState([]);
  const [week, setWeek] = useState(null);

  useEffect(() => {
    if (!getRole()) { nav("/ref", { replace: true }); }
  }, [nav]);

  const load = async () => {
    try {
      const [fs, st] = await Promise.all([
        endpoints.fixtures(),
        endpoints.tournamentStatus(),
      ]);
      setFixtures(fs);
      setWeek(st.current_week);
    } catch (e) {
      if (e?.response?.status === 401) {
        clearAuth();
        nav("/ref", { replace: true });
      }
    }
  };
  useEffect(() => { load(); }, []);
  useLive(() => load());

  const doStart = async (id) => {
    try { await endpoints.startFixture(id); toast.success("Fixture started"); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const doComplete = async (id) => {
    try { await endpoints.completeFixture(id); toast.success("Fixture completed"); } catch (e) { toast.error(e?.response?.data?.detail || "Cannot complete"); }
  };

  const logout = () => { clearAuth(); nav("/ref"); };

  return (
    <div className="app-shell">
      <AppHeader
        week={week}
        right={
          <div className="flex items-center gap-2">
            <Link
              to="/referee/admin"
              data-testid="admin-link"
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-[11px] font-bold uppercase tracking-widest hover:border-primary/60"
            >
              <Settings className="h-3.5 w-3.5" /> Admin
            </Link>
            <button
              onClick={logout}
              data-testid="logout-btn"
              className="inline-flex h-9 items-center justify-center rounded-sm border border-border bg-card px-2.5 text-destructive hover:border-destructive"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        }
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-4">
        <div className="flex items-baseline justify-between">
          <h1 className="display text-3xl font-black uppercase tracking-tight">Control</h1>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {getName() || "Referee"}
          </span>
        </div>

        <div className="mt-5 grid gap-3">
          {fixtures.length === 0 && (
            <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No fixtures yet. Create one in <Link to="/referee/admin" className="text-primary underline">Admin</Link>.
            </div>
          )}
          {fixtures.map((f) => (
            <div
              key={f.id}
              data-testid={`ref-fixture-${f.id}`}
              className="rounded-sm border border-border bg-card"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <StatusBadge status={f.status} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Court {f.court_number} · Wk {f.week_number}
                  </span>
                </div>
                <Link
                  to={`/fixture/${f.id}`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
                >
                  Public view <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="display text-xl font-black uppercase tracking-tight">
                    {f.team_a_name} <span className="text-muted-foreground">vs</span> {f.team_b_name}
                  </div>
                  <div className="display num-mono text-2xl font-black">
                    {f.total_a} · {f.total_b}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {f.matches_completed}/{f.matches_total} matches complete · {f.matches_live} live
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {f.status === "scheduled" && (
                    <button
                      onClick={() => doStart(f.id)}
                      data-testid={`start-fixture-${f.id}`}
                      className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 tap-feedback"
                    >
                      <Play className="h-3.5 w-3.5" /> Start fixture
                    </button>
                  )}
                  {f.status === "live" && (
                    <Link
                      to={`/referee/fixture/${f.id}`}
                      data-testid={`control-fixture-${f.id}`}
                      className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 tap-feedback"
                    >
                      Control rounds <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  {f.status === "live" && (
                    <button
                      onClick={() => doComplete(f.id)}
                      data-testid={`complete-fixture-${f.id}`}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-widest text-foreground hover:border-primary/60 tap-feedback"
                    >
                      <Flag className="h-3.5 w-3.5" /> Complete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
