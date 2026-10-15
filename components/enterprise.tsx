"use client";
import { useState, useEffect } from "react";
import {
  Plus,
  Save,
  ShieldCheck,
  Play,
  Sparkles,
  Download,
  Users,
  Search,
  X,
} from "lucide-react";
import type { User, Subscriber } from "@/lib/types";
import type {
  PageName,
  PortalSettings,
  Environment,
  Operation,
  RoleDefinition,
} from "@/lib/contracts";
import { pages } from "@/lib/contracts";
export type EnterpriseData = {
  user: User;
  access: { pages: PageName[]; permissions: string[] };
  subscribers: Subscriber[];
  environments: Environment[];
  operations: Operation[];
  settings: PortalSettings;
  directory: { id: string; name: string; email: string }[];
  storage: string;
};
async function api(path: string, body?: unknown) {
  const r = await fetch(
    "/api/" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (r.status === 401) window.location.href = "/login";
  if (!r.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function pathValue(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce(
      (v, k) =>
        v && typeof v === "object"
          ? (v as Record<string, unknown>)[k]
          : undefined,
      value,
    );
}
function pretty(v: unknown) {
  return JSON.stringify(v, null, 2);
}
function Value({ value }: { value: unknown }) {
  return (
    <>
      {value === undefined
        ? "—"
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value)}
    </>
  );
}
function JsonView({
  value,
  columns,
}: {
  value: unknown;
  columns?: Operation["columns"];
}) {
  const [view, setView] = useState("Business view");
  const raw = (value as { data?: unknown })?.data ?? value;
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? [raw]
      : [];
  return (
    <div className="json-view">
      <div className="tabs">
        <button
          className={view === "Business view" ? "selected" : ""}
          onClick={() => setView("Business view")}
        >
          Business view
        </button>
        <button
          className={view === "JSON" ? "selected" : ""}
          onClick={() => setView("JSON")}
        >
          JSON evidence
        </button>
      </div>
      {view === "JSON" ? (
        <pre>{pretty(value)}</pre>
      ) : rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {(
                  columns || [
                    { label: "Type", path: "type" },
                    { label: "ID", path: "id" },
                    { label: "Details", path: "attributes" },
                  ]
                ).map((c) => (
                  <th key={c.label}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {(
                    columns || [
                      { label: "Type", path: "type" },
                      { label: "ID", path: "id" },
                      { label: "Details", path: "attributes" },
                    ]
                  ).map((c) => (
                    <td key={c.label}>
                      <Value value={pathValue(r, c.path)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No available records.</p>
      )}
    </div>
  );
}
function EnvironmentPicker({
  data,
  value,
  change,
}: {
  data: EnterpriseData;
  value: string;
  change: (v: string) => void;
}) {
  return (
    <label>
      Environment
      <select value={value} onChange={(e) => change(e.target.value)}>
        {data.environments.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} · {e.mode}
            {e.enabled ? "" : " · Disabled"}
          </option>
        ))}
      </select>
    </label>
  );
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel enterprise-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={close}>
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
export default function Enterprise({
  page,
  data,
  refresh,
}: {
  page: PageName;
  data: EnterpriseData;
  refresh: () => Promise<void>;
}) {
  if (page === "API registry")
    return (
      <Panel title="BSS operation registry">
        <p className="muted">
          Registered operations, parameters and business views are controlled in
          Administration.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>OPERATION</th>
                <th>METHOD</th>
                <th>PATH</th>
                <th>STATUS</th>
                <th>SOURCE</th>
              </tr>
            </thead>
            <tbody>
              {data.operations.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>
                    <span className={"method " + o.method.toLowerCase()}>
                      {o.method}
                    </span>
                  </td>
                  <td>
                    <code>{o.path}</code>
                  </td>
                  <td>{o.enabled ? "Enabled" : "Disabled"}</td>
                  <td>{o.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  if (page === "Test MSISDNs")
    return <Registry data={data} refresh={refresh} />;
  if (page === "Environments")
    return (
      <div className="environment-grid">
        {data.environments.map((e) => (
          <Panel title={e.name} key={e.id}>
            <span className={"badge " + (e.enabled ? "green" : "neutral")}>
              {e.enabled ? "Enabled" : "Disabled"} · {e.mode}
            </span>
            <div className="entitlements">
              <div>
                <span>Base URL</span>
                <code>{e.baseUrl}</code>
              </div>
              <div>
                <span>Writes</span>
                <b>{e.writesEnabled ? "Enabled" : "Disabled"}</b>
              </div>
              <div>
                <span>Certificate validation</span>
                <b>{e.tlsVerify ? "Enabled" : "Bypass configured"}</b>
              </div>
              <div>
                <span>Authentication</span>
                <b>{e.auth}</b>
              </div>
              <div>
                <span>Storage</span>
                <b>{data.storage}</b>
              </div>
            </div>
            <p className="muted">
              Administrators control connectivity in Administration →
              Environments.
            </p>
          </Panel>
        ))}
      </div>
    );
  if (page === "Administration")
    return <Administration data={data} refresh={refresh} />;
  if (page === "API portal") return <ApiPortal data={data} />;
  if (page === "Subscriber 360") return <Subscriber360 data={data} />;
  if (
    ["Bundle verification", "Product explorer", "Batch Report"].includes(page)
  )
    return <BatchTools page={page} data={data} />;
  if (page === "AI BSS Assistant") return <Assistant data={data} />;
  if (page === "My account") return <Account />;
  return null;
}
function ApiPortal({ data }: { data: EnterpriseData }) {
  const [env, setEnv] = useState("Test"),
    [opId, setOp] = useState("balances"),
    [direct, setDirect] = useState(false),
    [method, setMethod] = useState("GET"),
    [path, setPath] = useState("/subscriptions/1001/balances"),
    [params, setParams] = useState<Record<string, string>>({
      subscriptionId: data.subscribers[0]?.subscriptionId || "1001",
    }),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [body, setBody] = useState("{}"),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      status: number;
      data: unknown;
      simulated: boolean;
      evidence: unknown;
    }>(),
    [busy, setBusy] = useState(false);
  const op = data.operations.find((o) => o.id === opId)!;
  const selectedMethod = direct ? method : op?.method;
  return (
    <>
      <Panel title="BSS operation console">
        <div className="tabs">
          <button
            className={!direct ? "selected" : ""}
            onClick={() => {
              setDirect(false);
              setConfirmed(false);
            }}
          >
            Operation form
          </button>
          <button
            className={direct ? "selected" : ""}
            onClick={() => {
              setDirect(true);
              setConfirmed(false);
            }}
          >
            Direct relative path
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              let target = path;
              if (!direct) {
                target = op.path.replace(/\{([A-Za-z]+)\}/g, (_, name) =>
                  encodeURIComponent(params[name] || ""),
                );
                const query = new URLSearchParams(
                  Object.entries(filters).filter(([, v]) => v),
                );
                if (query.size) target += "?" + query;
              }
              setResult(
                await api("bss/request", {
                  environment: env,
                  method: selectedMethod,
                  path: target,
                  ...(selectedMethod !== "GET"
                    ? { body: JSON.parse(body), confirmed }
                    : {}),
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <EnvironmentPicker data={data} value={env} change={setEnv} />
          {direct ? (
            <div className="form-grid">
              <label>
                Method
                <select
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value);
                    setConfirmed(false);
                  }}
                >
                  {["GET", "POST", "PATCH", "DELETE"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Relative BSS path
                <input
                  value={path}
                  onChange={(e) => {
                    setPath(e.target.value);
                    setConfirmed(false);
                  }}
                  required
                />
              </label>
            </div>
          ) : (
            <>
              <label>
                Registered operation
                <select
                  value={opId}
                  onChange={(e) => {
                    setOp(e.target.value);
                    const next = data.operations.find(
                      (o) => o.id === e.target.value,
                    )!;
                    setBody(pretty(next.bodyTemplate || {}));
                    setFilters({});
                    setConfirmed(false);
                  }}
                >
                  {data.operations
                    .filter((o) => o.enabled)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.method} · {o.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="form-grid">
                {op?.parameters.map((p) => (
                  <label key={p.name}>
                    {p.name}
                    <input
                      required={p.required}
                      value={params[p.name] || ""}
                      onChange={(e) => {
                        setParams({ ...params, [p.name]: e.target.value });
                        setConfirmed(false);
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="form-grid">
                {op?.filters.map((f) => (
                  <label key={f}>
                    {f}
                    <input
                      value={filters[f] || ""}
                      onChange={(e) => {
                        setFilters({ ...filters, [f]: e.target.value });
                        setConfirmed(false);
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="muted">
                <code>{op?.path}</code> · {op?.source}
              </p>
            </>
          )}
          {selectedMethod !== "GET" && (
            <>
              <label>
                JSON:API request body
                <textarea
                  rows={7}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm this {selectedMethod} request in {env}.
              </label>
            </>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button primary"
            disabled={busy || (selectedMethod !== "GET" && !confirmed)}
          >
            <Play size={15} />
            {busy ? "Requesting…" : "Execute request"}
          </button>
        </form>
      </Panel>
      {result && (
        <Panel title={"Response · HTTP " + result.status}>
          <span className="badge neutral">
            {result.simulated ? "SIMULATED" : "LIVE"} · {env}
          </span>
          <JsonView
            value={result.data}
            columns={!direct ? op.columns : undefined}
          />
          <details>
            <summary>Masked operation evidence</summary>
            <pre>{pretty(result.evidence)}</pre>
          </details>
        </Panel>
      )}
    </>
  );
}
function Registry({
  data,
  refresh,
}: {
  data: EnterpriseData;
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Subscriber | undefined>(),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const admin = data.access.permissions.includes("admin"),
    write = data.access.pages.includes("Test MSISDNs");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const start = (s?: Subscriber) => {
    setEditing(s);
    setForm(
      s
        ? {
            id: s.id,
            name: s.name,
            msisdn: s.msisdn,
            subscriptionId: s.subscriptionId,
            contractId: s.contractId || "",
            environment: s.environment === "UAT" ? "Test" : s.environment,
            owner: s.owner,
            assignedUsers: s.assignedUsers || [],
            enabled: s.enabled,
            remarks: s.remarks,
            tags: s.tags,
          }
        : {
            name: "",
            msisdn: "",
            subscriptionId: "",
            contractId: "",
            environment: "Test",
            owner: data.user.id,
            assignedUsers: [],
            enabled: true,
            remarks: "",
            tags: [],
          },
    );
    setError("");
    setOpen(true);
  };
  return (
    <>
      <div className="enterprise-toolbar">
        <p className="muted">
          Sharing {data.settings.sharingEnabled ? "enabled" : "disabled"} ·
          Production approval{" "}
          {data.settings.productionApprovalRequired ? "required" : "optional"}
        </p>
        {write && (
          <button className="button primary" onClick={() => start()}>
            <Plus size={15} />
            Add registration
          </button>
        )}
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Name / MSISDN",
                  "Environment",
                  "Owner",
                  "Assigned users",
                  "Status / Approval",
                  "Remarks",
                  "Actions",
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.subscribers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                    <div className="mono">{s.msisdn}</div>
                    <small>Subscription: {s.subscriptionId}</small>
                  </td>
                  <td>{s.environment === "UAT" ? "Test" : s.environment}</td>
                  <td>
                    {data.directory.find((u) => u.id === s.owner)?.name ||
                      s.owner}
                  </td>
                  <td>
                    {(s.assignedUsers || [])
                      .map(
                        (id) =>
                          data.directory.find((u) => u.id === id)?.name || id,
                      )
                      .join(", ") || "—"}
                  </td>
                  <td>
                    {s.enabled ? "Enabled" : "Disabled"} / {s.approval}
                  </td>
                  <td>{s.remarks}</td>
                  <td>
                    {write && (admin || s.owner === data.user.id) && (
                      <button
                        className="button secondary"
                        onClick={() => start(s)}
                      >
                        Edit / Share
                      </button>
                    )}
                    {admin && s.approval === "pending" && (
                      <>
                        <button
                          className="text-button"
                          onClick={async () => {
                            await api("manage", {
                              type: "subscriber.approve",
                              payload: { id: s.id, approval: "approved" },
                            });
                            await refresh();
                          }}
                        >
                          Approve
                        </button>
                        <button
                          className="text-button"
                          onClick={async () => {
                            await api("manage", {
                              type: "subscriber.approve",
                              payload: { id: s.id, approval: "rejected" },
                            });
                            await refresh();
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {open && (
        <Dialog
          title={editing ? "Edit and share MSISDN" : "Register MSISDN"}
          close={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("manage", { type: "subscriber.save", payload: form });
                setOpen(false);
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              {["name", "msisdn", "subscriptionId", "contractId"].map((k) => (
                <label key={k}>
                  {k}
                  <input
                    required={k !== "contractId"}
                    value={String(form[k] || "")}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </label>
              ))}
              <EnvironmentPicker
                data={data}
                value={String(form.environment)}
                change={(v) => setForm({ ...form, environment: v })}
              />
            </div>
            <label>
              Owner
              <select
                disabled={!admin}
                value={String(form.owner)}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              >
                {data.directory.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-label">
              Assigned users ·{" "}
              {data.settings.sharingEnabled
                ? "select multiple"
                : "sharing disabled"}
            </div>
            <div className="subscriber-picker">
              {data.directory
                .filter((u) => u.id !== form.owner)
                .map((u) => (
                  <label key={u.id}>
                    <input
                      type="checkbox"
                      disabled={
                        !data.settings.sharingEnabled &&
                        !(form.assignedUsers as string[]).includes(u.id)
                      }
                      checked={(form.assignedUsers as string[]).includes(u.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          assignedUsers: e.target.checked
                            ? [...(form.assignedUsers as string[]), u.id]
                            : (form.assignedUsers as string[]).filter(
                                (id) => id !== u.id,
                              ),
                        })
                      }
                    />
                    {u.name} · {u.email}
                  </label>
                ))}
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(form.enabled)}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              Enabled
            </label>
            <label>
              Remarks
              <textarea
                value={String(form.remarks)}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary" disabled={busy}>
              <Save size={15} />
              Save registration
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
function BatchTools({ page, data }: { page: PageName; data: EnterpriseData }) {
  const [env, setEnv] = useState("Test"),
    [csv, setCsv] = useState(
      "MSISDN,ProductCode,Offer,DA\n01900000001,Bundle1,1001|1002|1003,101#V|102#V|103#S",
    ),
    [numbers, setNumbers] = useState("01900000001"),
    [product, setProduct] = useState("P123"),
    [offers, setOffers] = useState(""),
    [das, setDas] = useState(""),
    [report, setReport] = useState<Record<string, unknown>>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<
      { id: string; createdAt: string; environment: string }[]
    >([]);
  useEffect(() => {
    if (page === "Batch Report")
      api("bundle/reports")
        .then((r) => setHistory(r.reports))
        .catch((e) => setError(e.message));
  }, [page]);
  const results = report?.results as
    | {
        msisdn: string;
        productCode: string;
        status: string;
        error?: string;
        checks: {
          kind: string;
          expected: string;
          actual: string;
          ok: boolean;
        }[];
        observations: Record<string, unknown[]>;
      }[]
    | undefined;
  return (
    <>
      <Panel
        title={
          page === "Product explorer"
            ? "Explore one product and its associated benefits"
            : "Product / offer / DA verification"
        }
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const text =
                page === "Bundle verification"
                  ? csv
                  : "MSISDN,ProductCode,Offer,DA\n" +
                    numbers
                      .split(",")
                      .map((n) => n.trim())
                      .filter(Boolean)
                      .map((n) => [n, product, offers, das].join(","))
                      .join("\n");
              const r = await api("bundle/verify", {
                environment: env,
                csv: text,
                page,
              });
              setReport(r.report);
              if (page === "Batch Report")
                setHistory((await api("bundle/reports")).reports);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <EnvironmentPicker data={data} value={env} change={setEnv} />
          {page === "Bundle verification" ? (
            <>
              <label>
                CSV / text batch
                <textarea
                  rows={7}
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                />
              </label>
              <label>
                Upload CSV or text
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 200000) {
                        setError("File exceeds 200 KB.");
                        return;
                      }
                      setCsv(await f.text());
                    }
                  }}
                />
              </label>
              <p className="muted">
                Offers: | separated · DA: ID#V (voice), ID#D (data), ID#S (SMS).
              </p>
            </>
          ) : (
            <>
              <label>
                {page === "Product explorer"
                  ? "MSISDN (or comma-separated batch)"
                  : "Comma-separated MSISDNs"}
                <input
                  required
                  value={numbers}
                  onChange={(e) => setNumbers(e.target.value)}
                />
              </label>
              <div className="form-grid">
                <label>
                  Product code
                  <input
                    required
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                  />
                </label>
                <label>
                  Expected offers (optional)
                  <input
                    value={offers}
                    onChange={(e) => setOffers(e.target.value)}
                    placeholder="1001|1002"
                  />
                </label>
                <label>
                  Expected DAs (optional)
                  <input
                    value={das}
                    onChange={(e) => setDas(e.target.value)}
                    placeholder="101#V|103#S"
                  />
                </label>
              </div>
            </>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            <Search size={15} />
            {busy ? "Verifying…" : "Verify batch"}
          </button>
        </form>
      </Panel>
      {results && (
        <Panel title="Per-record verification results">
          <a
            className="button secondary"
            href={"/api/bundle/reports/" + report!.id + "/export"}
          >
            <Download size={15} />
            Download JSON evidence
          </a>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>MSISDN</th>
                  <th>PRODUCT</th>
                  <th>OVERALL</th>
                  <th>MISSING / MISMATCHED</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.msisdn}</td>
                    <td>{r.productCode}</td>
                    <td>
                      <span
                        className={
                          "status " + (r.status === "OK" ? "pass" : "fail")
                        }
                      >
                        {r.status === "OK" ? "✓ OK" : "✕ NOT OK"}
                      </span>
                    </td>
                    <td>
                      {r.error ||
                        r.checks
                          .filter((c) => !c.ok)
                          .map(
                            (c) =>
                              c.kind + ": " + c.expected + " → " + c.actual,
                          )
                          .join("; ") ||
                        "All expectations matched"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {results.map((r, i) => (
            <details key={i}>
              <summary>{r.msisdn} · Product, offer and DA detail</summary>
              <table>
                <thead>
                  <tr>
                    <th>CHECK</th>
                    <th>EXPECTED</th>
                    <th>ACTUAL</th>
                    <th>RESULT</th>
                  </tr>
                </thead>
                <tbody>
                  {r.checks.map((c, j) => (
                    <tr key={j}>
                      <td>{c.kind}</td>
                      <td>{c.expected}</td>
                      <td>{c.actual}</td>
                      <td>{c.ok ? "OK" : "NOT OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {Object.entries(r.observations).map(([k, v]) => (
                <div key={k}>
                  <h3>{k} · Selected product only</h3>
                  <JsonView value={{ data: v }} />
                </div>
              ))}
            </details>
          ))}
        </Panel>
      )}
      {page === "Batch Report" && (
        <Panel title="Saved batch reports">
          {history.map((h) => (
            <div className="history-row" key={h.id}>
              <span>
                {h.environment} · {new Date(h.createdAt).toLocaleString()}
              </span>
              <a
                className="text-button"
                href={"/api/bundle/reports/" + h.id + "/export"}
              >
                Download evidence
              </a>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}
function Subscriber360({ data }: { data: EnterpriseData }) {
  const [env, setEnv] = useState("Test"),
    [identifier, setIdentifier] = useState("01900000001"),
    [result, setResult] = useState<{
      subscriber: Subscriber;
      tabs: {
        id: string;
        name: string;
        available: boolean;
        data?: unknown;
        error?: string;
      }[];
    }>(),
    [tab, setTab] = useState("subscription"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = result?.tabs.find((t) => t.id === tab);
  return (
    <>
      <Panel title="Find subscriber">
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              setResult(
                await api("subscriber360", { environment: env, identifier }),
              );
              setTab("subscription");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <EnvironmentPicker data={data} value={env} change={setEnv} />
          <label>
            MSISDN / subscription / contract ID
            <input
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Loading…" : "Search subscriber"}
          </button>
        </form>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </Panel>
      {result && (
        <div className="subscriber360">
          <aside className="panel subscriber-summary">
            <Users size={30} />
            <h2>{result.subscriber.name}</h2>
            <b className="mono">{result.subscriber.msisdn}</b>
            <div className="entitlements">
              {[
                ["Contract", result.subscriber.subscriptionId],
                ["Environment", env],
                [
                  "Owner",
                  data.directory.find((u) => u.id === result.subscriber.owner)
                    ?.name,
                ],
                ["Approval", result.subscriber.approval],
                ["Enabled", String(result.subscriber.enabled)],
              ].map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
            <p>{result.subscriber.remarks}</p>
          </aside>
          <Panel title={selected?.name || "Subscriber details"}>
            <div className="tabs wrap">
              {result.tabs.map((t) => (
                <button
                  className={tab === t.id ? "selected" : ""}
                  key={t.id}
                  onClick={() => setTab(t.id)}
                >
                  {t.name}
                  {t.available ? "" : " · Unavailable"}
                </button>
              ))}
            </div>
            {selected?.available ? (
              <JsonView value={selected.data} />
            ) : (
              <div className="info-strip">
                {selected?.error || "No configured data."}
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
function Assistant({ data }: { data: EnterpriseData }) {
  const [env, setEnv] = useState("Test"),
    [prompt, setPrompt] = useState("Check balances for 01900000001"),
    [plan, setPlan] = useState<{
      id: string;
      intent: unknown;
      requiresPassword: boolean;
      status: string;
    }>(),
    [password, setPassword] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [result, setResult] = useState<unknown>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Panel title="AI BSS Assistant · controlled planning">
        <span className="badge neutral">
          {data.settings.ai.mode === "rules"
            ? "DETERMINISTIC INTENT PARSER"
            : "CONFIGURED MODEL PROVIDER"}
        </span>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setConfirmed(false);
            setResult(undefined);
            try {
              setPlan(
                (await api("assistant/plan", { prompt, environment: env }))
                  .plan,
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <EnvironmentPicker data={data} value={env} change={setEnv} />
          <label>
            Business request or administration command
            <textarea
              required
              rows={5}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPlan(undefined);
              }}
            />
          </label>
          <p className="muted">
            Examples: Check balances for 01900000001 · Purchase P123 for
            01900000001 · Share 01900000001 with tester@ptat.local.
          </p>
          {data.access.permissions.includes("admin") && (
            <details>
              <summary>Administration prompt examples</summary>
              <pre>
                {
                  'create user "Jane Doe" jane@example.com role Tester\napprove user jane@example.com\nreset password for jane@example.com\nassign role Tester to jane@example.com\nenable sharing\ndisable production approval\nsave role {"id":"Business","name":"Business","pages":["Overview","API portal"],"permissions":["bss.read"]}\nUse save environment, save msisdn, save operation, save settings, delete role, or delete operation followed by the same JSON payload used in Administration.'
                }
              </pre>
            </details>
          )}
          <button className="button primary" disabled={busy}>
            <Sparkles size={16} />
            {busy ? "Planning…" : "Generate plan"}
          </button>
        </form>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </Panel>
      {plan && (
        <Panel title="Review planned changes">
          <pre>{pretty(plan.intent)}</pre>
          {plan.requiresPassword && (
            <label>
              New user password (collected separately)
              <input
                type="password"
                value={password}
                minLength={10}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm the displayed plan and its environment.
          </label>
          <button
            className="button primary"
            disabled={!confirmed || busy || plan.status !== "DRAFT"}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await api("assistant/plans/" + plan.id + "/execute", {
                  confirmed: true,
                  ...(plan.requiresPassword ? { password } : {}),
                });
                setResult(r.result);
                setPassword("");
                setPlan({ ...plan, status: "EXECUTED" });
              } catch (e) {
                setError((e as Error).message);
                setPlan({ ...plan, status: "ERROR" });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Play size={15} />
            Execute confirmed plan
          </button>
        </Panel>
      )}
      {result !== undefined && (
        <Panel title="Execution result">
          <pre>{pretty(result)}</pre>
        </Panel>
      )}
    </>
  );
}
type AdminState = {
  users: User[];
  roles: RoleDefinition[];
  environments: Environment[];
  operations: Operation[];
  settings: PortalSettings;
  subscribers: Subscriber[];
  recoveries: { userId: string; requestedAt: string }[];
};
function Administration({
  data,
  refresh,
}: {
  data: EnterpriseData;
  refresh: () => Promise<void>;
}) {
  const [state, setState] = useState<AdminState>(),
    [tab, setTab] = useState("Users"),
    [editor, setEditor] = useState<{ type: string; payload: unknown }>(),
    [text, setText] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);
  const reload = async () => {
    setState(await api("admin"));
    await refresh();
  };
  useEffect(() => {
    api("admin")
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);
  const edit = (type: string, payload: unknown) => {
    setEditor({ type, payload });
    setText(pretty(payload));
    setPassword("");
    setError("");
  };
  const action = async (type: string, payload: unknown) => {
    setError("");
    try {
      const r = await api("manage", { type, payload });
      if (r.result?.token) setToken(r.result.token);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!state)
    return <Panel title="Loading administration">{error || "Loading…"}</Panel>;
  return (
    <>
      <Panel title="Central administration">
        <div className="tabs wrap">
          {[
            "Users",
            "Roles",
            "Production approvals",
            "Environments",
            "API settings",
            "Policies / Verification / AI",
          ].map((t) => (
            <button
              key={t}
              className={tab === t ? "selected" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {token && (
          <div className="reset-token">
            <b>One-time password reset token · valid for 30 minutes</b>
            <code>{token}</code>
            <p>
              Give this token directly to the account owner. They enter it on
              the login page → Reset password. No email is sent.
            </p>
            <button className="text-button" onClick={() => setToken("")}>
              Dismiss token
            </button>
          </div>
        )}
        {tab === "Users" && (
          <>
            <button
              className="button primary"
              onClick={() =>
                edit("user.create", { name: "", email: "", role: "Tester" })
              }
            >
              <Plus size={15} />
              Create user
            </button>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>NAME / EMAIL</th>
                    <th>ROLE</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {state.users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <b>{u.name}</b>
                        <div>{u.email}</div>
                      </td>
                      <td>
                        {state.roles.find((r) => r.id === u.role)?.name ||
                          u.role}
                      </td>
                      <td>{u.status}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            edit("user.update", {
                              id: u.id,
                              name: u.name,
                              role: u.role,
                              status: u.status,
                            })
                          }
                        >
                          Edit / Assign role
                        </button>
                        {u.status === "pending" && (
                          <button
                            className="text-button"
                            onClick={() =>
                              action("user.update", {
                                id: u.id,
                                name: u.name,
                                role: u.role,
                                status: "active",
                              })
                            }
                          >
                            Approve
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Issue a one-time reset token for " +
                                  u.email +
                                  "?",
                              )
                            )
                              void action("user.reset", { id: u.id });
                          }}
                        >
                          Issue reset token
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Recovery requests</h3>
            {state.recoveries.map((r) => (
              <p key={r.userId}>
                {state.users.find((u) => u.id === r.userId)?.email} ·{" "}
                {r.requestedAt}
              </p>
            ))}
          </>
        )}
        {tab === "Roles" && (
          <>
            <button
              className="button primary"
              onClick={() =>
                edit("role.save", {
                  id: crypto.randomUUID(),
                  name: "New role",
                  pages: ["Overview", "My account"],
                  permissions: ["bss.read"],
                })
              }
            >
              <Plus size={15} />
              Create custom role
            </button>
            {state.roles.map((r) => (
              <div className="role-card" key={r.id}>
                <h3>{r.name}</h3>
                <p>{r.pages.join(" · ")}</p>
                <span>{r.permissions.join(", ")}</span>
                {r.id !== "Admin" && (
                  <>
                    <button
                      className="text-button"
                      onClick={() =>
                        edit("role.save", {
                          id: r.id,
                          name: r.name,
                          pages: r.pages,
                          permissions: r.permissions,
                        })
                      }
                    >
                      Rename / Edit permissions
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        if (window.confirm("Delete role " + r.name + "?"))
                          void action("role.delete", { id: r.id });
                      }}
                    >
                      Delete role
                    </button>
                  </>
                )}
              </div>
            ))}
          </>
        )}
        {tab === "Production approvals" && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>MSISDN</th>
                  <th>OWNER</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {state.subscribers
                  .filter((s) => s.environment === "Production")
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{s.msisdn}</td>
                      <td>{state.users.find((u) => u.id === s.owner)?.name}</td>
                      <td>{s.approval}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            action("subscriber.approve", {
                              id: s.id,
                              approval: "approved",
                            })
                          }
                        >
                          Approve
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            action("subscriber.approve", {
                              id: s.id,
                              approval: "rejected",
                            })
                          }
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "Environments" &&
          state.environments.map((e) => (
            <div className="role-card" key={e.id}>
              <h3>
                {e.name} · {e.enabled ? "Enabled" : "Disabled"}
              </h3>
              <code>{e.baseUrl}</code>
              <p>
                {e.mode} · {e.auth} · TLS verification{" "}
                {e.tlsVerify ? "on" : "bypassed"}
              </p>
              <button
                className="button secondary"
                onClick={() => edit("environment.save", e)}
              >
                Edit connectivity / TLS / authentication
              </button>
            </div>
          ))}
        {tab === "API settings" && (
          <>
            <button
              className="button primary"
              onClick={() =>
                edit("operation.save", {
                  id: "custom",
                  name: "Additional verification API",
                  method: "GET",
                  path: "/subscriptions/{subscriptionId}/services",
                  scope: "subscriber",
                  parameters: [{ name: "subscriptionId", required: true }],
                  filters: [],
                  source: "Administrator configured",
                  enabled: false,
                  columns: [{ label: "ID", path: "id" }],
                })
              }
            >
              Add operation
            </button>
            {state.operations.map((o) => (
              <div className="role-card" key={o.id}>
                <h3>{o.name}</h3>
                <code>
                  {o.method} {o.path}
                </code>
                <p>
                  {o.enabled ? "Enabled" : "Disabled"} · {o.scope}
                </p>
                <button
                  className="text-button"
                  onClick={() => edit("operation.save", o)}
                >
                  Edit parameters / filters / business view
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete registered operation " + o.id + "?",
                      )
                    )
                      void action("operation.delete", { id: o.id });
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </>
        )}
        {tab === "Policies / Verification / AI" && (
          <>
            <div className="policy-toggles">
              {[
                ["sharingEnabled", "Allow multi-user MSISDN sharing"],
                [
                  "productionApprovalRequired",
                  "Require Production MSISDN approval",
                ],
                ["registrationEnabled", "Allow account self-registration"],
              ].map(([key, label]) => (
                <label className="checkbox-label" key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(
                      state.settings[key as keyof PortalSettings],
                    )}
                    onChange={(e) =>
                      action("settings.save", {
                        ...state.settings,
                        [key]: e.target.checked,
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="muted">
              Configure batch limits, session duration, verification response
              mappings, DA units, and AI provider settings. Store credential
              values only in server environment variables.
            </p>
            <button
              className="button secondary"
              onClick={() => edit("settings.save", state.settings)}
            >
              Edit central configuration
            </button>
            <pre>{pretty(state.settings)}</pre>
          </>
        )}
      </Panel>
      {editor && (
        <Dialog
          title={"Configure " + editor.type}
          close={() => setEditor(undefined)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const payload = JSON.parse(text);
                await api("manage", {
                  type: editor.type,
                  payload:
                    editor.type === "user.create"
                      ? { ...payload, password }
                      : payload,
                });
                setEditor(undefined);
                await reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="muted">
              Edit the typed JSON configuration. Passwords and API credentials
              do not belong in this editor.
            </p>
            <label>
              Configuration JSON
              <textarea
                className="config-editor"
                rows={18}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            {editor.type === "role.save" && (
              <details>
                <summary>Available page names</summary>
                <p>{pages.join(", ")}</p>
                <p>
                  Permissions: bss.read, bss.write, bss.delete, reports.all.
                  Admin remains reserved.
                </p>
              </details>
            )}
            {editor.type === "user.create" && (
              <label>
                Initial password (separate)
                <input
                  type="password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary" disabled={busy}>
              <Save size={15} />
              Validate and save
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
function Account() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Panel title="Change password">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api("auth/password", {
              currentPassword: f.get("current"),
              password: f.get("password"),
            });
            window.location.href = "/login";
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <label>
          Current password
          <input name="current" type="password" required />
        </label>
        <label>
          New password
          <input name="password" type="password" minLength={10} required />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="button primary" disabled={busy}>
          Change password and sign out
        </button>
      </form>
    </Panel>
  );
}
