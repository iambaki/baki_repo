import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  get,
  save,
  list,
  audit,
  allSubscribers,
  authenticate,
  sessionUser,
  createSession,
  endSession,
  transaction,
  query,
  users,
} from "@/lib/db";
import { products, registry } from "@/lib/catalog";
import { validatePlan, executePlan, parsePrompt } from "@/lib/engine";
import { publicApi, extendedApi } from "@/lib/portal-api";
import {
  requirePage,
  requirePermission,
  visibleSubscribers,
  settings,
  access,
  environmentId,
  assertSubscriber,
  getEnvironment,
  HttpError,
} from "@/lib/policy";
import { manage } from "@/lib/management";
import { runtimeConfig } from "@/lib/config";
import type { Plan, Run, Audit } from "@/lib/types";
import type { Operation, Environment } from "@/lib/contracts";
export const runtime = "nodejs";
const csv = (v: unknown) => {
  const s = String(v ?? "");
  return (
    '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
  );
};
async function handler(req: NextRequest) {
  try {
    const path = req.nextUrl.pathname.replace("/api/", ""),
      method = req.method;
    let body: unknown;
    if (method !== "GET") {
      const expected =
        process.env.PTAT_PUBLIC_ORIGIN ||
        `${req.nextUrl.protocol}//${req.headers.get("host")}`;
      if (req.headers.get("origin") !== expected)
        throw new HttpError(403, "Invalid request origin.");
      if (
        Number(req.headers.get("content-length") || 0) >
        runtimeConfig.maxBodyBytes
      )
        throw new HttpError(413, "Request too large.");
      const reader = req.body?.getReader();
      let size = 0;
      const parts: Uint8Array[] = [];
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > runtimeConfig.maxBodyBytes) {
            await reader.cancel();
            throw new HttpError(413, "Request too large.");
          }
          parts.push(value);
        }
      }
      try {
        body = JSON.parse(Buffer.concat(parts).toString("utf8") || "{}");
      } catch {
        throw new HttpError(400, "Invalid JSON request.");
      }
    }
    if (
      method === "POST" &&
      ["auth/register", "auth/recover", "auth/reset"].includes(path)
    )
      return await publicApi(path, body);
    if (path === "auth/login" && method === "POST") {
      const b = z
        .object({
          email: z.string().email().max(150),
          password: z.string().min(1).max(200),
        })
        .strict()
        .parse(body);
      const user = await authenticate(b.email.toLowerCase(), b.password);
      if (!user) throw new HttpError(401, "Email or password is incorrect.");
      const c = await settings();
      const token = await createSession(user, c.sessionHours);
      await audit(user, "Signed in", "Workspace");
      const response = NextResponse.json({ user });
      response.cookies.set("ptat_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.PTAT_SECURE_COOKIES === "true",
        path: "/",
        maxAge: c.sessionHours * 3600,
      });
      return response;
    }
    const token = req.cookies.get("ptat_session")?.value || "";
    const user = await sessionUser(token);
    if (!user) throw new HttpError(401, "Please sign in.");
    if (path === "auth/logout" && method === "POST") {
      await endSession(token);
      const r = NextResponse.json({ ok: true });
      r.cookies.delete("ptat_session");
      return r;
    }
    const extended = await extendedApi(user, path, method, body);
    if (extended) return extended;
    const rights = await access(user),
      c = await settings();
    const visibleRuns = async () =>
      (await list<Run>("run")).filter(
        (r) =>
          rights.permissions.includes("reports.all") || r.createdBy === user.id,
      );
    if (path === "workspace" && method === "GET") {
      const all = await allSubscribers();
      return NextResponse.json({
        user: {
          ...user,
          roleName:
            (await get<{ name: string }>("role", user.role))?.name || user.role,
        },
        products:
          rights.pages.includes("Product catalog") ||
          rights.pages.includes("Test runs")
            ? products
            : [],
        registry: rights.pages.includes("API registry") ? registry : [],
        subscribers: rights.pages.includes("Test MSISDNs")
          ? await visibleSubscribers(user, all)
          : [],
        runs: rights.pages.includes("Test runs") ? await visibleRuns() : [],
        audit: rights.pages.includes("Audit trail")
          ? (await list<Audit>("audit"))
              .filter(
                (a) =>
                  rights.permissions.includes("reports.all") ||
                  a.actorId === user.id,
              )
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
              .slice(0, 100)
          : [],
        mode: "SIMULATED",
        access: rights,
        operations: await list<Operation>("operation"),
        environments: await list<Environment>("environment"),
        settings: c,
        directory: (await users())
          .filter((u) => u.status === "active")
          .map((u) => ({ id: u.id, name: u.name, email: u.email })),
        storage: runtimeConfig.driver,
      });
    }
    if (path === "subscribers" && method === "POST") {
      await requirePage(user, "Test MSISDNs");
      const b = z
        .object({
          msisdn: z.string().regex(/^01\d{9}$/),
          tags: z.array(z.string()).optional(),
        })
        .parse(body);
      const s = await manage(user, {
        type: "subscriber.save",
        payload: {
          name: b.msisdn,
          msisdn: b.msisdn,
          subscriptionId: b.msisdn,
          environment: "Test",
          tags: b.tags || [],
        },
      });
      return NextResponse.json({ subscriber: s }, { status: 201 });
    }
    if (path === "plans" && method === "POST") {
      await requirePage(user, "Test runs");
      await requirePermission(user, "bss.write");
      await requirePermission(user, "bss.read");
      if ((await getEnvironment("Test")).mode !== "simulated")
        throw new HttpError(
          400,
          "Legacy purchase scenarios are simulator-only. Use the BSS API portal or assistant for live requests.",
        );
      const all = await allSubscribers();
      const b = body as { prompt?: string; subscriberIds?: string[] };
      const input =
        typeof b.prompt === "string" ? parsePrompt(b.prompt, all) : body;
      const targetIds =
        (input as { subscriberIds: string[] }).subscriberIds || [];
      if (targetIds.length > c.maxBatchSize)
        throw new HttpError(400, "Configured batch limit exceeded.");
      for (const id of targetIds)
        assertSubscriber(
          user,
          all.find((s) => s.id === id),
          "Test",
          c.sharingEnabled,
        );
      const compatibility = all.map((s) => ({
        ...s,
        owner: user.id,
        environment: "UAT" as const,
      }));
      const plan = validatePlan(input, user, compatibility);
      await save("plan", plan.id, plan);
      await audit(user, "Created validated plan", plan.id);
      return NextResponse.json({ plan }, { status: 201 });
    }
    const execute = path.match(/^plans\/([^/]+)\/execute$/);
    if (execute && method === "POST") {
      await requirePage(user, "Test runs");
      await requirePermission(user, "bss.write");
      await requirePermission(user, "bss.read");
      const env = await getEnvironment("Test");
      if (env.mode !== "simulated" || !env.writesEnabled)
        throw new HttpError(
          403,
          "Legacy scenarios require enabled simulator writes.",
        );
      const run = await transaction(async () => {
        if (runtimeConfig.driver === "mysql")
          await query(
            "SELECT id FROM documents WHERE kind='plan' AND id=? FOR UPDATE",
            [execute[1]],
          );
        const plan = await get<Plan>("plan", execute[1]);
        if (!plan) throw new HttpError(404, "Plan not found.");
        const all = await allSubscribers();
        for (const id of plan.subscriberIds)
          assertSubscriber(
            user,
            all.find((s) => s.id === id),
            "Test",
            c.sharingEnabled,
          );
        const r = executePlan(
          plan,
          user,
          all.map((s) => ({
            ...s,
            owner: user.id,
            environment: "UAT" as const,
          })),
        );
        await save("run", r.id, r);
        await save("plan", plan.id, { ...plan, status: "EXECUTED" });
        await audit(user, "Executed simulated purchase plan", r.id);
        return r;
      });
      return NextResponse.json({ run }, { status: 201 });
    }
    const report = path.match(/^runs\/([^/]+)\/report$/);
    if (report && method === "GET") {
      await requirePage(user, "Test runs");
      const run = (await visibleRuns()).find((r) => r.id === report[1]);
      if (!run) throw new HttpError(404, "Run not found.");
      await audit(user, "Exported UAT report", run.id);
      const rows = [
        [
          "Run",
          "Mode",
          "Environment",
          "MSISDN",
          "Result",
          "Check",
          "Expected",
          "Actual",
          "Outcome",
        ],
        ...run.results.flatMap((r) =>
          r.checks.length
            ? r.checks.map((v) => [
                run.id,
                "SIMULATED",
                "UAT",
                r.msisdn,
                r.status,
                v.name,
                v.expected,
                v.actual,
                v.passed ? "PASS" : "FAIL",
              ])
            : [
                [
                  run.id,
                  "SIMULATED",
                  "UAT",
                  r.msisdn,
                  r.status,
                  "Execution",
                  "Completed",
                  r.error,
                  "ERROR",
                ],
              ],
        ),
      ];
      return new NextResponse(
        rows.map((r) => r.map(csv).join(",")).join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="ptat-${run.id.slice(0, 8)}.csv"`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (e) {
    const status =
      e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 400;
    const message =
      e instanceof z.ZodError
        ? e.issues.map((i) => i.message).join("; ")
        : e instanceof Error
          ? e.message
          : "Request failed.";
    const sanitized =
      /password.*access denied|connect ECONN|ER_ACCESS_DENIED|Unknown database/i.test(
        message,
      )
        ? "Database connection unavailable. Check server configuration."
        : message;
    return NextResponse.json({ error: sanitized }, { status });
  }
}
async function privateResponse(req: NextRequest) {
  const response = await handler(req);
  if (response) response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = privateResponse;
export const POST = privateResponse;
