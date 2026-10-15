import assert from "node:assert/strict";
const base = process.env.PTAT_TEST_URL || "http://localhost:3010";
const password = process.env.PTAT_DEMO_PASSWORD || "UatDemo!2026";
let count = 0;
async function req(path, body, cookie) {
  const r = await fetch(base + "/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
function eq(a, b) {
  assert.equal(a, b);
  count++;
}
async function login(email, p = password) {
  const r = await req("auth/login", { email, password: p });
  eq(r.status, 200);
  return r.cookie;
}
const admin = await login("admin@ptat.local"),
  lead = await login("lead@ptat.local"),
  tester = await login("tester@ptat.local");
const initial = (await req("admin", undefined, admin)).data;
const requestOperation = initial.operations.find((o) => o.id === "requests");
eq(
  (
    await req(
      "manage",
      {
        type: "operation.save",
        payload: {
          ...requestOperation,
          path: "/requests/{requestId}",
          parameters: [{ name: "requestId", required: true }],
          source: "Qvantel request-status resource",
          enabled: true,
        },
      },
      admin,
    )
  ).status,
  200,
);
eq((await req("admin", undefined, tester)).status, 403);
const inaccessible = initial.subscribers.find(
  (s) =>
    s.owner !== "tester" &&
    !(s.assignedUsers || []).includes("tester") &&
    s.enabled &&
    s.approval === "approved" &&
    s.environment !== "Production",
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Test",
        method: "GET",
        path:
          "/subscriptions/" +
          (inaccessible?.subscriptionId || "unregistered") +
          "/balances",
      },
      tester,
    )
  ).status,
  403,
);
const roleId = "ReadOnly-" + Date.now(),
  email = "governance-" + Date.now() + "@example.com";
