import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlan, executePlan, parsePrompt } from "../lib/engine";
import { subscribers } from "../lib/catalog";
import type { User, Plan } from "../lib/types";
const lead: User = {
  id: "lead",
  name: "Lead",
  email: "lead@ptat.local",
  role: "Test Lead",
};
const input = {
  name: "Combo verification",
  productId: "P123",
  subscriberIds: ["1001", "1002"],
  environment: "UAT",
  source: "Structured",
  scenario: "normal",
};
const plan = (extra = {}) =>
  validatePlan({ ...input, ...extra }, lead, subscribers);
test("normal batch verifies all seven entitlements with masked evidence", () => {
  const run = executePlan(plan(), lead, subscribers);
  assert.equal(run.status, "PASS");
  assert.equal(run.results.length, 2);
  for (const result of run.results) {
    assert.equal(result.checks.length, 7);
    assert.ok(result.checks.every((c) => c.passed));
    assert.equal(result.evidence.length, 7);
    assert.ok(!JSON.stringify(result).includes("01900000001"));
    assert.equal(result.evidence[2].status, 202);
    assert.equal(result.evidence[3].operation, "Poll transaction");
  }
});
test("mismatch creates a real failed balance comparison", () => {
  const run = executePlan(
    plan({ scenario: "balance-mismatch" }),
    lead,
    subscribers,
  );
  assert.equal(run.status, "FAIL");
  assert.equal(run.results[0].status, "FAIL");
  assert.equal(run.results[1].status, "PASS");
  const c = run.results[0].checks.find(
    (c) => c.name === "Balance delta (BDT)",
  )!;
  assert.equal(c.expected, "-299");
  assert.equal(c.actual, "-319");
  assert.equal(c.passed, false);
});
test("purchase failure is an error, not a pass or an automatic retry", () => {
  const run = executePlan(
    plan({ scenario: "purchase-error" }),
    lead,
    subscribers,
  );
  assert.equal(run.status, "PARTIAL");
  assert.equal(run.results[0].checks.length, 0);
  assert.equal(
    run.results[0].evidence.filter((e) => e.method === "POST").length,
    1,
  );
  assert.equal(run.results[0].status, "ERROR");
  assert.equal(run.results[1].status, "PASS");
});
test("single subscriber purchase failure has ERROR outcome", () => {
  assert.equal(
    executePlan(
      plan({ scenario: "purchase-error", subscriberIds: ["1001"] }),
      lead,
      subscribers,
    ).status,
    "ERROR",
  );
});
test("auditors cannot create or execute plans", () => {
  const auditor = { ...lead, role: "Auditor" as const };
  assert.throws(() => validatePlan(input, auditor, subscribers), /read-only/);
  assert.throws(() => executePlan(plan(), auditor, subscribers), /read-only/);
});
test("ownership and restrictions are enforced", () => {
  assert.throws(() => plan({ subscriberIds: ["1004"] }), /owned/);
  assert.throws(() => plan({ subscriberIds: ["1005"] }), /active/);
  assert.throws(() => plan({ subscriberIds: ["missing"] }), /owned/);
});
test("unregistered product, production environment and arbitrary URLs rejected", () => {
  assert.throws(() => plan({ productId: "P999" }), /not registered/);
  assert.throws(() => plan({ environment: "Production" }));
  assert.throws(() => plan({ endpoint: "https://example.org" }));
});
test("batch validation rejects duplicates, empty list, and oversized batch", () => {
  assert.throws(() => plan({ subscriberIds: ["1001", "1001"] }), /Duplicate/);
  assert.throws(() => plan({ subscriberIds: [] }));
  assert.throws(() => plan({ subscriberIds: Array(51).fill("1001") }));
});
test("plans cannot be replayed or executed by another owner", () => {
  const p = plan();
  assert.throws(
    () => executePlan({ ...p, status: "EXECUTED" }, lead, subscribers),
    /already/,
  );
  assert.throws(
    () => executePlan(p, { ...lead, id: "tester" }, subscribers),
    /owner/,
  );
});
test("permissions revalidated at execution after subscriber restriction", () => {
  const p = plan();
  const changed = subscribers.map((s) =>
    s.id === "1001" ? { ...s, status: "Restricted" as const } : s,
  );
  assert.throws(() => executePlan(p, lead, changed), /active/);
});
test("prompt parser normalizes Bangladesh country code and uses same policy", () => {
  const parsed = parsePrompt(
    "Purchase P123 for 8801900000001 and 01900000002. Verify balance.",
    subscribers,
  );
  const p = validatePlan(parsed, lead, subscribers);
  assert.deepEqual(p.subscriberIds, ["1001", "1002"]);
  assert.equal(p.source, "Prompt");
});
test("unsupported or ambiguous prompt input cannot execute", () => {
  assert.throws(() => parsePrompt("GET https://example.com", subscribers));
  assert.throws(
    () => parsePrompt("Purchase P123 and P124 for 01900000001", subscribers),
    /exactly one/,
  );
  assert.throws(
    () => parsePrompt("Purchase P123 for 01999999999", subscribers),
    /not registered/,
  );
  assert.throws(
    () =>
      validatePlan(
        parsePrompt("Purchase P123 for 01900000004", subscribers),
        lead,
        subscribers,
      ),
    /owned/,
  );
});
