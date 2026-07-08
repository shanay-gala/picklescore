import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import FixtureCard from "@/components/FixtureCard";
import { endpoints } from "@/lib/api";
import { useLive } from "@/lib/useLive";

export default function GamesPage() {
  const [fixtures, setFixtures] = useState([]);
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [fs, st] = await Promise.all([
        endpoints.fixtures(),
        endpoints.tournamentStatus(),
      ]);
      setFixtures(fs);
      setWeek(st.current_week);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useLive(() => { load(); });

  const groups = {
    live: fixtures.filter((f) => f.status === "live"),
    scheduled: fixtures.filter((f) => f.status === "scheduled"),
    completed: fixtures.filter((f) => f.status === "completed"),
  };

  return (
    <div className="app-shell">
      <AppHeader week={week} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        <SectionTitle count={groups.live.length}>Live now</SectionTitle>
        {groups.live.length === 0 ? (
          <EmptyLine text="No live fixtures. Check back soon." />
        ) : (
          <div className="grid gap-3">
            {groups.live.map((f) => <FixtureCard key={f.id} f={f} />)}
          </div>
        )}

        <SectionTitle count={groups.scheduled.length} className="mt-8">
          Upcoming
        </SectionTitle>
        {groups.scheduled.length === 0 ? (
          <EmptyLine text="No fixtures scheduled." />
        ) : (
          <div className="grid gap-3">
            {groups.scheduled.map((f) => <FixtureCard key={f.id} f={f} />)}
          </div>
        )}

        <SectionTitle count={groups.completed.length} className="mt-8">
          Results
        </SectionTitle>
        {groups.completed.length === 0 ? (
          <EmptyLine text="No completed fixtures yet." />
        ) : (
          <div className="grid gap-3">
            {groups.completed.map((f) => <FixtureCard key={f.id} f={f} />)}
          </div>
        )}

        {loading && <EmptyLine text="Loading…" />}

        <div className="mt-10 flex items-center justify-center">
          <Link
            to="/ref"
            data-testid="ref-link"
            className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground hover:text-primary"
          >
            Referee access
          </Link>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function SectionTitle({ children, count, className = "" }) {
  return (
    <div className={`mb-3 flex items-baseline justify-between ${className}`}>
      <h2 className="display text-xl font-black uppercase tracking-tight">
        {children}
      </h2>
      <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground num-mono">
        {count}
      </span>
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
