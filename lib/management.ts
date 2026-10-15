import { z } from "zod";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  pages,
  type RoleDefinition,
  type Environment,
  type Operation,
  type PortalSettings,
} from "./contracts";
import {
  get,
  list,
  save,
  remove,
  users,
  userById,
  query,
  transaction,
  allSubscribers,
  audit,
  createUser,
  setPassword,
} from "./db";
import {
  requirePermission,
  isAdmin,
  settings,
  requirePage,
  environmentId,
  HttpError,
} from "./policy";
import { runtimeConfig } from "./config";
import type { User, Subscriber } from "./types";
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(200);
const envNames = z.enum(["Test", "Production"]);
const variable = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .optional();
export const roleSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    pages: z.array(z.enum(pages)),
    permissions: z.array(
      z.enum(["bss.read", "bss.write", "bss.delete", "reports.all"]),
    ),
  })
  .strict();
export const envSchema = z
  .object({
    id: envNames,
    name: z.string().min(1).max(100),
    mode: z.enum(["simulated", "live"]),
    baseUrl: z.string().url(),
    enabled: z.boolean(),
    writesEnabled: z.boolean(),
    tlsVerify: z.boolean(),
    caFile: z.string().max(500).optional(),
    auth: z.enum(["none", "bearer", "basic"]),
    tokenEnv: variable,
    usernameEnv: variable,
    passwordEnv: variable,
    timeoutMs: z.number().int().min(100).max(120000),
    pollAttempts: z.number().int().min(1).max(100),
    pollDelayMs: z.number().int().min(100).max(10000),
  })
  .strict();
export const operationSchema = z
  .object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(100),
    name: z.string().min(1).max(100),
    method: z.enum(["GET", "POST", "PATCH", "DELETE"]),
    path: z
      .string()
      .regex(/^\/[A-Za-z0-9_{}\/-]+$/)
      .max(300),
    scope: z.enum(["subscriber", "catalog"]),
    parameters: z.array(z.object({ name: z.string(), required: z.boolean() })),
    filters: z.array(z.string().max(80)).max(20),
    bodyTemplate: z.unknown().optional(),
    source: z.string().max(300),
    enabled: z.boolean(),
    columns: z
      .array(z.object({ label: z.string().max(80), path: z.string().max(200) }))
      .max(20),
  })
  .strict();
