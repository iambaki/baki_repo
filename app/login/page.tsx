"use client";
import { useState } from "react";
import { ArrowRight, ShieldCheck, Layers3, FlaskConical } from "lucide-react";
export default function Login() {
  const [mode, setMode] = useState<"login" | "register" | "recover" | "reset">(
    "login",
  );
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("lead@ptat.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Layers3 size={24} />
          </span>
          <b>
            ptat<span className="brand-dot">.</span>
          </b>
        </div>
        <div>
          <div className="eyebrow">THE UAT WORKSPACE</div>
          <h1>
            Every purchase.
            <br />
            Every entitlement.
            <br />
            <em>Verified.</em>
          </h1>
          <p>
            Bring your BSS product testing into one controlled workspace. Plan,
            execute, and turn results into evidence.
          </p>
          <div className="login-features">
            <span>
              <ShieldCheck size={18} /> Controlled execution
            </span>
            <span>
              <FlaskConical size={18} /> Business-ready verification
            </span>
          </div>
        </div>
        <small>Product Testing & Automation Toolkit · v0.2</small>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="badge amber">BSS TESTING PORTAL</span>
          <h2>
            {mode === "login"
              ? "Welcome to your workspace"
              : mode === "register"
                ? "Request a portal account"
                : mode === "recover"
                  ? "Request password recovery"
                  : "Reset your password"}
          </h2>
          <p className="muted">Sign in to plan your next test campaign.</p>
          <div className="tabs wrap">
            {(["login", "register", "recover", "reset"] as const).map((m) => (
              <button
                key={m}
                className={mode === m ? "selected" : ""}
                onClick={() => {
                  setMode(m);
                  setError("");
                  setMessage("");
                  setPassword("");
                }}
              >
                {m === "login"
                  ? "Sign in"
                  : m === "register"
                    ? "Register"
                    : m === "recover"
                      ? "Recover account"
                      : "Reset password"}
              </button>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/auth/" + mode, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(
                    mode === "register"
                      ? { name, email, password }
                      : mode === "recover"
                        ? { email }
                        : mode === "reset"
                          ? { email, token, password }
                          : { email, password },
                  ),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                if (mode === "login") window.location.href = "/";
                else {
                  setMessage(data.message);
                  setPassword("");
                  setToken("");
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === "register" && (
              <label>
                Full name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
            )}
            {mode === "reset" && (
              <label>
                Administrator-issued reset token
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  minLength={64}
                  maxLength={64}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {mode !== "recover" && (
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={mode === "login" ? 1 : 10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </label>
            )}
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            {message && (
              <p role="status" className="success-text">
                {message}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Submitting…"
                : mode === "login"
                  ? "Sign in to PTAT"
                  : mode === "register"
                    ? "Submit registration"
                    : mode === "recover"
                      ? "Request administrator reset"
                      : "Set new password"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="demo-note">
            <b>Local demonstration accounts</b>
            <p>
              Admin: admin@ptat.local
              <br />
              Test Lead: lead@ptat.local
              <br />
              Tester: tester@ptat.local
              <br />
              Auditor: auditor@ptat.local
            </p>
            <p>
              Development password: <code>UatDemo!2026</code>
              <br />
              Initial passwords use PTAT_ADMIN_PASSWORD (or legacy
              PTAT_DEMO_PASSWORD) when configured.
            </p>
            <small>
              Test starts in simulator mode. Administrators control live
              connectivity.
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}
