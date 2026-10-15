import assert from "node:assert/strict";
const base = process.env.PTAT_TEST_URL || "http://localhost:3000";
const password = process.env.PTAT_DEMO_PASSWORD || "UatDemo!2026";
const request = async (path, body, cookie, origin = base) => {
  const response = await fetch(base + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, data: await response.json() };
};
let checks = 0;
function equal(actual, expected) {
  assert.equal(actual, expected);
  checks++;
}
const denied = await request("workspace");
equal(denied.response.status, 401);
const cross = await request(
  "auth/login",
  { email: "lead@ptat.local", password },
  undefined,
  "https://foreign.example",
);
equal(cross.response.status, 403);
const wrong = await request("auth/login", {
  email: "lead@ptat.local",
  password: "wrong",
});
equal(wrong.response.status, 401);
const login = await request("auth/login", {
  email: "lead@ptat.local",
  password,
});
equal(login.response.status, 200);
const cookie = login.response.headers.get("set-cookie").split(";")[0];
assert.ok(login.response.headers.get("set-cookie").includes("HttpOnly"));
checks++;
const workspace = await request("workspace", undefined, cookie);
equal(workspace.data.mode, "SIMULATED");
equal(workspace.data.products.length, 3);
const make = {
  name: "HTTP purchase smoke",
  productId: "P123",
  subscriberIds: ["1001", "1002"],
  environment: "UAT",
  scenario: "balance-mismatch",
  source: "Structured",
};
const ownership = await request(
  "plans",
  { ...make, subscriberIds: ["1004"] },
  cookie,
);
equal(ownership.response.status, 403);
const p = await request("plans", make, cookie);
equal(p.response.status, 201);
const executed = await request(`plans/${p.data.plan.id}/execute`, {}, cookie);
equal(executed.response.status, 201);
equal(executed.data.run.status, "FAIL");
equal(
  executed.data.run.results[0].checks.find(
    (c) => c.name === "Balance delta (BDT)",
  ).actual,
  "-319",
);
const replay = await request(`plans/${p.data.plan.id}/execute`, {}, cookie);
equal(replay.response.status, 400);
const report = await fetch(
  base + "/api/runs/" + executed.data.run.id + "/report",
  { headers: { Cookie: cookie } },
);
equal(report.status, 200);
const csv = await report.text();
assert.ok(
  csv.includes("SIMULATED") &&
    csv.includes("FAIL") &&
    !csv.includes("01900000001"),
);
checks++;
const prompt = await request(
  "plans",
  { prompt: "Purchase P124 for 01900000001" },
  cookie,
);
equal(prompt.response.status, 201);
const promptRun = await request(
  `plans/${prompt.data.plan.id}/execute`,
  {},
  cookie,
);
equal(promptRun.data.run.status, "PASS");
const auditorLogin = await request("auth/login", {
  email: "auditor@ptat.local",
  password,
});
const auditorCookie = auditorLogin.response.headers
  .get("set-cookie")
  .split(";")[0];
const readonly = await request("plans", make, auditorCookie);
equal(readonly.response.status, 403);
const testerLogin = await request("auth/login", {
  email: "tester@ptat.local",
  password,
});
const testerCookie = testerLogin.response.headers
  .get("set-cookie")
  .split(";")[0];
const forbiddenReport = await fetch(
  base + "/api/runs/" + executed.data.run.id + "/report",
  { headers: { Cookie: testerCookie } },
);
equal(forbiddenReport.status, 404);
const after = await request("workspace", undefined, cookie);
assert.ok(after.data.runs.some((r) => r.id === executed.data.run.id));
assert.ok(after.data.audit.some((a) => a.action === "Exported UAT report"));
checks += 2;
const logout = await request("auth/logout", {}, cookie);
equal(logout.response.status, 200);
equal((await request("workspace", undefined, cookie)).response.status, 401);
console.log(
  `HTTP smoke passed: ${checks} assertions. Login, CSRF, ownership, execution, replay, exports, prompt planning, RBAC, audit, logout.`,
);