eq(
  (
    await req(
      "manage",
      {
        type: "subscriber.save",
        payload: {
          name: "Duplicate subscription alias test",
          msisdn: "01977777777",
          subscriptionId: "1001",
          environment: "Test",
          assignedUsers: [],
          enabled: true,
          remarks: "Test alias rejection",
          tags: [],
        },
      },
      tester,
    )
  ).status,
  400,
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Test",
        method: "POST",
        path: "/subscriptions/1001/relationships/products",
        body: {
          data: {
            type: "products",
            id: "P123",
            relationships: {
              subscription: { data: { type: "subscriptions", id: 1004 } },
            },
          },
        },
        confirmed: true,
      },
      lead,
    )
  ).status,
  403,
);
eq(
  (await req("auth/register", { name: "Governance Tester", email, password }))
    .status,
  201,
);
eq((await req("auth/login", { email, password })).status, 400);
let state = (await req("admin", undefined, admin)).data;
const member = state.users.find((u) => u.email === email);
eq(
  (
    await req(
      "manage",
      {
        type: "role.save",
        payload: {
          id: roleId,
          name: roleId,
          pages: [
            "Overview",
            "API portal",
            "Bundle verification",
            "Product explorer",
            "Batch Report",
            "AI BSS Assistant",
            "Test MSISDNs",
            "My account",
          ],
          permissions: ["bss.read"],
        },
      },
      admin,
    )
  ).status,
  200,
);
eq(
  (
    await req(
      "manage",
      {
        type: "user.update",
        payload: {
          id: member.id,
          name: member.name,
          role: roleId,
          status: "active",
        },
      },
      admin,
    )
  ).status,
  200,
);
let reader = await login(email);
const seed = initial.subscribers.find((s) => s.id === "1001");
const payload = {
  id: seed.id,
  name: seed.name,
  msisdn: seed.msisdn,
  subscriptionId: seed.subscriptionId,
  environment: "Test",
  owner: seed.owner,
  assignedUsers: [member.id, "tester"],
  enabled: seed.enabled,
  remarks: seed.remarks,
  tags: seed.tags,
};
eq(
  (await req("manage", { type: "subscriber.save", payload }, lead)).status,
  200,
);
eq(
  (await req("workspace", undefined, reader)).data.subscribers.some(
    (s) => s.id === "1001",
  ),
  true,
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Test",
        method: "GET",
        path: "/subscriptions/1001/balances",
      },
      reader,
    )
  ).status,
  200,
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Test",
        method: "POST",
        path: "/subscriptions/1001/relationships/products",
        body: { data: { type: "products", id: "P123" } },
        confirmed: true,
      },
      reader,
    )
  ).status,
  403,
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Test",
        method: "GET",
        path: "/subscriptions/1004/balances",
      },
      reader,
    )
  ).status,
  403,
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Test",
        method: "GET",
        path: "/subscriptions/1001/../1004/balances",
      },
      reader,
    )
  ).status,
  400,
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Test",
        method: "GET",
        path: "/subscriptions/1001/%2e%2e/1004/balances",
      },
      reader,
    )
  ).status,
  400,
);
const good = await req(
  "bundle/verify",
  {
    environment: "Test",
    csv: "MSISDN,ProductCode,Offer,DA\n01900000001,Bundle1,1001|1002|1003,101#V|102#V|103#S",
  },
  reader,
);
eq(good.status, 200);
eq(good.data.report.results[0].status, "OK");
eq(good.data.report.results[0].checks.length, 7);
const bad = await req(
  "bundle/verify",
  { environment: "Test", csv: "01900000001,Bundle1,9999,101#D" },
  reader,
);
eq(bad.data.report.results[0].status, "NOT OK");
eq(bad.data.report.results[0].checks.filter((c) => !c.ok).length, 2);
eq(
  (
    await req(
      "bundle/verify",
      {
        environment: "Test",
        csv: "01900000001,Bundle1,,\n01900000004,Bundle1,,",
      },
      reader,
    )
  ).status,
  403,
);
eq(
  (
    await req(
      "manage",
      { type: "subscriber.save", payload: { ...payload, assignedUsers: [] } },
      reader,
    )
  ).status,
  403,
);
eq(
  (
    await req(
      "manage",
      {
        type: "settings.save",
        payload: { ...initial.settings, sharingEnabled: false },
      },
      admin,
    )
  ).status,
  200,
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Test",
        method: "GET",
        path: "/subscriptions/1001/balances",
      },
      reader,
    )
  ).status,
  403,
);
await req(
  "manage",
  { type: "settings.save", payload: initial.settings },
  admin,
);
eq(
  (
    await req(
      "manage",
      {
        type: "role.save",
        payload: { id: "Admin", name: "Admin", pages: [], permissions: [] },
      },
      admin,
    )
  ).status,
  400,
);
eq(
  (
    await req(
      "manage",
      {
        type: "user.update",
        payload: {
          id: "admin",
          name: "Admin",
          role: "Tester",
          status: "active",
        },
      },
      admin,
    )
  ).status,
  400,
);
const number = "019" + String(Date.now()).slice(-8);
const production = await req(
  "manage",
  {
    type: "subscriber.save",
    payload: {
      name: "Approval fixture",
      msisdn: number,
      subscriptionId: "approval-" + Date.now(),
      environment: "Production",
      assignedUsers: [],
      enabled: true,
      remarks: "Automated validation",
      tags: [],
    },
  },
  lead,
);
eq(production.status, 200);
eq(production.data.result.approval, "pending");
const prodConfig = initial.environments.find((e) => e.id === "Production");
await req(
  "manage",
  {
    type: "environment.save",
    payload: { ...prodConfig, mode: "simulated", enabled: true, auth: "none" },
  },
  admin,
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Production",
        method: "GET",
        path:
          "/subscriptions/" +
          production.data.result.subscriptionId +
          "/balances",
      },
      lead,
    )
  ).status,
  403,
);
await req(
  "manage",
  {
    type: "subscriber.approve",
    payload: { id: production.data.result.id, approval: "approved" },
  },
  admin,
);
eq(
  (
    await req(
      "bss/request",
      {
        environment: "Production",
        method: "GET",
        path:
          "/subscriptions/" +
          production.data.result.subscriptionId +
          "/balances",
      },
      lead,
    )
  ).status,
  200,
);
const changed = await req(
  "manage",
  {
    type: "subscriber.save",
    payload: {
      name: "Approval fixture",
      id: production.data.result.id,
      msisdn: number,
      subscriptionId: "changed-" + Date.now(),
      environment: "Production",
      assignedUsers: [],
      enabled: true,
      remarks: "Changed target",
      tags: [],
    },
  },
  lead,
);
eq(changed.data.result.approval, "pending");
await req("manage", { type: "environment.save", payload: prodConfig }, admin);
const plan = await req(
  "assistant/plan",
  { environment: "Test", prompt: "Check balances for 01900000001" },
  reader,
);
eq(plan.status, 200);
eq(
  (
    await req(
      "assistant/plans/" + plan.data.plan.id + "/execute",
      { confirmed: true },
      reader,
    )
  ).status,
  200,
);
eq(
  (
    await req(
      "assistant/plans/" + plan.data.plan.id + "/execute",
      { confirmed: true },
      reader,
    )
  ).status,
  409,
);
const mutation = await req(
  "assistant/plan",
  { environment: "Test", prompt: "disable sharing" },
  admin,
);
eq(mutation.status, 200);
eq((await req("admin", undefined, admin)).data.settings.sharingEnabled, true);
eq(
  (
    await req(
      "assistant/plans/" + mutation.data.plan.id + "/execute",
      { confirmed: false },
      admin,
    )
  ).status,
  400,
);
eq(
  (
    await req(
      "assistant/plans/" + mutation.data.plan.id + "/execute",
      { confirmed: true },
      admin,
    )
  ).status,
  200,
);
eq((await req("admin", undefined, admin)).data.settings.sharingEnabled, false);
await req(
  "manage",
  { type: "settings.save", payload: initial.settings },
  admin,
);
const purchasePlan = await req(
  "assistant/plan",
  { environment: "Test", prompt: "Purchase P123 for 01900000001" },
  lead,
);
eq(purchasePlan.status, 200);
const purchaseExecution = await req(
  "assistant/plans/" + purchasePlan.data.plan.id + "/execute",
  { confirmed: true },
  lead,
);
eq(purchaseExecution.status, 200);
eq(
  purchaseExecution.data.result.some(
    (r) => r.completed === true && r.polls.length > 0,
  ),
  true,
);
eq(
  (
    await req(
      "bss/request",
      { environment: "Test", method: "GET", path: "/requests/unknown-receipt" },
      lead,
    )
  ).status,
  403,
);
const token = await req(
  "manage",
  { type: "user.reset", payload: { id: member.id } },
  admin,
);
eq(token.data.result.token.length, 64);
const nextPassword = "ChangedFixture!2026";
eq(
  (
    await req("auth/reset", {
      email,
      token: token.data.result.token,
      password: nextPassword,
    })
  ).status,
  200,
);
eq(
  (
    await req("auth/reset", {
      email,
      token: token.data.result.token,
      password: nextPassword,
    })
  ).status,
  400,
);
eq((await req("workspace", undefined, reader)).status, 401);
reader = await login(email, nextPassword);
eq(
  (
    await req(
      "auth/password",
      { currentPassword: nextPassword, password },
      reader,
    )
  ).status,
  200,
);
eq((await req("workspace", undefined, reader)).status, 401);
await req(
  "manage",
  {
    type: "subscriber.save",
    payload: { ...payload, assignedUsers: seed.assignedUsers || [] },
  },
  admin,
);
console.log(
  `Enterprise HTTP passed: ${count} assertions. MySQL accounts/approval, custom RBAC, sharing, fail-closed proxy, every offer/DA, Production approval reset, confirmed assistant, one-time recovery and password/session revocation.`,
);
