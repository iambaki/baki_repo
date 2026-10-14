import { randomUUID } from "node:crypto";
import { z } from "zod";
import { products } from "./catalog";
import type {
  User,
  Subscriber,
  Plan,
  Run,
  Evidence,
  Result,
  Check,
} from "./types";
import { mask } from "./types";
export const planSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    productId: z.string(),
    subscriberIds: z.array(z.string()).min(1).max(50),
    environment: z.literal("UAT"),
    source: z.enum(["Structured", "Prompt"]).default("Structured"),
    scenario: z
      .enum(["normal", "balance-mismatch", "purchase-error"])
      .default("normal"),
  })
  .strict();
export const steps = [
  "Validate role, ownership and environment",
  "Capture balance and active products",
  "Submit registered product purchase",
  "Poll simulated transaction until complete",
  "Read products, balances and services",
  "Compare all expected entitlements",
  "Store masked evidence and audit event",
];
export function validatePlan(
  input: unknown,
  user: User,
  subscribers: Subscriber[],
): Plan {
  if (user.role === "Auditor")
    throw new Error("Auditors have read-only access.");
  const data = planSchema.parse(input);
  if (new Set(data.subscriberIds).size !== data.subscriberIds.length)
    throw new Error("Duplicate subscribers are not allowed.");
  if (!products.some((p) => p.id === data.productId))
    throw new Error("Product is not registered.");
  for (const id of data.subscriberIds) {
    const s = subscribers.find((s) => s.id === id);
    if (
      !s ||
      s.owner !== user.id ||
      s.status !== "Active" ||
      s.environment !== data.environment
    )
      throw new Error(
        "Every MSISDN must be active, owned by you, and registered in UAT.",
      );
  }
  return {
    ...data,
    id: randomUUID(),
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    steps,
    status: "DRAFT",
  };
}
export function parsePrompt(prompt: string, subscribers: Subscriber[]) {
  if (prompt.length > 2000 || !/\b(buy|purchase)\b/i.test(prompt))
    throw new Error(
      "Use “Purchase P123 for 01900000001 …”. Only purchase plans are supported.",
    );
  const ids = prompt.match(/\bP\d+\b/gi) || [];
  if (ids.length !== 1)
    throw new Error("Specify exactly one registered product ID.");
  const numbers = prompt.match(/\b(?:8801\d{9}|01\d{9})\b/g) || [];
  if (!numbers.length)
    throw new Error("Include at least one registered MSISDN.");
  const normalized = numbers.map((n) =>
    n.startsWith("880") ? "0" + n.slice(3) : n,
  );
  const subscriberIds = normalized.map((n) => {
    const s = subscribers.find((s) => s.msisdn === n);
    if (!s) throw new Error("A requested MSISDN is not registered.");
    return s.id;
  });
  return {
    name: "Prompt · " + ids[0].toUpperCase(),
    productId: ids[0].toUpperCase(),
    subscriberIds,
    environment: "UAT",
    source: "Prompt",
    scenario: "normal",
  };
}
export function executePlan(
  plan: Plan,
  user: User,
  subscribers: Subscriber[],
): Run {
  if (plan.createdBy !== user.id)
    throw new Error("Only the plan owner may execute it.");
  if (plan.status !== "DRAFT")
    throw new Error("This plan has already been executed.");
  validatePlan(
    {
      name: plan.name,
      productId: plan.productId,
      subscriberIds: plan.subscriberIds,
      environment: plan.environment,
      source: plan.source,
      scenario: plan.scenario,
    },
    user,
    subscribers,
  );
  const started = Date.now();
  const p = products.find((p) => p.id === plan.productId)!;
  const results: Result[] = plan.subscriberIds.map((id, index) => {
    const s = subscribers.find((s) => s.id === id)!;
    const base = "/api/v1/subscriptions/" + id;
    const evidence: Evidence[] = [];
    const capture = (
      operation: string,
      method: string,
      path: string,
      status: number,
      response: unknown,
      request?: unknown,
    ) =>
      evidence.push({
        timestamp: new Date().toISOString(),
        operation,
        method,
        path,
        status,
        response,
        request,
      });
    const before = { balance: 1000, products: [] as string[] };
    capture("Pre-purchase balance", "GET", base + "/balances", 200, {
      data: [
        {
          type: "balances",
          id: "main",
          attributes: {
            amount: before.balance,
            unit: "BDT",
            "dedicated-account-id": null,
          },
        },
      ],
    });
    capture("Pre-purchase products", "GET", base + "/products", 200, {
      data: [],
    });
    const request = {
      data: { type: "products", id: p.id, meta: { channel: "PTAT_DEMO" } },
    };
    if (plan.scenario === "purchase-error" && index === 0) {
      capture(
        "Purchase",
        "POST",
        base + "/relationships/products",
        503,
        { errors: [{ title: "Simulated BSS unavailability" }] },
        request,
      );
      return {
        msisdn: mask(s.msisdn),
        status: "ERROR",
        checks: [],
        evidence,
        error: "Simulated BSS failure. No purchase retry was attempted.",
      };
    }
    capture(
      "Purchase",
      "POST",
      base + "/relationships/products",
      202,
      {
        data: [
          {
            type: "products",
            id: "demo-request-" + id,
            attributes: { status: "scheduled" },
          },
        ],
      },
      request,
    );
    capture(
      "Poll transaction",
      "GET",
      "/api/v1/requests/demo-request-" + id,
      200,
      {
        data: {
          type: "requests",
          id: "demo-request-" + id,
          attributes: { status: "completed" },
        },
      },
    );
    const delta = -(
      p.price + (plan.scenario === "balance-mismatch" && index === 0 ? 20 : 0)
    );
    const after = {
      balance: before.balance + delta,
      products: [p.id],
      days: p.days,
      dataGB: p.dataGB,
      minutes: p.minutes,
      da: p.da,
      service: p.service,
    };
    capture("Post-purchase products", "GET", base + "/products", 200, {
      data: [
        {
          type: "subscription-products",
          id: p.id,
          attributes: { status: "active", "validity-days": after.days },
          relationships: { product: { data: { type: "products", id: p.id } } },
        },
      ],
    });
    capture("Post-purchase balances", "GET", base + "/balances", 200, {
      data: [
        {
          type: "balances",
          id: "main",
          attributes: { amount: after.balance, unit: "BDT" },
        },
        {
          type: "balances",
          id: after.da,
          attributes: {
            "dedicated-account-id": after.da,
            "data-gb": after.dataGB,
            "voice-minutes": after.minutes,
          },
        },
      ],
    });
    capture("Post-purchase services", "GET", base + "/services", 200, {
      data: [
        {
          type: "subscription-services",
          id: after.service,
          relationships: {
            service: { data: { type: "services", id: after.service } },
          },
        },
      ],
    });
    const check = (
      name: string,
      expected: string | number,
      actual: string | number,
    ): Check => ({
      name,
      expected: String(expected),
      actual: String(actual),
      passed: expected === actual,
    });
    const checks = [
      check("Package", p.id, after.products[0]),
      check("Balance delta (BDT)", -p.price, delta),
      check("Validity (days)", p.days, after.days),
      check("Data (GB)", p.dataGB, after.dataGB),
      check("Voice (minutes)", p.minutes, after.minutes),
      check("Dedicated account", p.da, after.da),
      check("Service", p.service, after.service),
    ];
    return {
      msisdn: mask(s.msisdn),
      status: checks.every((c) => c.passed) ? "PASS" : "FAIL",
      checks,
      evidence,
    };
  });
  const statuses = results.map((r) => r.status);
  const status = statuses.every((s) => s === "PASS")
    ? "PASS"
    : statuses.every((s) => s === "ERROR")
      ? "ERROR"
      : statuses.some((s) => s === "ERROR")
        ? "PARTIAL"
        : "FAIL";
  return {
    id: randomUUID(),
    planId: plan.id,
    name: plan.name,
    productId: p.id,
    environment: "UAT",
    source: plan.source,
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    status,
    results,
  };
}
