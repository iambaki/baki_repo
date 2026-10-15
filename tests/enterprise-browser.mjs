import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const base = process.env.PTAT_TEST_URL || "http://localhost:3010";
const browser = await chromium.launch({
  executablePath: process.env.PTAT_CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let original;
async function login(email) {
  await page.goto(base + "/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.PTAT_DEMO_PASSWORD || "UatDemo!2026");
  await page.getByRole("button", { name: "Sign in to PTAT" }).click();
  await page.getByRole("heading", { name: "Testing overview" }).waitFor();
}
async function navigate(name) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
try {
  await login("admin@ptat.local");
  original = (
    await (await context.request.get(base + "/api/admin")).json()
  ).subscribers.find((s) => s.id === "1001");
  await navigate("API portal");
  await page.getByLabel("subscriptionId", { exact: true }).fill("1001");
  await page
    .getByRole("button", { name: "Execute request", exact: true })
    .click();
  await page.getByRole("heading", { name: "Response · HTTP 200" }).waitFor();
  await page.getByRole("button", { name: "Direct relative path" }).click();
  await page
    .getByLabel("Relative BSS path")
    .fill("/subscriptions/1001/balances");
  await page
    .getByRole("button", { name: "Execute request", exact: true })
    .click();
  await page.getByRole("heading", { name: "Response · HTTP 200" }).waitFor();
  await navigate("Bundle verification");
  await page.getByRole("button", { name: "Verify batch", exact: true }).click();
  await page.getByText("✓ OK", { exact: true }).waitFor();
  await page
    .getByLabel("CSV / text batch")
    .fill("01900000001,Bundle1,9999,101#D");
  await page.getByRole("button", { name: "Verify batch", exact: true }).click();
  await page.getByText("✕ NOT OK", { exact: true }).waitFor();
  await navigate("Subscriber 360");
  await page
    .getByRole("button", { name: "Search subscriber", exact: true })
    .click();
  await page.locator(".subscriber-summary").waitFor();
  assert.ok(
    await page
      .locator(".subscriber-summary")
      .getByText("01900000001", { exact: true })
      .first()
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Balances / dedicated accounts", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Balances / dedicated accounts",
      exact: true,
    })
    .waitFor();
  await navigate("Product explorer");
  await page.getByRole("button", { name: "Verify batch", exact: true }).click();
  await page.getByText("✓ OK", { exact: true }).waitFor();
  await page.getByText("019••").count();
  await navigate("Test MSISDNs");
  const row = page.getByRole("row").filter({ hasText: "01900000001" }).first();
  await row.getByRole("button", { name: "Edit / Share" }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: /tester@ptat.local/ })
    .check();
  await page
    .getByRole("button", { name: "Save registration", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await navigate("Administration");
  await page.getByRole("button", { name: "Roles", exact: true }).click();
  await page
    .getByRole("button", { name: "Create custom role", exact: true })
    .click();
  const role = {
    id: "Browser-" + Date.now(),
    name: "Browser configurable role " + Date.now(),
    pages: ["Overview", "API portal", "My account"],
    permissions: ["bss.read"],
  };
  await page
    .getByLabel("Configuration JSON")
    .fill(JSON.stringify(role, null, 2));
  await page
    .getByRole("button", { name: "Validate and save", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: role.name, exact: true }).waitFor();
  await navigate("AI BSS Assistant");
  await page
    .getByLabel("Business request or administration command")
    .fill("Check balances for 01900000001");
  await page
    .getByRole("button", { name: "Generate plan", exact: true })
    .click();
  await page.getByRole("heading", { name: "Review planned changes" }).waitFor();
  await page
    .getByRole("checkbox", {
      name: "I confirm the displayed plan and its environment.",
    })
    .check();
  await page
    .getByRole("button", { name: "Execute confirmed plan", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Execution result", exact: true })
    .waitFor();
  mkdirSync("/tmp/ptat-evidence", { recursive: true });
  await page.screenshot({
    path: "/tmp/ptat-evidence/enterprise-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/ptat-evidence/enterprise-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await login("tester@ptat.local");
  assert.equal(
    await page
      .getByRole("button", { name: "Administration", exact: true })
      .count(),
    0,
  );
  await navigate("Test MSISDNs");
  assert.equal(
    await page
      .getByRole("row")
      .filter({ hasText: "01900000001" })
      .getByRole("button", { name: "Edit / Share" })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await login("admin@ptat.local");
  const payload = {
    id: original.id,
    name: original.name,
    msisdn: original.msisdn,
    subscriptionId: original.subscriptionId,
    environment: original.environment === "UAT" ? "Test" : original.environment,
    owner: original.owner,
    assignedUsers: original.assignedUsers || [],
    enabled: original.enabled,
    remarks: original.remarks,
    tags: original.tags,
  };
  const restored = await context.request.post(base + "/api/manage", {
    headers: { Origin: base },
    data: { type: "subscriber.save", payload },
  });
  assert.equal(restored.status(), 200);
  assert.deepEqual(errors, []);
  console.log(
    "Enterprise browser passed: registered/direct API, OK/NOT OK offer and DA checks, 360 summary/tabs, product explorer, owner/admin sharing, custom role editor, confirmed assistant, protected menus, desktop/mobile layout.",
  );
} finally {
  await browser.close();
}
