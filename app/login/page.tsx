"use client";
import { useState } from "react";
import { ArrowRight, ShieldCheck, Layers3, FlaskConical } from "lucide-react";
export default function Login() {
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
        <small>Product Testing & Automation Toolkit · v0.1</small>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="badge amber">SIMULATED UAT</span>
          <h2>Welcome to your workspace</h2>
          <p className="muted">Sign in to plan your next test campaign.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email, password }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                window.location.href = "/";
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </label>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to PTAT"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="demo-note">
            <b>Local demonstration accounts</b>
            <p>
              Test Lead: lead@ptat.local
              <br />
              Tester: tester@ptat.local
              <br />
              Auditor: auditor@ptat.local
            </p>
            <p>
              Development password: <code>UatDemo!2026</code>
              <br />A configured PTAT_DEMO_PASSWORD overrides this default.
            </p>
            <small>
              Uses simulated subscribers and BSS responses. No live purchases.
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}
