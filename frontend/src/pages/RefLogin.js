import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Delete } from "lucide-react";
import { endpoints, setAuth, getRole } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function RefLogin() {
  const nav = useNavigate();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getRole() === "referee" || getRole() === "admin") {
      nav("/referee", { replace: true });
    }
  }, [nav]);

  const submit = async (finalPin) => {
    if (finalPin.length !== 4) return;
    setLoading(true);
    try {
      const res = await endpoints.refereeLogin(finalPin);
      setAuth(res);
      toast.success(`Welcome, ${res.name || "Referee"}`);
      nav("/referee", { replace: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Invalid PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const press = (d) => {
    setPin((prev) => {
      const next = (prev + d).slice(0, 4);
      if (next.length === 4) submit(next);
      return next;
    });
  };
  const back = () => setPin((p) => p.slice(0, -1));

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
        <div className="display text-sm font-bold uppercase tracking-[0.28em] text-muted-foreground">
          Referee Access
        </div>
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between px-4 py-6">
        <div className="pt-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-sm bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 3.5v17M3.5 12h17" />
            </svg>
          </div>
          <h1 className="mt-4 display text-3xl font-black uppercase tracking-tight">
            Enter PIN
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">4-digit referee code</p>

          <div className="mt-6 flex items-center justify-center gap-3" data-testid="pin-display">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-14 w-12 rounded-sm border-2 flex items-center justify-center display num-mono text-3xl font-black ${
                  pin[i]
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {pin[i] ? "•" : ""}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pb-8">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <Key key={d} label={d} onClick={() => press(d)} testid={`pin-key-${d}`} disabled={loading} />
          ))}
          <div />
          <Key label="0" onClick={() => press("0")} testid="pin-key-0" disabled={loading} />
          <button
            onClick={back}
            data-testid="pin-key-back"
            disabled={loading}
            className="h-16 rounded-sm border border-border bg-card text-muted-foreground tap-feedback no-select flex items-center justify-center hover:text-destructive"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Key({ label, onClick, testid, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className="h-16 rounded-sm border border-border bg-card display text-3xl font-black tap-feedback no-select disabled:opacity-50 hover:border-primary/60"
    >
      {label}
    </button>
  );
}
