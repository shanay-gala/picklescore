import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Delete, ShieldCheck } from "lucide-react";
import { endpoints, setAuth, getToken, getRole, clearAuth } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function AdminLogin() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const expired = params.get("expired") === "1";

  useEffect(() => {
    let cancelled = false;
    const t = getToken();
    if (!t) return () => { cancelled = true; };
    endpoints.auth_me()
      .then((me) => {
        if (cancelled) return;
        if (me?.role === "admin") {
          nav("/referee/admin", { replace: true });
        }
      })
      .catch(() => { clearAuth(); });
    return () => { cancelled = true; };
  }, [nav]);

  const submit = async (finalPin) => {
    if (finalPin.length !== 4) return;
    setLoading(true);
    try {
      const res = await endpoints.adminLogin(finalPin);
      setAuth(res);
      toast.success(`Welcome, ${res.name || "Admin"}`);
      nav("/referee/admin", { replace: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Invalid admin PIN");
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
          Admin Access
        </div>
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between px-4 py-6">
        <div className="pt-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-sm bg-primary text-primary-foreground">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="mt-4 display text-3xl font-black uppercase tracking-tight">
            Admin PIN
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">4-digit tournament admin code</p>

          {expired && (
            <div
              data-testid="admin-session-expired-banner"
              className="mx-auto mt-4 max-w-xs rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-amber-500"
            >
              Session expired — please re-enter admin PIN
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3" data-testid="admin-pin-display">
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
            <Key key={d} label={d} onClick={() => press(d)} testid={`admin-pin-key-${d}`} disabled={loading} />
          ))}
          <div />
          <Key label="0" onClick={() => press("0")} testid="admin-pin-key-0" disabled={loading} />
          <button
            onClick={back}
            data-testid="admin-pin-key-back"
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
