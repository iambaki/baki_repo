import { get } from "./db";
import {
  defaultSettings,
  pages,
  type PortalSettings,
  type RoleDefinition,
  type Permission,
  type PageName,
  type Environment,
} from "./contracts";
import type { Subscriber, User } from "./types";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const isAdmin = (u: User) => u.role === "Admin";
export async function settings() {
  return (await get<PortalSettings>("settings", "portal")) || defaultSettings;
}
export async function role(u: User) {
  return get<RoleDefinition>("role", u.role);
}
export async function requirePermission(u: User, p: Permission) {
  if (isAdmin(u)) return;
  const r = await role(u);
  if (!r?.permissions.includes(p))
    throw new HttpError(403, "Your role does not permit this operation.");
}
export async function requirePage(u: User, p: PageName) {
  if (isAdmin(u)) return;
  const r = await role(u);
  if (!r?.pages.includes(p))
    throw new HttpError(403, "Your role cannot access this page.");
}
export function environmentId(v: string) {
  return v === "UAT" ? "Test" : v;
}
export function canSeeSubscriber(u: User, s: Subscriber, sharing: boolean) {
  return (
    isAdmin(u) ||
    s.owner === u.id ||
    (sharing && (s.assignedUsers || []).includes(u.id))
  );
}
export function assertSubscriber(
  u: User,
  s: Subscriber | undefined,
  env: string,
  sharing: boolean,
) {
  if (
    !s ||
    environmentId(s.environment) !== environmentId(env) ||
    !canSeeSubscriber(u, s, sharing)
  )
    throw new HttpError(
      403,
      "Subscriber is not registered for you in this environment.",
    );
  if (
    s.enabled === false ||
    s.status !== "Active" ||
    (s.approval && s.approval !== "approved")
  )
    throw new HttpError(403, "Subscriber is disabled or awaiting approval.");
  return s;
}
export async function getEnvironment(id: string) {
  const e = await get<Environment>("environment", environmentId(id));
  if (!e || !e.enabled) throw new HttpError(400, "Environment is unavailable.");
  return e;
}
export async function visibleSubscribers(u: User, all: Subscriber[]) {
  const c = await settings();
  return all.filter((s) => canSeeSubscriber(u, s, c.sharingEnabled));
}
export async function access(u: User) {
  const r = await role(u);
  return {
    pages: isAdmin(u) ? pages : r?.pages || [],
    permissions: isAdmin(u)
      ? ["admin", "bss.read", "bss.write", "bss.delete", "reports.all"]
      : r?.permissions || [],
  };
}
