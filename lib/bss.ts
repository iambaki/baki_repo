import { Agent, ProxyAgent, fetch as fetchHttp } from "undici";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { get, list, save, allSubscribers, audit, userById } from "./db";
import {
  getEnvironment,
  requirePermission,
  settings,
  assertSubscriber,
  HttpError,
  environmentId,
} from "./policy";
import type { Operation, Environment } from "./contracts";
import type { User, Subscriber } from "./types";
import { products } from "./catalog";
export type BssInput = {
  environment: string;
  method: string;
  path: string;
  body?: unknown;
};
export function canonicalPath(value: string) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("#") ||
    value.length > 2048
  )
    throw new HttpError(400, "Use a relative BSS path only.");
  const [pathname] = value.split("?");
  if (
    pathname.includes("%") ||
    pathname.includes("..") ||
    pathname.includes("//")
  )
    throw new HttpError(400, "Encoded or ambiguous BSS paths are not allowed.");
  const url = new URL(value, "https://bss.invalid");
  return {
    pathname: url.pathname.replace(/^\/api\/v1(?=\/)/, ""),
    query: url.searchParams,
  };
}
export function matchOperation(operations: Operation[], input: BssInput) {
  const target = canonicalPath(input.path);
  for (const op of operations.filter(
    (o) => o.enabled && o.method === input.method,
  )) {
    const names: string[] = [];
    const pattern = op.path
      .split("/")
      .map((part) => {
        const m = part.match(/^\{([A-Za-z]+)\}$/);
        if (m) {
          names.push(m[1]);
          return "([A-Za-z0-9_-]+)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    const m = target.pathname.match(new RegExp("^" + pattern + "$"));
    if (m) {
      for (const key of target.query.keys())
        if (
          !op.filters.includes(key) &&
          !["page[number]", "page[size]"].includes(key)
        )
          throw new HttpError(400, "Unsupported filter: " + key);
      return {
        operation: op,
        params: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])),
        ...target,
      };
    }
  }
  throw new HttpError(
    403,
    "This BSS method/path is not enabled in the API registry.",
  );
}
function sensitiveReferences(value: unknown): { kind: string; id: string }[] {
  if (!value || typeof value !== "object") return [];
  const out: { kind: string; id: string }[] = [];
  if (Array.isArray(value)) return value.flatMap(sensitiveReferences);
  const o = value as Record<string, unknown>;
  if (
    o.type === "subscriptions" &&
    (typeof o.id === "string" || typeof o.id === "number")
  )
    out.push({ kind: "id", id: String(o.id) });
  for (const [key, v] of Object.entries(o)) {
    if (
      ["subscription-id", "subscriptionId", "msisdn"].includes(key) &&
      (typeof v === "string" || typeof v === "number")
    )
      out.push({ kind: key === "msisdn" ? "msisdn" : "id", id: String(v) });
    out.push(...sensitiveReferences(v));
  }
  return out;
}
export async function authorizeBss(user: User, input: BssInput) {
  const current = await userById(user.id);
  if (!current || current.status !== "active")
    throw new HttpError(403, "Account is no longer active.");
  user = current;
  if (!["GET", "POST", "PATCH", "DELETE"].includes(input.method))
    throw new HttpError(400, "Unsupported BSS method.");
  await requirePermission(
    user,
    input.method === "GET"
      ? "bss.read"
      : input.method === "DELETE"
        ? "bss.delete"
        : "bss.write",
  );
  const env = await getEnvironment(input.environment);
  if (input.method !== "GET" && !env.writesEnabled)
    throw new HttpError(403, "Writes are disabled in this environment.");
  const matched = matchOperation(await list<Operation>("operation"), input);
  const conf = await settings();
  const all = await allSubscribers();
  let subscriber: Subscriber | undefined;
  if (matched.operation.scope === "catalog") {
    if (
      input.method !== "GET" ||
      !/^\/(products|services)\/[A-Za-z0-9_-]+$/.test(matched.pathname)
    )
      throw new HttpError(
        403,
        "Global scope is restricted to catalog resource reads.",
      );
  } else {
    if (matched.operation.id === "requests" && matched.params.requestId) {
      const ticket = await get<{ subscriberId: string; expires: number }>(
        "bss-ticket",
        env.id + ":" + matched.params.requestId,
      );
      if (!ticket || ticket.expires < Date.now())
        throw new HttpError(
          403,
          "Request status is limited to known purchase receipts.",
        );
      subscriber = assertSubscriber(
        user,
        all.find((s) => s.id === ticket.subscriberId),
        env.id,
        conf.sharingEnabled,
      );
    } else {
      if (!matched.params.subscriptionId)
        throw new HttpError(
          403,
          "Subscriber operations require an explicit subscriptionId path parameter.",
        );
      const byMsisdn = matched.query.get("identifier") === "msisdn";
      if (
        matched.query.has("identifier") &&
        !["pk", "msisdn"].includes(matched.query.get("identifier")!)
      )
        throw new HttpError(400, "Unsupported subscription identifier mode.");
      subscriber = assertSubscriber(
        user,
        all.find(
          (s) =>
            environmentId(s.environment) === env.id &&
            (byMsisdn
              ? s.msisdn === matched.params.subscriptionId
              : s.subscriptionId === matched.params.subscriptionId),
        ),
        env.id,
        conf.sharingEnabled,
      );
      for (const r of sensitiveReferences(input.body))
        assertSubscriber(
          user,
          all.find(
            (s) =>
              environmentId(s.environment) === env.id &&
              (r.kind === "msisdn"
                ? s.msisdn === r.id
                : s.subscriptionId === r.id),
          ),
          env.id,
          conf.sharingEnabled,
        );
    }
  }
  return { env, subscriber, ...matched };
}
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /password|token|secret|authorization|cookie/i.test(k)
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  if (typeof value === "string")
    return value.replace(
      /\b(?:8801\d{9}|01\d{9})\b/g,
      (n) => n.slice(0, 3) + "*****" + n.slice(-3),
    );
  return value;
}
async function simulated(input: BssInput, op: Operation, s?: Subscriber) {
  const id = s?.subscriptionId || "catalog";
  const productIds = ["P123", "P124", "P125", "Bundle1"];
  const resource = (
    type: string,
    rid: string,
    attributes: unknown,
    relationships?: unknown,
  ) => ({
    type,
    id: rid,
    attributes,
    ...(relationships ? { relationships } : {}),
  });
  if (input.method !== "GET") {
    if (op.id === "purchase")
      return {
        status: 202,
        data: {
          data: [
            resource("products", "demo-" + randomUUID(), {
              status: "scheduled",
            }),
          ],
        },
        simulated: true,
      };
    return {
      status: 200,
      data: { data: resource("requests", randomUUID(), { status: "done" }) },
      simulated: true,
    };
  }
  let data: unknown;
  switch (op.id) {
    case "requests":
      data = resource(
        "requests",
        canonicalPath(input.path).pathname.split("/").pop()!,
        { status: "done" },
      );
      break;
    case "subscription":
      data = resource("subscriptions", id, {
        msisdn: s?.msisdn,
        status: "active",
        "contract-id": id,
        "activation-time": "2026-01-01T00:00:00Z",
      });
      break;
    case "balances":
      data = [
        resource("balances", "main", {
          amount: 1000,
          unit: "BDT",
          "dedicated-account-id": null,
        }),
        ...productIds.flatMap((p) => [
          resource("balances", p + "-101", {
            "product-id": p,
            "dedicated-account-id": "101",
            unit: "minutes",
            amount: 300,
          }),
          resource("balances", p + "-102", {
            "product-id": p,
            "dedicated-account-id": "102",
            unit: "minutes",
            amount: 100,
          }),
          resource("balances", p + "-103", {
            "product-id": p,
            "dedicated-account-id": "103",
            unit: "SMS",
            amount: 50,
          }),
        ]),
      ];
      break;
    case "products":
    case "available":
      data = productIds.map((p) =>
        resource(
          "subscription-products",
          p,
          { status: "active", "product-id": p },
          { product: { data: { type: "products", id: p } } },
        ),
      );
      break;
    case "offers":
      data = productIds.flatMap((p) =>
        ["1001", "1002", "1003"].map((o) =>
          resource("subscription-products", p + "-" + o, {
            "product-id": p,
            "offer-id": o,
            status: "active",
          }),
        ),
      );
      break;
    case "services":
      data = products.map((p) =>
        resource(
          "subscription-services",
          p.service,
          { status: "active" },
          { service: { data: { type: "services", id: p.service } } },
        ),
      );
      break;
    case "catalog":
      data = resource(
        "products",
        canonicalPath(input.path).pathname.split("/").pop()!,
        { name: "Demo product", status: "available" },
      );
      break;
    case "usage":
      data = productIds.map((p) =>
        resource("product-usages", p, {
          "product-id": p,
          "product-service-usages": [
            {
              attributes: {
                "gsm-service-type": "voice",
                "total-available": 300,
                used: 10,
                unit: "minutes",
              },
            },
          ],
        }),
      );
      break;
    case "subscription-type":
      data = resource("subscription-types", "prepaid", { name: "Prepaid" });
      break;
    default:
      data = [];
  }
  return { status: 200, data: { data }, simulated: true };
}
async function live(input: BssInput, env: Environment) {
  if (!env.baseUrl)
    throw new HttpError(400, "Configure the environment BSS base URL first.");
  const base = new URL(env.baseUrl);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !["http:", "https:"].includes(base.protocol)
  )
    throw new HttpError(400, "Invalid BSS base URL.");
  if (env.id === "Production" && base.protocol !== "https:")
    throw new HttpError(400, "Production requires HTTPS.");
  const path = canonicalPath(input.path);
  const url = new URL(base.toString());
  url.pathname = base.pathname.replace(/\/$/, "") + path.pathname;
  url.search = path.query.toString();
  const headers: Record<string, string> = {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
  if (env.auth === "bearer") {
    const token = env.tokenEnv && process.env[env.tokenEnv];
    if (!token)
      throw new HttpError(
        400,
        "The configured BSS token environment variable is not set.",
      );
    headers.Authorization = "Bearer " + token;
  }
  if (env.auth === "basic") {
    const u = env.usernameEnv && process.env[env.usernameEnv],
      p = env.passwordEnv && process.env[env.passwordEnv];
    if (!u || !p)
      throw new HttpError(
        400,
        "Configured BSS basic-auth variables are missing.",
      );
    headers.Authorization =
      "Basic " + Buffer.from(u + ":" + p).toString("base64");
  }
  const tls = {
    rejectUnauthorized: env.tlsVerify,
    ...(env.caFile ? { ca: readFileSync(env.caFile, "utf8") } : {}),
  };
  const excluded = (process.env.NO_PROXY || "")
    .split(",")
    .map((s) => s.trim().split(":")[0])
    .filter(Boolean)
    .some(
      (host) =>
        host === "*" ||
        url.hostname === host ||
        (host.startsWith(".") && url.hostname.endsWith(host)),
    );
  const proxy = excluded
    ? undefined
    : process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const dispatcher = proxy
    ? new ProxyAgent({ uri: proxy, requestTls: tls })
    : new Agent({ connect: tls });
  try {
    const r = await fetchHttp(url, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      dispatcher,
      redirect: "manual",
      signal: AbortSignal.timeout(env.timeoutMs),
    });
    if (r.status >= 300 && r.status < 400) {
      await r.body?.cancel();
      throw new HttpError(502, "BSS redirects are not followed.");
    }
    const reader = r.body?.getReader();
    let text = "",
      bytes = 0;
    try {
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2_000_000)
            throw new HttpError(502, "BSS response exceeds 2 MB.");
          text += Buffer.from(value).toString("utf8");
        }
      }
    } finally {
      reader?.releaseLock();
    }
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text.slice(0, 10000) };
    }
    return { status: r.status, data, simulated: false };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      502,
      "BSS connectivity, TLS, or timeout failure. Check environment configuration.",
    );
  } finally {
    await dispatcher.close();
  }
}
export async function bssRequest(user: User, input: BssInput) {
  const target = await authorizeBss(user, input);
  const started = Date.now();
  const result =
    target.env.mode === "simulated"
      ? await simulated(input, target.operation, target.subscriber)
      : await live(input, target.env);
  const evidence = {
    id: randomUUID(),
    userId: user.id,
    environment: target.env.id,
    timestamp: new Date().toISOString(),
    operation: target.operation.id,
    method: input.method,
    path: redact(input.path),
    status: result.status,
    request: redact(input.body),
    response: redact(result.data),
    simulated: result.simulated,
    durationMs: Date.now() - started,
  };
  if (
    target.operation.id === "purchase" &&
    result.status < 400 &&
    target.subscriber
  ) {
    const payload = (result.data as { data?: unknown })?.data;
    const item = (Array.isArray(payload) ? payload[0] : payload) as
      | {
          id?: string;
          attributes?: {
            href?: string;
            "request-id"?: string;
            status?: string;
          };
        }
      | undefined;
    const hrefId = item?.attributes?.href?.match(
      /^\/?(?:api\/v1\/)?requests\/([A-Za-z0-9_-]+)$/,
    )?.[1];
    const requestId = hrefId || item?.id;
    if (requestId && /^[A-Za-z0-9_-]+$/.test(requestId))
      await save("bss-ticket", target.env.id + ":" + requestId, {
        subscriberId: target.subscriber.id,
        expires: Date.now() + 3600000,
      });
  }
  await save("bss-evidence", evidence.id, evidence);
  await audit(
    user,
    "BSS " + input.method + " " + target.operation.id,
    target.env.id + ":" + evidence.id,
  );
  return { ...result, evidence };
}
export async function purchaseAndPoll(user: User, input: BssInput) {
  const receipt = await bssRequest(user, input);
  if (receipt.status >= 400)
    throw new HttpError(
      502,
      "Purchase was rejected by BSS. It was not retried.",
    );
  const value = (receipt.data as { data?: unknown })?.data;
  const item = (Array.isArray(value) ? value[0] : value) as
    | { id?: string; attributes?: { status?: string; href?: string } }
    | undefined;
  if (["done", "completed", "success"].includes(item?.attributes?.status || ""))
    return { receipt, completed: true, polls: [] };
  const id =
    item?.attributes?.href?.match(
      /^\/?(?:api\/v1\/)?requests\/([A-Za-z0-9_-]+)$/,
    )?.[1] || item?.id;
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id))
    throw new HttpError(
      502,
      "Purchase outcome is unknown: no valid request receipt. Do not retry automatically.",
    );
  const env = await getEnvironment(input.environment),
    polls = [];
  for (let i = 0; i < env.pollAttempts; i++) {
    const polled = await bssRequest(user, {
      environment: env.id,
      method: "GET",
      path: "/requests/" + id,
    });
    polls.push(polled);
    const raw = (polled.data as { data?: unknown })?.data;
    const state = (Array.isArray(raw) ? raw[0] : raw) as {
      attributes?: { status?: string };
    };
    const status = state?.attributes?.status?.toLowerCase();
    if (
      polled.status >= 400 ||
      ["failed", "error", "rejected", "canceled", "cancelled"].includes(
        status || "",
      )
    )
      throw new HttpError(
        502,
        "Purchase request failed. No purchase retry was attempted.",
      );
    if (["done", "completed", "success"].includes(status || ""))
      return { receipt, completed: true, polls };
    if (i + 1 < env.pollAttempts)
      await new Promise((r) => setTimeout(r, env.pollDelayMs));
  }
  throw new HttpError(
    504,
    "Purchase polling timed out; outcome is unknown. Reconcile before retrying.",
  );
}
export async function operationRequest(
  user: User,
  environment: string,
  operationId: string,
  subscriber: Subscriber,
  body?: unknown,
  filters: Record<string, string> = {},
) {
  const op = await get<Operation>("operation", operationId);
  if (!op)
    throw new HttpError(400, "Verification operation is not configured.");
  const path = op.path.replace(
    "{subscriptionId}",
    encodeURIComponent(subscriber.subscriptionId || subscriber.id),
  );
  const query = new URLSearchParams(filters);
  return bssRequest(user, {
    environment,
    method: op.method,
    path: path + (query.size ? "?" + query : ""),
    body,
  });
}
