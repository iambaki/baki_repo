import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  db,
  authenticate,
  sessionUser,
  get,
  save,
  list,
  audit,
  allSubscribers,
} from "@/lib/db";
import { products, registry } from "@/lib/catalog";
import { validatePlan, executePlan, parsePrompt } from "@/lib/engine";
import type { Plan, Run, Audit, Subscriber } from "@/lib/types";
export const runtime = "nodejs";
function csv(value: unknown) {
  const s = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replaceAll('"', '""') + '"';
}
async function handler(req: NextRequest) {
  try {
    const path = req.nextUrl.pathname.replace("/api/", "");
    const method = req.method;
    if (method !== "GET") {
      const origin = req.headers.get("origin");
      const expectedOrigin =
        process.env.PTAT_PUBLIC_ORIGIN ||
        `${req.nextUrl.protocol}//${req.headers.get("host")}`;
      if (!origin || origin !== expectedOrigin)
        return NextResponse.json(
          { error: "Invalid request origin." },
          { status: 403 },
        );
      if (Number(req.headers.get("content-length") || 0) > 65536)
        return NextResponse.json(
          { error: "Request too large." },
          { status: 413 },
        );
    }
    if (path === "auth/login" && method === "POST") {
      const body = z
        .object({
          email: z.string().email().max(100),
          password: z.string().min(1).max(200),
        })
        .parse(await req.json());
      const user = authenticate(body.email.toLowerCase(), body.password);
      if (!user)
        return NextResponse.json(
          { error: "Email or password is incorrect." },
          { status: 401 },
        );
      const token = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
        token,
        user.id,
        Date.now() + 8 * 3600000,
      );
      audit(user, "Signed in", "UAT workspace");
      const response = NextResponse.json({ user });
      response.cookies.set("ptat_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.PTAT_SECURE_COOKIES === "true",
        path: "/",
        maxAge: 8 * 3600,
      });
      return response;
    }
    const token = req.cookies.get("ptat_session")?.value || "";
    const user = sessionUser(token);
    if (!user)
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (path === "auth/logout" && method === "POST") {
      db.prepare("DELETE FROM sessions WHERE token=?").run(token);
      const response = NextResponse.json({ ok: true });
      response.cookies.delete("ptat_session");
      return response;
    }
    const visibleRuns = () =>
      list<Run>("run").filter(
        (r) => user.role !== "Tester" || r.createdBy === user.id,
      );
    if (path === "workspace" && method === "GET")
      return NextResponse.json({
        user,
        products,
        registry,
        subscribers: allSubscribers().filter((s) => s.owner === user.id),
        runs: visibleRuns(),
        audit: list<Audit>("audit")
          .filter((a) => user.role !== "Tester" || a.actor === user.name)
          .slice(0, 100),
        mode: "SIMULATED",
      });
    if (path === "subscribers" && method === "POST") {
      if (user.role === "Auditor")
        return NextResponse.json({ error: "Read-only role." }, { status: 403 });
      const body = z
        .object({
          msisdn: z.string().regex(/^01\d{9}$/),
          tags: z.array(z.string().trim().min(1).max(30)).max(5).default([]),
        })
        .strict()
        .parse(await req.json());
      if (allSubscribers().some((s) => s.msisdn === body.msisdn))
        throw new Error("MSISDN is already registered.");
      const s: Subscriber = {
        ...body,
        id: randomUUID(),
        owner: user.id,
        environment: "UAT",
        status: "Active",
      };
      save("subscriber", s.id, s);
      audit(user, "Registered test MSISDN", s.id);
      return NextResponse.json({ subscriber: s }, { status: 201 });
    }
    if (path === "plans" && method === "POST") {
      const body = await req.json();
      const input =
        typeof body.prompt === "string"
          ? parsePrompt(body.prompt, allSubscribers())
          : body;
      const plan = validatePlan(input, user, allSubscribers());
      save("plan", plan.id, plan);
      audit(user, "Created validated plan", plan.id);
      return NextResponse.json({ plan }, { status: 201 });
    }
    const execute = path.match(/^plans\/([^/]+)\/execute$/);
    if (execute && method === "POST") {
      const plan = get<Plan>("plan", execute[1]);
      if (!plan)
        return NextResponse.json({ error: "Plan not found." }, { status: 404 });
      db.exec("BEGIN IMMEDIATE");
      try {
        const run = executePlan(plan, user, allSubscribers());
        save("run", run.id, run);
        save("plan", plan.id, { ...plan, status: "EXECUTED" });
        audit(user, "Executed simulated purchase plan", run.id);
        db.exec("COMMIT");
        return NextResponse.json({ run }, { status: 201 });
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    const report = path.match(/^runs\/([^/]+)\/report$/);
    if (report && method === "GET") {
      const run = visibleRuns().find((r) => r.id === report[1]);
      if (!run)
        return NextResponse.json({ error: "Run not found." }, { status: 404 });
      audit(user, "Exported UAT report", run.id);
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
            ? r.checks.map((c) => [
                run.id,
                "SIMULATED",
                "UAT",
                r.msisdn,
                r.status,
                c.name,
                c.expected,
                c.actual,
                c.passed ? "PASS" : "FAIL",
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
        rows.map((row) => row.map(csv).join(",")).join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="ptat-${run.id.slice(0, 8)}.csv"`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join("; ")
            : error instanceof Error
              ? error.message
              : "Request failed.",
      },
      { status: 400 },
    );
  }
}
export const GET = handler;
export const POST = handler;
