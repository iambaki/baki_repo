import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const base = process.env.PTAT_TEST_URL || "http://localhost:3010";
let assertions = 0,
  hits = 0,
  purchases = 0,
  polls = 0,
  redirect = false;
const handler = (req, res) => {
  hits++;
  if (redirect) {
    redirect = false;
    res.writeHead(302, { Location: "https://must-not-follow.example.invalid" });
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/vnd.api+json");
  const path = new URL(req.url, "http://fixture").pathname;
  if (req.method === "POST") {
    purchases++;
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      assert.equal(JSON.parse(raw).data.type, "products");
      res.writeHead(202);
      res.end(
        JSON.stringify({
          data: [
            {
              type: "products",
              id: "fixture-request",
              attributes: {
                status: "scheduled",
                href: "/api/v1/requests/fixture-request",
              },
            },
          ],
        }),
      );
    });
    return;
  }
  if (path.includes("/requests/")) {
    polls++;
    res.end(
      JSON.stringify({
        data: {
          type: "requests",
          id: "fixture-request",
          attributes: { status: polls >= 2 ? "done" : "pending" },
        },
      }),
    );
    return;
  }
  if (path.endsWith("/products")) {
    res.end(
      JSON.stringify({
        data: [
          {
            id: "instance",
            type: "subscription-products",
            attributes: { status: "active" },
            relationships: {
              product: { data: { id: "P123", type: "products" } },
            },
          },
        ],
      }),
    );
    return;
  }
  res.end(
    JSON.stringify({
      data: [
        {
          id: "main",
          type: "balances",
          attributes: {
            amount: 777,
            unit: "BDT",
            token: "fixture-sensitive-response",
            msisdn: "01900000001",
          },
        },
      ],
    }),
  );
};
const dir = mkdtempSync(join(tmpdir(), "ptat-tls-fixture-")),
  key = join(dir, "key.pem"),
  cert = join(dir, "cert.pem");
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=IP:127.0.0.1,DNS:localhost",
  ],
  { stdio: "pipe" },
);
const plain = httpServer(handler),
  secure = httpsServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    handler,
  );
await new Promise((r) => plain.listen(0, "127.0.0.1", r));
await new Promise((r) => secure.listen(0, "127.0.0.1", r));
const request = async (path, body, cookie) => {
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
};
const eq = (a, b) => {
  assert.equal(a, b);
  assertions++;
};
let admin, original;
try {
  const login = await request("auth/login", {
    email: "admin@ptat.local",
    password: process.env.PTAT_DEMO_PASSWORD || "UatDemo!2026",
  });
  eq(login.status, 200);
  admin = login.cookie;
  original = (await request("admin", undefined, admin)).data;
  const env = original.environments.find((e) => e.id === "Test"),
    prod = original.environments.find((e) => e.id === "Production");
  eq(
    (
      await request(
        "manage",
        {
          type: "environment.save",
          payload: {
            ...env,
            mode: "live",
            baseUrl: `http://127.0.0.1:${plain.address().port}/api/v1`,
            auth: "none",
            writesEnabled: true,
            pollAttempts: 3,
            pollDelayMs: 100,
          },
        },
        admin,
      )
    ).status,
    200,
  );
  const input = {
    environment: "Test",
    method: "GET",
    path: "/subscriptions/1001/balances",
  };
  const result = await request("bss/request", input, admin);
  eq(result.status, 200);
  eq(result.data.simulated, false);
  eq(result.data.data.data[0].attributes.amount, 777);
  eq(result.data.data.data[0].attributes.token, "[REDACTED]");
  assert.ok(!JSON.stringify(result.data.evidence).includes("01900000001"));
  assertions++;
  const before = hits;
  eq(
    (await request("bss/request", { ...input, path: "/customers/999" }, admin))
      .status,
    403,
  );
  eq(hits, before);
  redirect = true;
  eq((await request("bss/request", input, admin)).status, 502);
  const plan = await request(
    "assistant/plan",
    { environment: "Test", prompt: "Purchase P123 for 01900000001" },
    admin,
  );
  eq(plan.status, 200);
  const execute = await request(
    "assistant/plans/" + plan.data.plan.id + "/execute",
    { confirmed: true },
    admin,
  );
  eq(execute.status, 200);
  eq(purchases, 1);
  eq(polls, 2);
  eq(
    execute.data.result.some((r) => r.completed === true),
    true,
  );
  eq(
    (
      await request(
        "manage",
        {
          type: "environment.save",
          payload: {
            ...prod,
            enabled: true,
            auth: "none",
            baseUrl: "http://127.0.0.1:" + plain.address().port + "/api/v1",
          },
        },
        admin,
      )
    ).status,
    400,
  );
  const productionSubject = await request(
    "manage",
    {
      type: "subscriber.save",
      payload: {
        ...(original.subscribers.find(
          (s) => s.msisdn === "01988888888" && s.environment === "Production",
        )
          ? {
              id: original.subscribers.find(
                (s) =>
                  s.msisdn === "01988888888" && s.environment === "Production",
              ).id,
            }
          : {}),
        name: "Local TLS contract fixture",
        msisdn: "01988888888",
        subscriptionId: "tls-fixture",
        environment: "Production",
        owner: "admin",
        assignedUsers: [],
        enabled: true,
        remarks: "Local automated TLS validation",
        tags: [],
      },
    },
    admin,
  );
  eq(productionSubject.status, 200);
  const prodEnv = {
    ...prod,
    enabled: true,
    mode: "live",
    auth: "none",
    tlsVerify: true,
    baseUrl: `https://127.0.0.1:${secure.address().port}/api/v1`,
  };
  eq(
    (
      await request(
        "manage",
        { type: "environment.save", payload: prodEnv },
        admin,
      )
    ).status,
    200,
  );
  const prodRequest = {
    environment: "Production",
    method: "GET",
    path: "/subscriptions/tls-fixture/balances",
  };
  eq((await request("bss/request", prodRequest, admin)).status, 502);
  await request(
    "manage",
    { type: "environment.save", payload: { ...prodEnv, tlsVerify: false } },
    admin,
  );
  eq((await request("bss/request", prodRequest, admin)).status, 200);
  await request(
    "manage",
    {
      type: "environment.save",
      payload: { ...prodEnv, tlsVerify: true, caFile: cert },
    },
    admin,
  );
  eq((await request("bss/request", prodRequest, admin)).status, 200);
  console.log(
    `Live proxy fixture passed: ${assertions} assertions. Real local HTTP/HTTPS, masked responses, unknown-path rejection, no redirects, scheduled polling without purchase retry, Production HTTPS, strict TLS rejection, requested bypass and verified custom CA.`,
  );
} finally {
  if (admin && original)
    for (const env of original.environments)
      await request(
        "manage",
        { type: "environment.save", payload: env },
        admin,
      );
  plain.closeAllConnections();
  secure.closeAllConnections();
  await Promise.all([
    new Promise((r) => plain.close(r)),
    new Promise((r) => secure.close(r)),
  ]);
}
