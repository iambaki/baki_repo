import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalPath, matchOperation } from "../lib/bss";
import { assertSubscriber, canSeeSubscriber } from "../lib/policy";
import { parseBatch } from "../lib/verification";
import { defaultOperations } from "../lib/contracts";
import type { Subscriber, User } from "../lib/types";
const user: User = {
  id: "tester",
  name: "Tester",
  email: "tester@example.com",
  role: "Tester",
};
const shared: Subscriber = {
  id: "test",
  name: "Shared",
  msisdn: "01911000000",
  subscriptionId: "320589947",
  environment: "Test",
  owner: "lead",
  assignedUsers: ["tester"],
  enabled: true,
  approval: "approved",
  status: "Active",
  tags: [],
};
test("shared access is accepted only when sharing, approval, status and environment all permit it", () => {
  assert.equal(assertSubscriber(user, shared, "Test", true), shared);
  assert.throws(() => assertSubscriber(user, shared, "Test", false));
  assert.throws(() =>
    assertSubscriber(user, { ...shared, approval: "pending" }, "Test", true),
  );
  assert.throws(() =>
    assertSubscriber(user, { ...shared, enabled: false }, "Test", true),
  );
  assert.throws(() => assertSubscriber(user, shared, "Production", true));
  assert.throws(() =>
    assertSubscriber(user, { ...shared, assignedUsers: [] }, "Test", true),
  );
});
test("owners and Admin remain eligible independently of sharing toggle", () => {
  assert.ok(canSeeSubscriber({ ...user, id: "lead" }, shared, false));
  assert.ok(canSeeSubscriber({ ...user, role: "Admin" }, shared, false));
});
test("relative requests accept documented paths and encoded query filters", () => {
  const r = matchOperation(defaultOperations, {
    environment: "Test",
    method: "GET",
    path: "/api/v1/subscriptions/320589947/products?filter%5Bstatus%5D=active",
  });
  assert.equal(r.operation.id, "products");
  assert.equal(r.params.subscriptionId, "320589947");
  assert.equal(r.query.get("filter[status]"), "active");
});
test("absolute URLs, traversal, duplicate slashes and encoded paths are rejected", () => {
  for (const path of [
    "https://evil.example/",
    "//evil.example/",
    "/subscriptions/../products",
    "/subscriptions/%2e%2e/products",
    "/subscriptions//1001/products",
    "/subscriptions\\1001/products",
  ])
    assert.throws(() => canonicalPath(path));
});
test("unknown paths and unregistered methods and filters fail closed", () => {
  for (const input of [
    { method: "GET", path: "/customers/1" },
    { method: "DELETE", path: "/subscriptions/1001/balances" },
    { method: "GET", path: "/subscriptions/1001/balances?include=customer" },
  ])
    assert.throws(() =>
      matchOperation(defaultOperations, { environment: "Test", ...input }),
    );
});
test("batch parser preserves every expected offer and DA unit", () => {
  const [r] = parseBatch(
    "MSISDN,ProductCode,Offer,DA\n01911000000,Bundle1,1001|1002|1003,101#V|102#V|103#S",
    50,
  );
  assert.deepEqual(r.offers, ["1001", "1002", "1003"]);
  assert.deepEqual(r.das, [
    { id: "101", unit: "V" },
    { id: "102", unit: "V" },
    { id: "103", unit: "S" },
  ]);
});
test("batch rejects malformed units, duplicates, bad numbers and oversize input", () => {
  for (const text of [
    "01911000000,P123,1001,101#X",
    "01911000000,P123,1001|1001,",
    "01911000000,P123,,101#D|101#D",
    "bad,P123,,",
  ])
    assert.throws(() => parseBatch(text, 50));
  assert.throws(() => parseBatch("01911000000,P123,,\n01911000001,P123,,", 1));
});
