import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  get,
  list,
  save,
  remove,
  users,
  query,
  createUser,
  setPassword,
  authenticate,
  allSubscribers,
  audit,
  transaction,
} from "./db";
import {
  requirePage,
  requirePermission,
  settings,
  access,
  isAdmin,
  HttpError,
  environmentId,
  visibleSubscribers,
  getEnvironment,
  assertSubscriber,
} from "./policy";
import { manage, passwordSchema, type Action } from "./management";
import { bssRequest, operationRequest, redact } from "./bss";
import { verifyBatch, parseBatch } from "./verification";
import { createAssistantPlan, executeAssistantPlan } from "./assistant";
import {
  pages,
  type PageName,
  type Environment,
  type Operation,
  type RoleDefinition,
} from "./contracts";
import type { User, Subscriber } from "./types";
const registration = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().email().max(150),
    password: passwordSchema,
  })
  .strict();
export async function publicApi(path: string, body: unknown) {
  if (path === "auth/register") {
    const c = await settings();
    if (!c.registrationEnabled)
      throw new HttpError(403, "Self-registration is disabled.");
    const data = registration.parse(body);
    await createUser({ ...data, role: c.defaultRole, status: "pending" });
    return NextResponse.json(
      {
        message:
          "Registration submitted. An administrator must approve your account.",
      },
      { status: 201 },
    );
  }
  if (path === "auth/recover") {
    const data = z
      .object({ email: z.string().email().max(150) })
      .strict()
      .parse(body);
    const u = (await users()).find((u) => u.email === data.email.toLowerCase());
    if (u)
      await save("recovery", u.id, {
        userId: u.id,
        requestedAt: new Date().toISOString(),
      });
    return NextResponse.json({
      message:
        "If the account exists, an administrator can issue a one-time reset token. Contact your administrator.",
    });
  }
  if (path === "auth/reset") {
    const b = z
      .object({
        email: z.string().email(),
        token: z.string().length(64),
        password: passwordSchema,
      })
      .strict()
      .parse(body);
    await transaction(async () => {
      const u = (await users()).find((u) => u.email === b.email.toLowerCase());
      if (!u) throw new HttpError(400, "Invalid or expired reset token.");
      if ((await import("./config")).runtimeConfig.driver === "mysql")
        await query(
          "SELECT id FROM documents WHERE kind='reset' AND id=? FOR UPDATE",
          [u.id],
        );
      const reset = await get<{ hash: string; expires: number }>("reset", u.id);
      if (
        !reset ||
        reset.expires < Date.now() ||
        reset.hash !== createHash("sha256").update(b.token).digest("hex")
      )
        throw new HttpError(400, "Invalid or expired reset token.");
      await setPassword(u.id, b.password);
      await remove("reset", u.id);
      await remove("recovery", u.id);
      await audit(u, "Reset password", "Account");
    });
    return NextResponse.json({
      message: "Password reset. You can sign in after account approval.",
    });
  }
}
export async function extendedApi(
  user: User,
  path: string,
  method: string,
  body: unknown,
) {
  if (path === "auth/password" && method === "POST") {
    const b = z
      .object({
        currentPassword: z.string().max(200),
        password: passwordSchema,
      })
      .strict()
      .parse(body);
    if (!(await authenticate(user.email, b.currentPassword)))
      throw new HttpError(400, "Current password is incorrect.");
    await setPassword(user.id, b.password);
    await audit(user, "Changed password", "Account");
    return NextResponse.json({ message: "Password changed. Sign in again." });
  }
  if (path === "capabilities" && method === "GET")
    return NextResponse.json(await access(user));
  if (path === "admin" && method === "GET") {
    await requirePermission(user, "admin");
    return NextResponse.json({
      users: await users(),
      roles: await list<RoleDefinition>("role"),
      environments: await list<Environment>("environment"),
      operations: await list<Operation>("operation"),
      settings: await settings(),
      subscribers: await allSubscribers(),
      recoveries: await list("recovery"),
      pages,
    });
  }
  if (path === "manage" && method === "POST") {
    const b = z
      .object({
        type: z.enum([
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
        ]),
        payload: z.unknown(),
      })
      .strict()
      .parse(body);
    await requirePage(
      user,
      b.type === "subscriber.save" ? "Test MSISDNs" : "Administration",
    );
    return NextResponse.json({ result: await manage(user, b as Action) });
  }
  if (path === "bss/operations" && method === "GET") {
    await requirePage(user, "API portal");
    return NextResponse.json({
      operations: await list<Operation>("operation"),
      environments: await list<Environment>("environment"),
    });
  }
  if (path === "bss/request" && method === "POST") {
    await requirePage(user, "API portal");
    const b = z
      .object({
        environment: z.enum(["Test", "Production"]),
        method: z.enum(["GET", "POST", "PATCH", "DELETE"]),
        path: z.string().max(2048),
        body: z.unknown().optional(),
        confirmed: z.boolean().optional(),
      })
      .strict()
      .parse(body);
    if (b.method !== "GET" && !b.confirmed)
      throw new HttpError(
        400,
        "Confirm the write/delete request before execution.",
      );
    const response = await bssRequest(user, b);
    return NextResponse.json({ ...response, data: redact(response.data) });
  }
  if (path === "bundle/verify" && method === "POST") {
    const b = z
      .object({
        environment: z.enum(["Test", "Production"]),
        csv: z.string().max(200000),
        page: z
          .enum(["Bundle verification", "Batch Report", "Product explorer"])
          .default("Bundle verification"),
      })
      .strict()
      .parse(body);
    await requirePage(user, b.page);
    await requirePermission(user, "bss.read");
    const report = await verifyBatch(
      user,
      b.environment,
      parseBatch(b.csv, (await settings()).maxBatchSize),
    );
    return NextResponse.json({ report });
  }
  if (path === "bundle/reports" && method === "GET") {
    await requirePage(user, "Batch Report");
    const rights = await access(user);
    return NextResponse.json({
      reports: (await list<{ createdBy: string }>("bundle-report")).filter(
        (r) =>
          rights.permissions.includes("reports.all") || r.createdBy === user.id,
      ),
    });
  }
  const report = path.match(/^bundle\/reports\/([^/]+)\/export$/);
  if (report && method === "GET") {
    const permitted = await access(user);
    if (
      !permitted.pages.some((p) =>
        ["Bundle verification", "Batch Report", "Product explorer"].includes(p),
      )
    )
      throw new HttpError(403, "Your role cannot export bundle reports.");
    const r = await get<{ createdBy: string }>("bundle-report", report[1]);
    if (
      !r ||
      (r.createdBy !== user.id &&
        !(await access(user)).permissions.includes("reports.all"))
    )
      throw new HttpError(404, "Report not found.");
    await audit(user, "Exported bundle evidence report", report[1]);
    return new NextResponse(JSON.stringify(r, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bundle-${report[1]}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (path === "subscriber360" && method === "POST") {
    await requirePage(user, "Subscriber 360");
    await requirePermission(user, "bss.read");
    const b = z
      .object({
        environment: z.enum(["Test", "Production"]),
        identifier: z.string().min(1).max(100),
      })
      .strict()
      .parse(body);
    const c = await settings();
    const subject = assertSubscriber(
      user,
      (await allSubscribers()).find(
        (s) =>
          environmentId(s.environment) === b.environment &&
          [s.msisdn, s.subscriptionId, s.contractId, s.id].includes(
            b.identifier,
          ),
      ),
      b.environment,
      c.sharingEnabled,
    );
    const tabs = [];
    for (const id of [
      "subscription",
      "balances",
      "subscription-type",
      "products",
      "offers",
      "services",
      "barrings",
      "loans",
      "billing",
      "rate-plan",
      "sims",
      "devices",
      "usage",
    ]) {
      const op = await get<Operation>("operation", id);
      if (!op?.enabled) {
        tabs.push({
          id,
          name: op?.name || id,
          available: false,
          error: "API mapping is disabled or not configured.",
        });
        continue;
      }
      try {
        const response = await operationRequest(
          user,
          b.environment,
          id,
          subject,
        );
        tabs.push({
          id,
          name: op.name,
          available: response.status < 400,
          ...response,
          data: redact(response.data),
        });
      } catch (e) {
        tabs.push({
          id,
          name: op.name,
          available: false,
          error: e instanceof Error ? e.message : "Unavailable",
        });
      }
    }
    return NextResponse.json({ subscriber: subject, tabs });
  }
  if (path === "assistant/plan" && method === "POST") {
    await requirePage(user, "AI BSS Assistant");
    const b = z
      .object({
        prompt: z.string().min(3).max(8000),
        environment: z.enum(["Test", "Production"]),
      })
      .strict()
      .parse(body);
    return NextResponse.json({
      plan: await createAssistantPlan(user, b.prompt, b.environment),
    });
  }
  const assistant = path.match(/^assistant\/plans\/([^/]+)\/execute$/);
  if (assistant && method === "POST") {
    await requirePage(user, "AI BSS Assistant");
    const b = z
      .object({
        confirmed: z.literal(true),
        password: passwordSchema.optional(),
      })
      .strict()
      .parse(body);
    return NextResponse.json({
      result: await executeAssistantPlan(user, assistant[1], b.password),
    });
  }
}
