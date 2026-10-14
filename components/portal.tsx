"use client";
import { useEffect, useState, useRef } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Database,
  FileCheck2,
  FlaskConical,
  Globe2,
  Layers3,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type { User, Product, Subscriber, Run, Plan, Audit } from "@/lib/types";
import { mask } from "@/lib/types";
import { registry as registryType } from "@/lib/catalog";
type Workspace = {
  user: User;
  products: Product[];
  subscribers: Subscriber[];
  runs: Run[];
  audit: Audit[];
  registry: typeof registryType;
  mode: string;
};
type Page =
  | "Overview"
  | "Test runs"
  | "Test MSISDNs"
  | "Product catalog"
  | "API registry"
  | "Environments"
  | "Audit trail";
const navigation = [
  {
    title: "WORKSPACE",
    items: [
      { name: "Overview", icon: LayoutDashboard },
      { name: "Test runs", icon: FlaskConical },
      { name: "Test MSISDNs", icon: Users },
      { name: "Product catalog", icon: Layers3 },
    ],
  },
  {
    title: "GOVERNANCE",
    items: [
      { name: "API registry", icon: Code2 },
      { name: "Environments", icon: Globe2 },
      { name: "Audit trail", icon: ShieldCheck },
    ],
  },
];
async function api(path: string, body?: unknown) {
  const r = await fetch(
    "/api/" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = await r.json();
  if (r.status === 401) {
    window.location.href = "/login";
    throw new Error("Session expired.");
  }
  if (!r.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function Status({ status }: { status: string }) {
  return (
    <span className={"status " + status.toLowerCase()}>
      {status === "PASS" || status === "Active" ? (
        <CheckCircle2 size={13} />
      ) : status === "FAIL" || status === "ERROR" ? (
        <XCircle size={13} />
      ) : (
        <Clock3 size={13} />
      )}{" "}
      {status === "PASS"
        ? "Passed"
        : status === "FAIL"
          ? "Failed"
          : status === "ERROR"
            ? "Error"
            : status === "PARTIAL"
              ? "Partial"
              : status}
    </span>
  );
}
function time(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });
}
export default function Portal() {
  const [initialTab, setInitialTab] = useState("Structured");
  const openTest = (tab = "Structured") => {
    setInitialTab(tab);
    setModal("test");
  };
  const [data, setData] = useState<Workspace>();
  const [page, setPage] = useState<Page>("Overview");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All results");
  const [modal, setModal] = useState<"test" | "subscriber" | "help" | null>(
    null,
  );
  const [selected, setSelected] = useState<Run>();
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    try {
      setData(await api("workspace"));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const dismiss = () => {
    setModal(null);
    setSelected(undefined);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  if (!data)
    return (
      <div className="boot">
        <Layers3 size={40} />
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <>
            <Loader2 className="spin" />
            <p>Opening your UAT workspace…</p>
          </>
        )}
      </div>
    );
  const readOnly = data.user.role === "Auditor";
  const results = data.runs.flatMap((r) => r.results);
  const passed = results.filter((r) => r.status === "PASS").length;
  const failures = results.filter((r) => r.status !== "PASS").length;
  const rate = results.length ? Math.round((passed / results.length) * 100) : 0;
  const runs = data.runs.filter(
    (r) =>
      (filter === "All results" || r.status === filter) &&
      [r.name, r.productId, r.id].some((v) =>
        v.toLowerCase().includes(search.toLowerCase()),
      ),
  );
  const runTable = (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>TEST RUN</th>
            <th>PRODUCT</th>
            <th>ENVIRONMENT</th>
            <th>MSISDNS</th>
            <th>RESULT</th>
            <th>STARTED · DHAKA</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {runs.slice(0, page === "Overview" ? 5 : 100).map((r) => (
            <tr
              key={r.id}
              onClick={() => setSelected(r)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSelected(r);
              }}
              aria-label={"View " + r.name}
            >
              <td>
                <div className="run-name">
                  <span className="table-icon">
                    <FlaskConical size={17} />
                  </span>
                  <div>
                    <b>{r.name}</b>
                    <small>
                      RUN-{r.id.slice(0, 6).toUpperCase()}{" "}
                      <span>· {r.source}</span>
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <span className="mono">{r.productId}</span>
              </td>
              <td>
                <span className="env-pill">
                  <i />
                  UAT
                </span>
              </td>
              <td>{r.results.length} subscribers</td>
              <td>
                <Status status={r.status} />
              </td>
              <td className="muted">{time(r.createdAt)}</td>
              <td>
                <ChevronRight size={16} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!runs.length && (
        <div className="empty">
          <FlaskConical size={28} />
          <h3>
            {search || filter !== "All results"
              ? "No matching test runs"
              : "Your first verified purchase starts here"}
          </h3>
          <p>
            {search || filter !== "All results"
              ? "Try another search or result filter."
              : "Create a test plan, review its steps, and execute it against the BSS simulator."}
          </p>
          {!readOnly && !search && filter === "All results" && (
            <button className="button secondary" onClick={() => openTest()}>
              <Plus size={16} />
              Create test run
            </button>
          )}
        </div>
      )}
    </div>
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Layers3 size={24} />
          </span>
          <b>
            ptat<span className="brand-dot">.</span>
          </b>
          <span className="brand-tag">UAT</span>
        </div>
        <button className="workspace-switch" onClick={() => setModal("help")}>
          <span className="workspace-avatar">BL</span>
          <span>
            <b>Banglalink</b>
            <small>Product assurance</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav>
          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-label">{group.title}</div>
              {group.items.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  className={"nav-item " + (page === name ? "active" : "")}
                  onClick={() => {
                    setPage(name as Page);
                    setSearch("");
                    setFilter("All results");
                  }}
                >
                  <Icon size={19} />
                  {name}
                  {name === "Test runs" && data.runs.length > 0 && (
                    <span className="nav-count">{data.runs.length}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-health">
            <span className="health-dot" />
            <div>
              <b>Simulator connected</b>
              <small>No live BSS traffic</small>
            </div>
          </div>
          <button className="nav-item" onClick={() => setModal("help")}>
            <CircleHelp size={18} />
            Help & documentation
            <ArrowUpRight size={14} />
          </button>
          <div className="user">
            <div className="avatar">
              {data.user.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div>
              <b>{data.user.name}</b>
              <small>{data.user.role}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await api("auth/logout", {});
                window.location.href = "/login";
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>{page}</span>
          </div>
          <div className="top-actions">
            <span className="mode">
              <span />
              Simulated UAT
            </span>
            <span className="separator" />
            <button
              className="icon-button"
              aria-label="Show recent activity"
              onClick={() => setPage("Audit trail")}
            >
              <Bell size={19} />
              {data.audit.length > 0 && <i className="notification-dot" />}
            </button>
            <div className="avatar small">
              {data.user.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">PRODUCT ASSURANCE WORKSPACE</div>
              <h1>{page === "Overview" ? "Testing overview" : page}</h1>
              <p>
                {
                  {
                    Overview:
                      "A clear view of your product tests, verification, and UAT readiness.",
                    "Test runs":
                      "Plan, execute, and inspect every product verification.",
                    "Test MSISDNs":
                      "Your registered subscribers, ownership, and testing eligibility.",
                    "Product catalog":
                      "Expected entitlements are the source of truth for verification.",
                    "API registry":
                      "Approved operations mapped to the supplied Qvantel BSS contract.",
                    Environments:
                      "Keep test execution inside a controlled environment.",
                    "Audit trail": "A traceable record of workspace activity.",
                  }[page]
                }
              </p>
            </div>
            {!readOnly && (page === "Overview" || page === "Test runs") && (
              <button className="button primary" onClick={() => openTest()}>
                <Plus size={18} />
                New test run
              </button>
            )}
            {page === "Test MSISDNs" && !readOnly && (
              <button
                className="button primary"
                onClick={() => setModal("subscriber")}
              >
                <Plus size={17} />
                Register MSISDN
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="stats">
                <Stat
                  label="Total test runs"
                  value={String(data.runs.length)}
                  note="Across your UAT workspace"
                  icon={<FlaskConical size={20} />}
                  color="purple"
                />
                <Stat
                  label="Verification pass rate"
                  value={rate + "%"}
                  note={
                    results.length
                      ? passed + " of " + results.length + " subscribers passed"
                      : "Waiting for your first run"
                  }
                  icon={<CheckCircle2 size={20} />}
                  color="green"
                />
                <Stat
                  label="Needs attention"
                  value={String(failures)}
                  note="Failed or incomplete verifications"
                  icon={<Activity size={20} />}
                  color="orange"
                />
                <Stat
                  label="Available test MSISDNs"
                  value={String(
                    data.subscribers.filter((s) => s.status === "Active")
                      .length,
                  )}
                  note="Active subscribers owned by you"
                  icon={<Users size={20} />}
                  color="blue"
                />
              </div>
              <div className="overview-grid">
                <section className="panel readiness">
                  <div className="panel-title">
                    <div>
                      <h2>Verification at a glance</h2>
                      <p>Every entitlement. One complete picture.</p>
                    </div>
                    <span className="badge neutral">THIS WORKSPACE</span>
                  </div>
                  <div className="verification-content">
                    <div
                      className="donut"
                      style={{
                        background: `conic-gradient(#7c5ce7 0 ${rate}%, #f0edf8 ${rate}% 100%)`,
                      }}
                    >
                      <div>
                        <strong>
                          {rate}
                          <span>%</span>
                        </strong>
                        <small>PASS RATE</small>
                      </div>
                    </div>
                    <div className="verification-list">
                      {[
                        "Package",
                        "Balance delta (BDT)",
                        "Dedicated account",
                        "Service",
                      ].map((name) => {
                        const checks = results.flatMap((r) =>
                          r.checks.filter((c) => c.name === name),
                        );
                        const good = checks.filter((c) => c.passed).length;
                        return (
                          <div key={name}>
                            <span>
                              <span className="check-dot">
                                <Check size={11} />
                              </span>
                              {name === "Balance delta (BDT)"
                                ? "Balance verification"
                                : name === "Package"
                                  ? "Product activation"
                                  : name === "Dedicated account"
                                    ? "Dedicated accounts"
                                    : "Service provisioning"}
                            </span>
                            <b>
                              {checks.length
                                ? Math.round((good / checks.length) * 100) + "%"
                                : "—"}
                            </b>
                          </div>
                        );
                      })}
                      <div className="legend">
                        <span>
                          <i className="purple-dot" />
                          Verified
                        </span>
                        <span>
                          <i className="gray-dot" />
                          Pending / issues
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="quick-panel">
                  <span className="sparkle-box">
                    <Sparkles size={23} />
                  </span>
                  <span className="badge ai">PROMPT TO PLAN</span>
                  <h2>
                    Describe it.
                    <br /> We’ll plan the test.
                  </h2>
                  <p>
                    Turn a business request into a validated purchase and
                    verification workflow.
                  </p>
                  <button
                    className="button white"
                    disabled={readOnly}
                    onClick={() => openTest("Prompt")}
                  >
                    Create with a prompt
                    <ArrowRight size={16} />
                  </button>
                  <small>
                    <ShieldCheck size={13} />
                    Review every plan before execution
                  </small>
                </section>
              </div>
            </>
          )}
          {(page === "Overview" || page === "Test runs") && (
            <section className="panel recent">
              <div className="panel-title">
                <div>
                  <h2>
                    {page === "Overview" ? "Recent test runs" : "All test runs"}
                    <span className="count">{data.runs.length}</span>
                  </h2>
                  <p>
                    Purchase outcomes and verification evidence, in one place.
                  </p>
                </div>
                {page === "Overview" && (
                  <button
                    className="text-button"
                    onClick={() => setPage("Test runs")}
                  >
                    View all runs
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
              <div className="table-toolbar">
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search test runs"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, run ID, or product…"
                  />
                </div>
                <div className="select-wrap">
                  <SlidersHorizontal size={15} />
                  <select
                    aria-label="Filter results"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option>All results</option>
                    {["PASS", "FAIL", "PARTIAL", "ERROR"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              {runTable}
              <div className="table-footer">
                <span>{runs.length} test runs · All results are simulated</span>
                <span>
                  <ShieldCheck size={13} /> Evidence captured automatically
                </span>
              </div>
            </section>
          )}
          {page === "Overview" && (
            <div className="bottom-grid">
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h2>Workspace activity</h2>
                    <p>The latest actions across your tests.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPage("Audit trail")}
                  >
                    View audit
                    <ArrowRight size={15} />
                  </button>
                </div>
                <div className="activity-list">
                  {data.audit.slice(0, 3).map((a) => (
                    <div key={a.id}>
                      <span className="activity-icon">
                        <FileCheck2 size={17} />
                      </span>
                      <div>
                        <b>{a.action}</b>
                        <small>
                          {a.actor} <span>· {time(a.timestamp)}</span>
                        </small>
                      </div>
                      <span className="activity-line" />
                    </div>
                  ))}
                  {!data.audit.length && (
                    <p className="muted">No activity yet.</p>
                  )}
                </div>
              </section>
              <section className="getting-started">
                <span className="book-icon">
                  <BookOpen size={22} />
                </span>
                <div>
                  <h3>A better way to run UAT</h3>
                  <p>
                    Start with registered subscribers, review a plan, then
                    verify the complete purchase lifecycle.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setModal("help")}
                  >
                    Explore the workflow
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </section>
            </div>
          )}
          {page === "Product catalog" && (
            <div className="catalog-grid">
              {data.products.map((p) => (
                <section className="panel product-card" key={p.id}>
                  <div className="product-top">
                    <span className="product-icon">
                      <Layers3 size={23} />
                    </span>
                    <span className="badge neutral">{p.category}</span>
                  </div>
                  <small className="mono muted">{p.id} · DEMO PRODUCT</small>
                  <h2>{p.name}</h2>
                  <div className="price">
                    ৳{p.price}
                    <small> / {p.days} days</small>
                  </div>
                  <div className="entitlements">
                    {[
                      ["Data", p.dataGB + " GB"],
                      ["Voice", p.minutes + " min"],
                      ["Dedicated account", p.da],
                      ["Service", p.service],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <b>{value}</b>
                      </div>
                    ))}
                  </div>
                  <button
                    className="button secondary full"
                    disabled={readOnly}
                    onClick={() => openTest()}
                  >
                    Create purchase test
                    <ArrowRight size={15} />
                  </button>
                </section>
              ))}
            </div>
          )}
          {page === "Test MSISDNs" && (
            <section className="panel">
              <div className="info-strip">
                <ShieldCheck size={17} />
                Only active MSISDNs owned by you are eligible for execution.
                Numbers shown here are synthetic.
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>MSISDN</th>
                      <th>SUBSCRIPTION ID</th>
                      <th>ENVIRONMENT</th>
                      <th>STATUS</th>
                      <th>TAGS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscribers.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <b className="mono">{s.msisdn}</b>
                        </td>
                        <td className="mono muted">{s.id}</td>
                        <td>
                          <span className="env-pill">
                            <i />
                            UAT
                          </span>
                        </td>
                        <td>
                          <Status status={s.status} />
                        </td>
                        <td>
                          {s.tags.map((t) => (
                            <span className="tag" key={t}>
                              {t}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.subscribers.length && (
                  <div className="empty">
                    <Users />
                    <h3>No subscribers assigned</h3>
                    <p>
                      Auditors can inspect reports but cannot own or execute
                      tests.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
          {page === "API registry" && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h2>BSS operation registry</h2>
                  <p>Qvantel BSSAPI · November 27, 2019 · JSON:API 1.0</p>
                </div>
                <span className="badge amber">SIMULATOR ONLY</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>OPERATION</th>
                      <th>METHOD</th>
                      <th>REGISTERED PATH</th>
                      <th>REFERENCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.registry.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <b>{r.name}</b>
                        </td>
                        <td>
                          <span className={"method " + r.method.toLowerCase()}>
                            {r.method}
                          </span>
                        </td>
                        <td>
                          <code>{r.path}</code>
                        </td>
                        <td className="muted">{r.section}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="info-strip">
                <BookOpen size={17} />
                Paths come from the uploaded documentation. Demo product IDs and
                entitlement fields are not live contract fixtures.
              </div>
            </section>
          )}
          {page === "Environments" && (
            <div className="environment-grid">
              <section className="panel env-card">
                <div className="product-top">
                  <span className="product-icon">
                    <Globe2 size={24} />
                  </span>
                  <span className="status active">
                    <CheckCircle2 size={13} />
                    Available
                  </span>
                </div>
                <h2>UAT sandbox</h2>
                <p className="muted">
                  An isolated, deterministic BSS simulation.
                </p>
                <div className="entitlements">
                  <div>
                    <span>Adapter</span>
                    <b>Simulated BSS</b>
                  </div>
                  <div>
                    <span>Execution policy</span>
                    <b>Owned MSISDNs only</b>
                  </div>
                  <div>
                    <span>Max batch size</span>
                    <b>50 subscribers</b>
                  </div>
                  <div>
                    <span>Purchase retries</span>
                    <b>Disabled</b>
                  </div>
                  <div>
                    <span>Persistence</span>
                    <b>Local SQLite</b>
                  </div>
                </div>
                <div className="info-strip">
                  <ShieldCheck size={16} />
                  No production endpoint or credentials configured.
                </div>
              </section>
              <section className="panel env-card">
                <span className="badge neutral">INTEGRATION CHECKLIST</span>
                <h2>Connect your enterprise UAT</h2>
                <p className="muted">
                  Required before enabling real BSS execution.
                </p>
                <ol className="checklist">
                  <li>Confirm current API version and deployed schemas.</li>
                  <li>Approve the UAT base URL and TLS trust.</li>
                  <li>
                    Configure scoped credentials through a secret manager.
                  </li>
                  <li>Map subscriptions, charging units, and entitlements.</li>
                  <li>Implement bounded polling and reconciliation.</li>
                  <li>Run contract tests, SSO and security review.</li>
                </ol>
              </section>
            </div>
          )}
          {page === "Audit trail" && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h2>Execution audit</h2>
                  <p>
                    Persisted workspace events. Local demo storage is not a
                    tamper-proof enterprise audit system.
                  </p>
                </div>
                <span className="badge neutral">
                  {data.audit.length} EVENTS
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ACTION</th>
                      <th>ACTOR</th>
                      <th>TARGET</th>
                      <th>TIME · DHAKA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <div className="run-name">
                            <ShieldCheck size={16} />
                            <b>{a.action}</b>
                          </div>
                        </td>
                        <td>{a.actor}</td>
                        <td className="mono muted">{a.target.slice(0, 32)}</td>
                        <td className="muted">{time(a.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <footer className="footer">
            <span>PTAT · Product Testing & Automation Toolkit</span>
            <span>
              <span className="health-dot" />
              Controlled execution. Traceable results.
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {modal === "test" && (
        <TestModal
          data={data}
          initialTab={initialTab}
          close={dismiss}
          onRun={async (run: Run) => {
            dismiss();
            await refresh();
            setSelected(run);
            setToast("Test completed. Verification evidence captured.");
          }}
        />
      )}
      {modal === "subscriber" && (
        <Modal
          title="Register test MSISDN"
          subtitle="Add a synthetic subscriber to your UAT registry."
          close={dismiss}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              const form = new FormData(e.currentTarget);
              try {
                await api("subscribers", {
                  msisdn: form.get("msisdn"),
                  tags: String(form.get("tags") || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                dismiss();
                await refresh();
                setToast("Test MSISDN registered.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            <label>
              MSISDN
              <input
                name="msisdn"
                pattern="01[0-9]{9}"
                maxLength={11}
                placeholder="01900000006"
                required
              />
            </label>
            <label>
              Tags <span className="muted">(comma separated)</span>
              <input name="tags" placeholder="Prepaid, Regression" />
            </label>
            <div className="info-strip">
              Environment: UAT · Owner: {data.user.name}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={dismiss}
              >
                Cancel
              </button>
              <button className="button primary" disabled={loading}>
                {loading ? "Registering…" : "Register MSISDN"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Your product assurance workflow"
          subtitle="A working foundation for controlled business UAT."
          close={dismiss}
        >
          <div className="help-steps">
            {[
              [
                "01",
                "Register subscribers",
                "Use synthetic MSISDNs owned by your account. Restricted subscribers cannot execute.",
              ],
              [
                "02",
                "Review the plan",
                "Choose a product and expected entitlements. Prompt input creates the same validated plan as the structured form.",
              ],
              [
                "03",
                "Execute and verify",
                "The simulator captures pre-state, purchases, polls, and compares seven product expectations.",
              ],
              [
                "04",
                "Collect evidence",
                "Open a run for per-subscriber results, masked request/response evidence, and CSV export.",
              ],
            ].map(([n, t, d]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="info-strip">
            Prompt planning currently uses a deterministic parser. An LLM and
            live BSS adapter are not connected.
          </div>
          <button className="button primary full" onClick={dismiss}>
            Got it
            <Check size={16} />
          </button>
        </Modal>
      )}
      {selected && (
        <Modal
          title={selected.name}
          subtitle={
            "RUN-" +
            selected.id.slice(0, 6).toUpperCase() +
            " · " +
            time(selected.createdAt) +
            " · Simulated UAT"
          }
          close={dismiss}
          wide
        >
          <div className="result-summary">
            <Status status={selected.status} />
            <span>
              {selected.productId} · {selected.results.length} subscribers ·{" "}
              {selected.durationMs} ms
            </span>
            <a
              className="button secondary"
              href={"/api/runs/" + selected.id + "/report"}
            >
              <ArrowDownToLine size={15} />
              Export CSV
            </a>
          </div>
          {selected.results.map((r, index) => (
            <section className="result-section" key={index}>
              <div className="result-heading">
                <b className="mono">{r.msisdn}</b>
                <Status status={r.status} />
              </div>
              {r.error && <div className="error">{r.error}</div>}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>VERIFICATION</th>
                      <th>EXPECTED</th>
                      <th>ACTUAL</th>
                      <th>OUTCOME</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.checks.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td className="mono">{c.expected}</td>
                        <td className="mono">{c.actual}</td>
                        <td>
                          <Status status={c.passed ? "PASS" : "FAIL"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="evidence">
                <summary>
                  <Code2 size={15} />
                  Request & response evidence{" "}
                  <span>{r.evidence.length} operations</span>
                </summary>
                {r.evidence.map((ev, i) => (
                  <div className="evidence-entry" key={i}>
                    <div>
                      <span className={"method " + ev.method.toLowerCase()}>
                        {ev.method}
                      </span>
                      <b>{ev.operation}</b>
                      <span className="badge neutral">{ev.status}</span>
                    </div>
                    <code>{ev.path}</code>
                    <small>{ev.timestamp}</small>
                    <pre>
                      {JSON.stringify(
                        { request: ev.request, response: ev.response },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                ))}
              </details>
            </section>
          ))}
          <div className="info-strip">
            <Database size={15} />
            All evidence is generated by the simulator; it does not prove live
            BSS behavior.
          </div>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
  color,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <section className="stat">
      <div>
        <span>{label}</span>
        <span className={"stat-icon " + color}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </section>
  );
}
function Modal({
  title,
  subtitle,
  close,
  children,
  wide = false,
}: {
  title: string;
  subtitle: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const nodes = ref.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input, select, textarea, a[href], summary, [tabindex="0"]',
            );
            if (!nodes?.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
function TestModal({
  data,
  initialTab,
  close,
  onRun,
}: {
  data: Workspace;
  initialTab: string;
  close: () => void;
  onRun: (r: Run) => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [name, setName] = useState("All-in-one pack verification");
  const [productId, setProduct] = useState("P123");
  const [ids, setIds] = useState<string[]>(
    data.subscribers
      .filter((s) => s.status === "Active")
      .slice(0, 2)
      .map((s) => s.id),
  );
  const [scenario, setScenario] = useState("normal");
  const [prompt, setPrompt] = useState(
    "Purchase P123 for " +
      data.subscribers
        .filter((s) => s.status === "Active")
        .slice(0, 2)
        .map((s) => s.msisdn)
        .join(" and ") +
      ". Verify balance, package, dedicated account and services.",
  );
  const [plan, setPlan] = useState<Plan>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const product = data.products.find(
    (p) => p.id === (plan?.productId || productId),
  )!;
  return (
    <Modal
      title={plan ? "Review execution plan" : "Create a test run"}
      subtitle={
        plan
          ? "Validated and ready. Execution uses the local BSS simulator."
          : "Purchase a product and verify its complete entitlement lifecycle."
      }
      close={close}
    >
      {!plan ? (
        <>
          <div className="tabs">
            {["Structured", "Prompt"].map((t) => (
              <button
                key={t}
                className={tab === t ? "selected" : ""}
                onClick={() => {
                  setTab(t);
                  setError("");
                }}
              >
                {t === "Prompt" ? (
                  <Sparkles size={15} />
                ) : (
                  <ListChecks size={15} />
                )}{" "}
                {t === "Prompt" ? "Business prompt" : "Structured test"}
              </button>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const response = await api(
                  "plans",
                  tab === "Prompt"
                    ? { prompt }
                    : {
                        name,
                        productId,
                        subscriberIds: ids,
                        environment: "UAT",
                        source: "Structured",
                        scenario,
                      },
                );
                setPlan(response.plan);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tab === "Prompt" ? (
              <>
                <label>
                  What would you like to test?
                  <textarea
                    rows={5}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={2000}
                    required
                  />
                </label>
                <div className="info-strip">
                  <Sparkles size={17} />
                  Deterministic intent parser · Purchase one registered product
                  for explicit MSISDNs. No arbitrary API execution.
                </div>
              </>
            ) : (
              <>
                <label>
                  Test run name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    minLength={3}
                    maxLength={100}
                    required
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Product
                    <select
                      value={productId}
                      onChange={(e) => setProduct(e.target.value)}
                    >
                      {data.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id} · {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Environment
                    <select disabled>
                      <option>UAT · Simulated</option>
                    </select>
                  </label>
                </div>
                <div className="field-label">
                  Select your test MSISDNs <span>{ids.length} selected</span>
                </div>
                <div className="subscriber-picker">
                  {data.subscribers.map((s) => (
                    <label
                      key={s.id}
                      className={s.status !== "Active" ? "disabled" : ""}
                    >
                      <input
                        type="checkbox"
                        checked={ids.includes(s.id)}
                        disabled={s.status !== "Active"}
                        onChange={(e) =>
                          setIds(
                            e.target.checked
                              ? [...ids, s.id]
                              : ids.filter((id) => id !== s.id),
                          )
                        }
                      />
                      <span className="mono">{s.msisdn}</span>
                      <span className="muted">
                        {s.status === "Active" ? s.tags[0] : "Restricted"}
                      </span>
                    </label>
                  ))}
                </div>
                <label className="import-label">
                  Import MSISDNs from CSV or text
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 65536) {
                        setError("Import must be under 64 KB.");
                        return;
                      }
                      const text = await file.text();
                      const numbers = text.match(/\b01\d{9}\b/g) || [];
                      const unique = [...new Set(numbers)];
                      const eligible = data.subscribers.filter(
                        (s) => s.status === "Active",
                      );
                      const matched = unique.map(
                        (n) => eligible.find((s) => s.msisdn === n)?.id,
                      );
                      if (!unique.length || matched.some((id) => !id)) {
                        setError(
                          "Import must contain only active MSISDNs owned by you. No subscribers were selected.",
                        );
                        return;
                      }
                      if (matched.length > 50) {
                        setError("Batch limit is 50 subscribers.");
                        return;
                      }
                      setIds(matched as string[]);
                      setImportNotice(
                        matched.length + " subscribers imported.",
                      );
                      setError("");
                    }}
                  />
                </label>
                {importNotice && <p className="success-text">{importNotice}</p>}
                <label>
                  Simulation scenario
                  <select
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                  >
                    <option value="normal">
                      Successful purchase & verification
                    </option>
                    <option value="balance-mismatch">
                      Balance mismatch on first subscriber
                    </option>
                    <option value="purchase-error">
                      Purchase failure on first subscriber
                    </option>
                  </select>
                </label>
              </>
            )}
            <div className="expectation">
              <div>
                <ShieldCheck size={16} />
                <b>Expected product state</b>
              </div>
              <p>
                ৳{product.price} balance deduction · {product.days} days ·{" "}
                {product.dataGB} GB · {product.minutes} minutes
              </p>
              <small>
                {product.da} · {product.service}
              </small>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={close}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || (tab === "Structured" && !ids.length)}
              >
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <ListChecks size={16} />
                )}
                Review test plan
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <div className="plan-meta">
            <span className="badge green">
              <ShieldCheck size={13} />
              POLICY VALIDATED
            </span>
            <span className="badge neutral">
              {plan.subscriberIds.length} SUBSCRIBERS
            </span>
            <span className="badge amber">SIMULATED</span>
          </div>
          <h3>{plan.name}</h3>
          <div className="plan-steps">
            {plan.steps.map((s, i) => (
              <div key={s}>
                <span>{i + 1}</span>
                <div>
                  <b>{s}</b>
                  {i === 0 && (
                    <small>
                      Role, owned subscribers, UAT environment, and product
                      allowlist checked.
                    </small>
                  )}
                </div>
                <Check size={15} />
              </div>
            ))}
          </div>
          <div className="expectation">
            <div>
              <Layers3 size={16} />
              <b>
                {product.id} · {product.name}
              </b>
            </div>
            <p>
              Expected delta: −৳{product.price} · {product.days} days ·{" "}
              {product.dataGB} GB · {product.minutes} min
            </p>
            <small>
              Scenario: {plan.scenario} · Each run starts from fresh simulated
              state.
            </small>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPlan(undefined)}
            >
              Back to setup
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const { run } = await api(
                    "plans/" + plan.id + "/execute",
                    {},
                  );
                  onRun(run);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <FlaskConical size={16} />
              )}
              Execute simulated test
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
