import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

export default function FixtureCard({ f }) {
  const isLive = f.status === "live";
  return (
    <Link
      to={`/fixture/${f.id}`}
      data-testid={`fixture-card-${f.id}`}
      className="group relative block overflow-hidden rounded-sm border border-border bg-card hover:border-primary/60"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <StatusBadge status={f.status} />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Court {f.court_number} · Wk {f.week_number}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4">
        <div className="text-right">
          <div className="display text-2xl font-black uppercase tracking-tight leading-none">
            {f.team_a_name}
          </div>
        </div>
        <div className="text-center">
          <div className="num display num-mono text-4xl font-black leading-none">
            <span className={isLive ? "text-primary" : ""}>{f.total_a}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className={isLive ? "text-primary" : ""}>{f.total_b}</span>
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            {f.matches_completed}/{f.matches_total} matches
          </div>
        </div>
        <div className="text-left">
          <div className="display text-2xl font-black uppercase tracking-tight leading-none">
            {f.team_b_name}
          </div>
        </div>
      </div>
    </Link>
  );
}
