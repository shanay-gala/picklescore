import { statusTone } from "@/lib/format";

export default function StatusBadge({ status }) {
  const s = (status || "scheduled").toLowerCase();
  const isLive = s === "live";
  return (
    <span
      data-testid={`badge-status-${s}`}
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${statusTone(s)}`}
    >
      {isLive && <span className="live-dot h-1.5 w-1.5 rounded-full bg-current" />}
      {s === "scheduled" ? "Upcoming" : s}
    </span>
  );
}