export const settingsSchema = z
  .object({
    sharingEnabled: z.boolean(),
    productionApprovalRequired: z.boolean(),
    registrationEnabled: z.boolean(),
    maxBatchSize: z.number().int().min(1).max(500),
    defaultRole: z.string().max(100),
    sessionHours: z.number().int().min(1).max(72),
    ai: z
      .object({
        mode: z.enum(["rules", "model"]),
        url: z.string().max(500),
        model: z.string().max(100),
        tokenEnv: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
        enabled: z.boolean(),
      })
      .strict(),
    verification: z
      .array(
        z
          .object({
            id: z.string().max(80),
            label: z.string().max(100),
            operationId: z.string().max(100),
            kind: z.enum(["product", "offer", "da"]),
            recordsPath: z.string().max(200),
            productPath: z.string().min(1).max(200),
            idPath: z.string().min(1).max(200),
            unitPath: z.string().max(200).optional(),
            units: z.record(z.array(z.string().max(40))).optional(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export const subscriberSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    msisdn: z.string().regex(/^01\d{9}$/),
    subscriptionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(100),
    environment: envNames,
    contractId: z.string().max(100).optional(),
    owner: z.string().optional(),
    assignedUsers: z.array(z.string()).max(100).default([]),
    enabled: z.boolean().default(true),
    remarks: z.string().max(1000).default(""),
    tags: z.array(z.string().max(30)).max(10).default([]),
  })
  .strict();
export type Action = {
  type:
    | "user.create"
    | "user.update"
    | "user.reset"
    | "role.save"
    | "role.delete"
    | "subscriber.save"
    | "subscriber.approve"
    | "environment.save"
    | "operation.save"
    | "operation.delete"
    | "settings.save";
  payload: unknown;
};
export async function manage(user: User, action: Action) {
  if (action.type !== "subscriber.save") await requirePermission(user, "admin");
  else await requirePage(user, "Test MSISDNs");
  return transaction(async () => {
    if (runtimeConfig.driver === "mysql")
      await query(
        "SELECT id FROM documents WHERE kind='settings' AND id='portal' FOR UPDATE",
      );
    const current = await userById(user.id);
    if (!current || current.status !== "active")
      throw new HttpError(403, "Account is no longer active.");
    user = current;
    if (action.type === "subscriber.save")
      await requirePage(user, "Test MSISDNs");
    else await requirePermission(user, "admin");
    let output: unknown;
    switch (action.type) {
      case "user.create": {
        const b = z
          .object({
            name: z.string().trim().min(1).max(100),
            email: z.string().email().max(150),
            role: z.string(),
            password: passwordSchema,
          })
          .strict()
          .parse(action.payload);
        if (!(await get("role", b.role)))
          throw new HttpError(400, "Role does not exist.");
        output = await createUser({ ...b, status: "active" });
        break;
      }
      case "user.update": {
        const b = z
          .object({
            id: z.string(),
            name: z.string().min(1).max(100),
            role: z.string(),
            status: z.enum(["pending", "active", "rejected", "disabled"]),
          })
          .strict()
          .parse(action.payload);
        if (!(await get("role", b.role)))
          throw new HttpError(400, "Role does not exist.");
        await transaction(async () => {
          const all = await users(),
            current = all.find((u) => u.id === b.id);
          if (!current) throw new HttpError(404, "User not found.");
          if (
            current.role === "Admin" &&
            (b.role !== "Admin" || b.status !== "active") &&
            all.filter((u) => u.role === "Admin" && u.status === "active")
              .length <= 1
          )
            throw new HttpError(
              400,
              "The last active Admin cannot be removed.",
            );
          await query("UPDATE users SET name=?,role=?,status=? WHERE id=?", [
            b.name,
            b.role,
            b.status,
            b.id,
          ]);
          await query("DELETE FROM sessions WHERE user_id=?", [b.id]);
        });
        output = { ok: true };
        break;
      }
      case "user.reset": {
        const b = z.object({ id: z.string() }).strict().parse(action.payload);
        if (!(await users()).some((u) => u.id === b.id))
          throw new HttpError(404, "User not found.");
        const token = randomBytes(32).toString("hex");
        await save("reset", b.id, {
          hash: createHash("sha256").update(token).digest("hex"),
          expires: Date.now() + 30 * 60000,
        });
        output = { token, expiresInMinutes: 30 };
        break;
      }
      case "role.save": {
        const b = roleSchema.parse(action.payload);
        if (b.id === "Admin" || b.name.toLowerCase() === "admin")
          throw new HttpError(
            400,
            "The Admin role is reserved and always retains full access.",
          );
        const all = await list<RoleDefinition>("role");
        if (
          all.some(
            (r) =>
              r.id !== b.id && r.name.toLowerCase() === b.name.toLowerCase(),
          )
        )
          throw new HttpError(400, "Role name is already used.");
        await save("role", b.id, b);
        output = b;
        break;
      }
      case "role.delete": {
        const b = z.object({ id: z.string() }).strict().parse(action.payload);
        if (b.id === "Admin")
          throw new HttpError(400, "Admin cannot be deleted.");
        if (
          (await users()).some((u) => u.role === b.id) ||
          (await settings()).defaultRole === b.id
        )
          throw new HttpError(
            400,
            "Reassign users and the registration default role before deleting this role.",
          );
        await remove("role", b.id);
        output = { ok: true };
        break;
      }
      case "subscriber.save": {
        const b = subscriberSchema.parse(action.payload);
        const c = await settings();
        const all = await allSubscribers();
        const previous = b.id ? all.find((s) => s.id === b.id) : undefined;
        if (b.id && !previous)
          throw new HttpError(404, "Registration not found.");
        if (previous && !isAdmin(user) && previous.owner !== user.id)
          throw new HttpError(
            403,
            "Only Admin or the owner may modify or share this registration.",
          );
        if (previous && !isAdmin(user) && b.owner && b.owner !== previous.owner)
          throw new HttpError(403, "Only Admin may transfer ownership.");
        if (
          !c.sharingEnabled &&
          b.assignedUsers.some(
            (id) => !(previous?.assignedUsers || []).includes(id),
          )
        )
          throw new HttpError(400, "Sharing is disabled.");
        const owner = isAdmin(user)
          ? b.owner || previous?.owner || user.id
          : user.id;
        const members = await users();
        if (
          ![owner, ...b.assignedUsers].every((id) =>
            members.some((u) => u.id === id && u.status === "active"),
          )
        )
          throw new HttpError(
            400,
            "Owners and assigned users must be active portal users.",
          );
        if (
          all.some(
            (s) =>
              s.id !== b.id &&
              (s.msisdn === b.msisdn ||
                s.subscriptionId === b.subscriptionId) &&
              environmentId(s.environment) === b.environment,
          )
        )
          throw new HttpError(
            400,
            "This MSISDN or subscription identifier is already registered in the environment. Share its registration instead.",
          );
        const identityChanged =
          !previous ||
          previous.msisdn !== b.msisdn ||
          previous.subscriptionId !== b.subscriptionId ||
          environmentId(previous.environment) !== b.environment;
        const approval =
          b.environment === "Production" &&
          c.productionApprovalRequired &&
          identityChanged &&
          !isAdmin(user)
            ? "pending"
            : identityChanged
              ? "approved"
              : previous!.approval || "approved";
        const registration: Subscriber = {
          ...b,
          id:
            b.id ||
            createHash("sha256")
              .update(b.environment + ":" + b.msisdn)
              .digest("hex"),
          owner,
          assignedUsers: [...new Set(b.assignedUsers)].filter(
            (id) => id !== owner,
          ),
          approval,
          status: b.enabled ? "Active" : "Restricted",
        };
        await save("subscriber", registration.id, registration);
        output = registration;
        break;
      }
      case "subscriber.approve": {
        const b = z
          .object({
            id: z.string(),
            approval: z.enum(["approved", "rejected"]),
            remarks: z.string().max(1000).optional(),
          })
          .strict()
          .parse(action.payload);
        const s = await get<Subscriber>("subscriber", b.id);
        if (!s) throw new HttpError(404, "Registration not found.");
        await save("subscriber", s.id, {
          ...s,
          approval: b.approval,
          remarks: b.remarks ?? s.remarks,
        });
        output = { ok: true };
        break;
      }
      case "environment.save": {
        const b = envSchema.parse(action.payload),
          url = new URL(b.baseUrl);
        if (
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !["https:", "http:"].includes(url.protocol) ||
          (b.id === "Production" && url.protocol !== "https:")
        )
          throw new HttpError(
            400,
            "Use a credential-free base URL; Production requires HTTPS.",
          );
        await save("environment", b.id, b);
        output = b;
        break;
      }
      case "operation.save": {
        const b = operationSchema.parse(action.payload);
        if (
          b.path.includes("..") ||
          b.path.includes("//") ||
          (b.scope === "subscriber" &&
            !b.path.includes("{subscriptionId}") &&
            !(
              b.id === "requests" &&
              b.method === "GET" &&
              b.path === "/requests/{requestId}"
            )) ||
          (b.scope === "catalog" &&
            (b.method !== "GET" ||
              !/^\/(products|services)\/{productId}$/.test(b.path)))
        )
          throw new HttpError(
            400,
            "Operations require an explicit subscriber scope, or a read-only catalog resource path.",
          );
        await save("operation", b.id, b);
        output = b;
        break;
      }
      case "operation.delete": {
        const b = z.object({ id: z.string() }).strict().parse(action.payload);
        if ((await settings()).verification.some((v) => v.operationId === b.id))
          throw new HttpError(400, "Remove verification mappings first.");
        await remove("operation", b.id);
        output = { ok: true };
        break;
      }
      case "settings.save": {
        const b = settingsSchema.parse(action.payload);
        if (b.defaultRole === "Admin" || !(await get("role", b.defaultRole)))
          throw new HttpError(
            400,
            "Select a valid non-Admin registration role.",
          );
        for (const v of b.verification) {
          const op = await get<Operation>("operation", v.operationId);
          if (!op || op.method !== "GET" || op.scope !== "subscriber")
            throw new HttpError(
              400,
              "Verification must use registered subscriber GET operations.",
            );
        }
        if (
          b.ai.mode === "model" &&
          b.ai.enabled &&
          !b.ai.url.startsWith("https://")
        )
          throw new HttpError(400, "An enabled model provider requires HTTPS.");
        await save("settings", "portal", b);
        output = b;
        break;
      }
      default:
        throw new HttpError(400, "Unsupported management action.");
    }
    await audit(
      user,
      action.type,
      action.type.includes("reset")
        ? "Password reset token issued"
        : String((action.payload as { id?: string })?.id || action.type),
    );
    return output;
  });
}
