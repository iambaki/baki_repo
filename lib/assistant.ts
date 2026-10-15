import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fetch as modelFetch, ProxyAgent, Agent } from "undici";
import { allSubscribers, users, get, save, transaction, audit } from "./db";
import {
  settings,
  requirePermission,
  assertSubscriber,
  environmentId,
  HttpError,
  isAdmin,
} from "./policy";
import { manage, type Action } from "./management";
import {
  bssRequest,
  purchaseAndPoll,
  redact,
  authorizeBss,
  type BssInput,
} from "./bss";
import type { User, Subscriber } from "./types";
const actionTypes = [
  "user.create",
  "user.update",
  "user.reset",
  "role.save",
  "role.delete",
  "subscriber.save",
  "subscriber.approve",
  "environment.save",
  "operation.save",
  "operation.delete",
  "settings.save",
] as const;
const intentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("bss"),
      requests: z
        .array(
          z
            .object({
              environment: z.enum(["Test", "Production"]),
              method: z.enum(["GET", "POST", "PATCH", "DELETE"]),
              path: z.string().max(2048),
              body: z.unknown().optional(),
            })
            .strict(),
        )
        .min(1)
        .max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal("admin"),
      action: z
        .object({ type: z.enum(actionTypes), payload: z.record(z.unknown()) })
        .strict(),
    })
    .strict(),
]);
export type AssistantIntent = z.infer<typeof intentSchema>;
type AssistantPlan = {
  id: string;
  userId: string;
  createdAt: string;
  expires: number;
  status: "DRAFT" | "EXECUTING" | "EXECUTED" | "ERROR";
  intent: AssistantIntent;
  requiresPassword: boolean;
};
function noSecrets(value: unknown) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(noSecrets);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (/^(password|secret|token|authorization)$/i.test(k))
      throw new HttpError(400, "Enter credentials separately from prompts.");
    noSecrets(v);
  }
}
async function ruleIntent(
  user: User,
  prompt: string,
  environment: string,
): Promise<AssistantIntent> {
  const lower = prompt.toLowerCase();
  const all = await allSubscribers(),
    people = await users();
  const jsonStart = prompt.indexOf("{");
  if (jsonStart >= 0) {
    let data: unknown;
    try {
      data = JSON.parse(prompt.slice(jsonStart));
    } catch {
      throw new HttpError(400, "Invalid action JSON.");
    }
    noSecrets(data);
    if (typeof data === "object" && data && "kind" in data)
      return intentSchema.parse(data);
    const prefix = prompt.slice(0, jsonStart).trim().toLowerCase();
    const mapping: Record<string, Action["type"]> = {
      "create user": "user.create",
      "update user": "user.update",
      "reset user": "user.reset",
      "save role": "role.save",
      "create role": "role.save",
      "delete role": "role.delete",
      "save msisdn": "subscriber.save",
      "approve msisdn": "subscriber.approve",
      "save environment": "environment.save",
      "save operation": "operation.save",
      "delete operation": "operation.delete",
      "save settings": "settings.save",
    };
    if (!mapping[prefix])
      throw new HttpError(
        400,
        "Use a supported action prefix before the JSON object.",
      );
    return {
      kind: "admin",
      action: {
        type: mapping[prefix],
        payload: data as Record<string, unknown>,
      },
    };
  }
  if (
    /^(approve|reject|disable|reset password|assign role)\b/.test(lower) &&
    prompt.includes("@")
  ) {
    const email = prompt
      .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
      .toLowerCase();
    const target = people.find((u) => u.email === email);
    if (!target) throw new HttpError(400, "User not found.");
    if (lower.startsWith("reset password"))
      return {
        kind: "admin",
        action: { type: "user.reset", payload: { id: target.id } },
      };
    const assigned = prompt.match(/^assign role\s+"?(.+?)"?\s+to\s+/i)?.[1];
    return {
      kind: "admin",
      action: {
        type: "user.update",
        payload: {
          id: target.id,
          name: target.name,
          role: assigned || target.role,
          status: lower.startsWith("approve")
            ? "active"
            : lower.startsWith("reject")
              ? "rejected"
              : lower.startsWith("disable")
                ? "disabled"
                : target.status,
        },
      },
    };
  }
  const created = prompt.match(
    /^create user\s+"([^"]+)"\s+(\S+@\S+)\s+role\s+(.+)$/i,
  );
  if (created)
    return {
      kind: "admin",
      action: {
        type: "user.create",
        payload: {
          name: created[1],
          email: created[2],
          role: created[3].trim(),
        },
      },
    };
  if (/^(enable|disable) sharing$/i.test(prompt)) {
    const c = await settings();
    return {
      kind: "admin",
      action: {
        type: "settings.save",
        payload: { ...c, sharingEnabled: lower.startsWith("enable") },
      },
    };
  }
  if (/^(enable|disable) production approval$/i.test(prompt)) {
    const c = await settings();
    return {
      kind: "admin",
      action: {
        type: "settings.save",
        payload: {
          ...c,
          productionApprovalRequired: lower.startsWith("enable"),
        },
      },
    };
  }
  const numbers = (prompt.match(/\b(?:8801\d{9}|01\d{9})\b/g) || []).map((n) =>
    n.startsWith("880") ? "0" + n.slice(3) : n,
  );
  if (/^(approve|reject) msisdn\b/.test(lower)) {
    const s = all.find(
      (s) =>
        s.msisdn === numbers[0] && environmentId(s.environment) === environment,
    );
    if (!s) throw new HttpError(400, "Registration not found.");
    return {
      kind: "admin",
      action: {
        type: "subscriber.approve",
        payload: {
          id: s.id,
          approval: lower.startsWith("approve") ? "approved" : "rejected",
        },
      },
    };
  }
  if (/^share\b/.test(lower)) {
    const s = all.find(
      (s) =>
        s.msisdn === numbers[0] && environmentId(s.environment) === environment,
    );
    if (!s) throw new HttpError(400, "Registration not found.");
    const emails =
      prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    if (!emails.length)
      throw new HttpError(400, "Specify assigned user emails.");
    const ids = emails.map((e) => {
      const u = people.find((u) => u.email === e.toLowerCase());
      if (!u) throw new HttpError(400, "Assigned user not found.");
      return u.id;
    });
    return {
      kind: "admin",
      action: {
        type: "subscriber.save",
        payload: {
          id: s.id,
          name: s.name,
          msisdn: s.msisdn,
          subscriptionId: s.subscriptionId,
          environment,
          owner: s.owner,
          assignedUsers: [...new Set([...(s.assignedUsers || []), ...ids])],
          enabled: s.enabled,
          remarks: s.remarks,
          tags: s.tags,
        },
      },
    };
  }
  const subjects = all.filter(
    (s) =>
      environmentId(s.environment) === environment &&
      (numbers.includes(s.msisdn) ||
        new RegExp("\\b" + (s.subscriptionId || s.id) + "\\b").test(prompt)),
  );
  if (!subjects.length)
    throw new HttpError(
      400,
      "Specify registered MSISDNs or subscription identifiers.",
    );
  const config = await settings();
  if (subjects.length > config.maxBatchSize)
    throw new HttpError(400, "Batch limit exceeded.");
  for (const n of numbers)
    if (!subjects.some((s) => s.msisdn === n))
      throw new HttpError(
        403,
        "A requested MSISDN is not registered in this environment.",
      );
  const purchase = /\b(purchase|buy)\b/i.test(prompt);
  const product = prompt.match(
    /\b(?:purchase|buy)\s+(?:(?:product|package|pack)\s+)?([A-Za-z0-9][A-Za-z0-9_-]{0,99})\b/i,
  )?.[1];
  if (purchase && !product)
    throw new HttpError(400, "Include a product code in the purchase prompt.");
  const endpoints = purchase
    ? ["balances", "products", "relationships/products", "products", "balances"]
    : [
        ...(/balance/.test(lower) ? ["balances"] : []),
        ...(/package/.test(lower) ||
        (/product/.test(lower) && !/available|availability/.test(lower))
          ? ["products"]
          : []),
        ...(/usage/.test(lower) ? ["product-usages"] : []),
        ...(/available|availability/.test(lower) ? ["available-products"] : []),
      ];
  if (!endpoints.length)
    throw new HttpError(
      400,
      "Supported requests: balance, packages, usage, availability, purchase, or a documented admin action.",
    );
  const requests = subjects.flatMap((s) =>
    endpoints.map((suffix) => ({
      environment: environment as "Test" | "Production",
      method:
        suffix === "relationships/products"
          ? ("POST" as const)
          : ("GET" as const),
      path: "/subscriptions/" + s.subscriptionId + "/" + suffix,
      ...(suffix === "relationships/products"
        ? {
            body: {
              data: {
                type: "products",
                id: product,
                meta: { channel: "PTAT" },
              },
            },
          }
        : {}),
    })),
  );
  return { kind: "bss", requests };
}
async function modelIntent(prompt: string, environment: string) {
  const config = await settings();
  const a = config.ai;
  if (!a.url.startsWith("https://"))
    throw new HttpError(400, "Configure an HTTPS model endpoint.");
  const token = process.env[a.tokenEnv];
  if (!token)
    throw new HttpError(
      400,
      "Configured model credential variable is missing.",
    );
  const dispatcher = process.env.HTTPS_PROXY
    ? new ProxyAgent(process.env.HTTPS_PROXY)
    : new Agent();
  try {
    const r = await modelFetch(a.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        model: a.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Return JSON only: {kind:"bss",requests:[{environment,method,path,body?}]} or {kind:"admin",action:{type,payload}}. Allowed actions: ' +
              actionTypes.join(",") +
              ". No credentials in plans. BSS paths must be relative, registered and subscription scoped. Never execute anything. Environment: " +
              environment,
          },
          { role: "user", content: prompt },
        ],
      }),
      dispatcher,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new HttpError(502, "Model provider returned an error.");
    const content = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const value = JSON.parse(content.choices?.[0]?.message?.content || "{}");
    noSecrets(value);
    return intentSchema.parse(value);
  } finally {
    await dispatcher.close();
  }
}
export async function createAssistantPlan(
  user: User,
  prompt: string,
  environment: string,
) {
  const c = await settings();
  if (!c.ai.enabled) throw new HttpError(403, "Assistant is disabled.");
  if (
    prompt.length > 8000 ||
    (/\bpassword\b/i.test(prompt) &&
      !/^reset password\s+(?:for\s+)?[^\s@]+@[^\s@]+$/i.test(prompt.trim()))
  )
    throw new HttpError(400, "Prompt is too long or contains a credential.");
  const intent =
    c.ai.mode === "model"
      ? await modelIntent(prompt, environment)
      : await ruleIntent(user, prompt, environment);
  if (intent.kind === "admin") {
    if (intent.action.type === "subscriber.save")
      await requirePermission(user, "bss.write");
    else await requirePermission(user, "admin");
    noSecrets(intent.action.payload);
  } else {
    const subjects = new Set<string>(),
      writes = new Set<string>();
    for (const request of intent.requests) {
      if (request.environment !== environment)
        throw new HttpError(
          400,
          "Planned environment differs from the selected environment.",
        );
      const target = await authorizeBss(user, request);
      if (target.subscriber)
        subjects.add(target.env.id + ":" + target.subscriber.id);
      if (request.method !== "GET") {
        const key =
          request.method + request.path + JSON.stringify(request.body);
        if (writes.has(key))
          throw new HttpError(
            400,
            "Duplicate mutations are not allowed in a plan.",
          );
        writes.add(key);
      }
    }
    if (subjects.size > c.maxBatchSize)
      throw new HttpError(400, "Batch limit exceeded.");
  }
  const plan: AssistantPlan = {
    id: randomUUID(),
    userId: user.id,
    createdAt: new Date().toISOString(),
    expires: Date.now() + 15 * 60000,
    status: "DRAFT",
    intent,
    requiresPassword:
      intent.kind === "admin" && intent.action.type === "user.create",
  };
  await save("assistant-plan", plan.id, plan);
  await audit(user, "Created assistant plan", plan.id);
  return plan;
}
export async function executeAssistantPlan(
  user: User,
  id: string,
  password?: string,
) {
  const plan = await transaction(async () => {
    if ((await import("./config")).runtimeConfig.driver === "mysql")
      await (
        await import("./db")
      ).query(
        "SELECT id FROM documents WHERE kind='assistant-plan' AND id=? FOR UPDATE",
        [id],
      );
    const p = await get<AssistantPlan>("assistant-plan", id);
    if (!p || p.userId !== user.id) throw new HttpError(404, "Plan not found.");
    if (p.status !== "DRAFT" || p.expires < Date.now())
      throw new HttpError(409, "Plan expired or already executed.");
    if (p.requiresPassword && !password)
      throw new HttpError(
        400,
        "Enter the password in the separate password field.",
      );
    await save("assistant-plan", id, { ...p, status: "EXECUTING" });
    return p;
  });
  try {
    let result: unknown;
    if (plan.intent.kind === "admin") {
      const action = plan.intent.action as Action;
      result = await manage(user, {
        ...action,
        payload: plan.requiresPassword
          ? { ...(action.payload as object), password }
          : action.payload,
      });
    } else {
      for (const r of plan.intent.requests) await authorizeBss(user, r);
      const values = [];
      for (const r of plan.intent.requests) {
        const target = await authorizeBss(user, r);
        values.push(
          target.operation.id === "purchase"
            ? await purchaseAndPoll(user, r)
            : await bssRequest(user, r),
        );
      }
      result = values;
    }
    await save("assistant-plan", id, {
      ...plan,
      status: "EXECUTED",
      result: redact(result),
    });
    await audit(user, "Executed confirmed assistant plan", id);
    return result;
  } catch (e) {
    await save("assistant-plan", id, {
      ...plan,
      status: "ERROR",
      error: e instanceof Error ? e.message : "Execution error",
    });
    throw e;
  }
}
