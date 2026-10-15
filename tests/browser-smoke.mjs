import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const base = process.env.PTAT_TEST_URL || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: process.env.PTAT_CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.PTAT_DEMO_PASSWORD || "UatDemo!2026");
  await page.getByRole("button", { name: "Sign in to PTAT" }).click();
  await page.getByRole("heading", { name: "Testing overview" }).waitFor();
  await page.getByRole("button", { name: "Create with a prompt" }).click();
  await page.getByLabel("What would you like to test?").waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "New test run" }).click();
  await page
    .getByLabel("Import MSISDNs from CSV or text")
    .setInputFiles("docs/sample-msisdns.csv");
  await page.getByText("3 subscribers imported.").waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .locator('input[type="checkbox"]:checked')
      .count(),
    3,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "New test run" }).click();
  await page.getByLabel("Test run name").fill("Browser · Combo verification");
  await page.getByRole("button", { name: "Review test plan" }).click();
  await page.getByRole("heading", { name: "Review execution plan" }).waitFor();
  await page.getByRole("button", { name: "Execute simulated test" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Export CSV" })
    .waitFor();
  assert.equal(
    await page.getByRole("dialog").getByText("Passed", { exact: true }).count(),
    17,
  );
  await page
    .getByRole("dialog")
    .getByText("Request & response evidence")
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByText("Poll transaction", { exact: true })
    .first()
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  assert.ok(download.suggestedFilename().endsWith(".csv"));
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "New test run" }).click();
  await page.getByRole("button", { name: "Business prompt" }).click();
  await page
    .getByLabel("What would you like to test?")
    .fill("Purchase P125 for 01900000001");
  await page.getByRole("button", { name: "Review test plan" }).click();
  await page.getByRole("button", { name: "Execute simulated test" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Export CSV" })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Test MSISDNs", exact: true }).click();
  await page
    .getByRole("heading", { name: "Test MSISDNs", exact: true })
    .waitFor();
  assert.ok(
    await page.getByText("01900000005", { exact: true }).first().isVisible(),
  );
  await page
    .getByRole("button", { name: "Product catalog", exact: true })
    .click();
  await page.getByRole("heading", { name: "All-in-one 299" }).waitFor();
  await page.getByRole("button", { name: "API registry", exact: true }).click();
  await page.getByRole("heading", { name: "BSS operation registry" }).waitFor();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("heading", { name: "Testing overview" }).waitFor();
  await page.getByRole("status").waitFor({ state: "hidden" });
  mkdirSync("/tmp/ptat-evidence", { recursive: true });
  await page.screenshot({
    path: "/tmp/ptat-evidence/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/ptat-evidence/mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "New test run" }).click();
  await page.getByRole("heading", { name: "Create a test run" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: login, structured purchase, seven checks, evidence, CSV download, prompt purchase, navigation, responsive layout, Escape dismissal.",
  );
} finally {
  await browser.close();
}
