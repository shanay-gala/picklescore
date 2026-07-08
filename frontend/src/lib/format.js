export function titleCase(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function statusTone(status) {
  switch ((status || "").toLowerCase()) {
    case "live":
      return "bg-primary text-primary-foreground";
    case "completed":
      return "bg-muted text-muted-foreground";
    case "paused":
      return "bg-amber-500 text-black";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}
