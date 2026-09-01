import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import StatusBadge from "@/components/StatusBadge";
import { endpoints, getRole } from "@/lib/api";
import { useLive } from "@/lib/useLive";

export default function RefereeAdmin() {
  const nav = useNavigate();
  const [teams, setTeams] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [court, setCourt] = useState(1);
  const [target, setTarget] = useState(15);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const role = getRole();
    if (!role) { nav("/admin", { replace: true }); return; }
    if (role !== "admin") { nav("/referee", { replace: true }); toast.error("Admin access required"); }
  }, [nav]);

  const load = async () => {
    const [ts, fs] = await Promise.all([endpoints.teams(), endpoints.fixtures()]);
    setTeams(ts);
    setFixtures(fs);
  };
  useEffect(() => { load(); }, []);
  useLive(() => load());

  const create = async (e) => {
    e.preventDefault();
    if (!teamA || !teamB || teamA === teamB) {
      toast.error("Pick two different teams");
      return;
    }
    setCreating(true);
    try {
      await endpoints.createFixture({
        team_a_id: teamA,
        team_b_id: teamB,
        court_number: Number(court) || 1,
        target_score: Number(target) || 15,
      });
      toast.success("Fixture created");
      setTeamA(""); setTeamB("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this fixture and all its matches?")) return;
    try { await endpoints.deleteFixture(id); toast.success("Deleted"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-4">
        <Link
          to="/referee"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground hover:text-primary"
          data-testid="back-to-referee-from-admin"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>

        <h1 className="display text-3xl font-black uppercase tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create fixtures. Each fixture spawns 4 rounds × 3 matches automatically.</p>

        <section className="mt-5 rounded-sm border border-border bg-card p-4">
          <h2 className="display text-lg font-black uppercase tracking-tight">New fixture</h2>
          <form className="mt-3 grid gap-3" onSubmit={create}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Team A">
                <select
                  value={teamA}
                  onChange={(e) => setTeamA(e.target.value)}
                  data-testid="new-team-a"
                  className="w-full rounded-sm border border-border bg-background px-2.5 py-2 text-sm"
                >
                  <option value="">Select team A</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Team B">
                <select
                  value={teamB}
                  onChange={(e) => setTeamB(e.target.value)}
                  data-testid="new-team-b"
                  className="w-full rounded-sm border border-border bg-background px-2.5 py-2 text-sm"
                >
                  <option value="">Select team B</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id === teamA}>{t.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Court">
                <input
                  type="number"
                  min={1}
                  value={court}
                  onChange={(e) => setCourt(e.target.value)}
                  data-testid="new-court"
                  className="w-full rounded-sm border border-border bg-background px-2.5 py-2 text-sm num-mono"
                />
              </Field>
              <Field label="Target score">
                <input
                  type="number"
                  min={1}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  data-testid="new-target"
                  className="w-full rounded-sm border border-border bg-background px-2.5 py-2 text-sm num-mono"
                />
              </Field>
            </div>
            <div>
              <button
                type="submit"
                disabled={creating}
                data-testid="create-fixture-btn"
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground tap-feedback disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" /> {creating ? "Creating…" : "Create fixture"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6">
          <h2 className="display text-xl font-black uppercase tracking-tight">All fixtures</h2>
          <div className="mt-3 grid gap-2">
            {fixtures.length === 0 && (
              <div className="rounded-sm border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No fixtures yet.
              </div>
            )}
            {fixtures.map((f) => (
              <div
                key={f.id}
                data-testid={`admin-fixture-${f.id}`}
                className="flex items-center justify-between rounded-sm border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={f.status} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Court {f.court_number} · Wk {f.week_number}
                    </span>
                  </div>
                  <div className="display text-base font-black uppercase tracking-tight">
                    {f.team_a_name} vs {f.team_b_name}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/referee/fixture/${f.id}`}
                    className="rounded-sm border border-border bg-card px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:border-primary/60"
                    data-testid={`admin-control-${f.id}`}
                  >
                    Control
                  </Link>
                  <button
                    onClick={() => remove(f.id)}
                    data-testid={`admin-delete-${f.id}`}
                    className="rounded-sm border border-border bg-card px-2 py-1.5 text-destructive hover:border-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
