import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createPool, type PoolConnection } from "mysql2/promise";
import { runtimeConfig } from "./config";
import { subscribers } from "./catalog";
import {
  defaultRoles,
  defaultSettings,
  defaultEnvironments,
  defaultOperations,
} from "./contracts";
import type { User, Plan, Run, Audit, Subscriber } from "./types";
type Row = Record<string, unknown>;
type Backend = {
  query: (sql: string, args?: unknown[]) => Promise<Row[]>;
  transaction: <T>(fn: () => Promise<T>) => Promise<T>;
};
let ready: Promise<Backend> | undefined;
const connectionContext = new AsyncLocalStorage<PoolConnection>();
const sqliteTransaction = new AsyncLocalStorage<boolean>();
async function initialize(): Promise<Backend> {
  mkdirSync(runtimeConfig.dataDir, { recursive: true });
  let backend: Backend;
  if (runtimeConfig.driver === "sqlite") {
    const db = new DatabaseSync(join(runtimeConfig.dataDir, "ptat.sqlite"));
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
    let queue: Promise<unknown> = Promise.resolve();
    backend = {
      query: async (sql, args = []) => {
        const stmt = db.prepare(sql);
        return /^(SELECT|PRAGMA)/i.test(sql.trim())
          ? (stmt.all(...(args as (string | number | null)[])) as Row[])
          : (stmt.run(...(args as (string | number | null)[])), []);
      },
      transaction: async <T>(fn: () => Promise<T>) => {
        if (sqliteTransaction.getStore()) return fn();
        const job = queue.then(async () => {
          return sqliteTransaction.run(true, async () => {
            db.exec("BEGIN IMMEDIATE");
            try {
              const r = await fn();
              db.exec("COMMIT");
              return r;
            } catch (e) {
              db.exec("ROLLBACK");
              throw e;
            }
          });
        });
        queue = job.catch(() => {});
        return job;
      },
    };
  } else if (runtimeConfig.driver === "mysql") {
    const pool = process.env.MYSQL_URL
      ? createPool(process.env.MYSQL_URL)
      : createPool({ ...runtimeConfig.mysql, connectionLimit: 10 });
    backend = {
      query: async (sql, args = []) => {
        const [rows] = await (connectionContext.getStore() || pool).query(
          sql,
          args,
        );
        return Array.isArray(rows) ? (rows as Row[]) : [];
      },
      transaction: async <T>(fn: () => Promise<T>) => {
        if (connectionContext.getStore()) return fn();
        const c = await pool.getConnection();
        try {
          return await connectionContext.run(c, async () => {
            await c.beginTransaction();
            try {
              const r = await fn();
              await c.commit();
              return r;
            } catch (e) {
              await c.rollback();
              throw e;
            }
          });
        } finally {
          c.release();
        }
      },
    };
  } else throw new Error("PTAT_DB_DRIVER must be mysql or sqlite.");
  const q = backend.query;
  await q(
    "CREATE TABLE IF NOT EXISTS users (id VARCHAR(100) PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL, role VARCHAR(100) NOT NULL, salt VARCHAR(100) NOT NULL, hash VARCHAR(200) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'active')",
  );
  if (
    runtimeConfig.driver === "sqlite" &&
    !(await q("PRAGMA table_info(users)")).some((c) => c.name === "status")
  )
    await q(
      "ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'",
    );
  await q(
    "CREATE TABLE IF NOT EXISTS sessions (token VARCHAR(100) PRIMARY KEY, user_id VARCHAR(100) NOT NULL, expires BIGINT NOT NULL)",
  );
  await q(
    "CREATE TABLE IF NOT EXISTS documents (kind VARCHAR(64) NOT NULL, id VARCHAR(100) NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id))",
  );
  if (runtimeConfig.driver === "mysql")
    await q("ALTER TABLE documents MODIFY body LONGTEXT NOT NULL");
  await q(
    "CREATE TABLE IF NOT EXISTS login_attempts (email VARCHAR(150) PRIMARY KEY, count INTEGER NOT NULL, since BIGINT NOT NULL)",
  );
  const ignore =
    runtimeConfig.driver === "mysql" ? "INSERT IGNORE" : "INSERT OR IGNORE";
  const legacyPath = join(runtimeConfig.dataDir, "ptat.sqlite");
  if (
    runtimeConfig.driver === "mysql" &&
    existsSync(legacyPath) &&
    !(
      await q(
        "SELECT id FROM documents WHERE kind='migration' AND id='sqlite-v1'",
      )
    ).length
  ) {
    const legacy = new DatabaseSync(legacyPath, { readOnly: true });
    try {
      for (const u of legacy.prepare("SELECT * FROM users").all() as Row[])
        await q(
          `${ignore} INTO users (id,name,email,role,salt,hash,status) VALUES (?,?,?,?,?,?,?)`,
          [u.id, u.name, u.email, u.role, u.salt, u.hash, u.status || "active"],
        );
      for (const d of legacy
        .prepare("SELECT kind,id,body FROM documents")
        .all() as Row[])
        await q(`${ignore} INTO documents (kind,id,body) VALUES (?,?,?)`, [
          d.kind,
          d.id,
          d.body,
        ]);
      await q(`${ignore} INTO documents VALUES ('migration','sqlite-v1',?)`, [
        JSON.stringify({
          completedAt: new Date().toISOString(),
          sessionsMigrated: false,
        }),
      ]);
    } finally {
      legacy.close();
    }
  }
  const initialPassword =
    process.env.PTAT_ADMIN_PASSWORD ||
    process.env.PTAT_DEMO_PASSWORD ||
    (process.env.NODE_ENV !== "production" ? "UatDemo!2026" : "");
  const accounts = [
    ["admin", "Portal Administrator", "admin@ptat.local", "Admin"],
    ["lead", "Nadia Rahman", "lead@ptat.local", "Test Lead"],
    ["tester", "Arif Hasan", "tester@ptat.local", "Tester"],
    ["auditor", "Sarah Ahmed", "auditor@ptat.local", "Auditor"],
  ];
  for (const [id, name, email, role] of accounts) {
    if ((await q("SELECT id FROM users WHERE id=?", [id])).length) continue;
    if (!initialPassword)
      throw new Error("Set PTAT_ADMIN_PASSWORD before initial database setup.");
    const salt = randomUUID();
    await q(
      `${ignore} INTO users (id,name,email,role,salt,hash,status) VALUES (?,?,?,?,?,?,'active')`,
      [
        id,
        name,
        email,
        role,
        salt,
        scryptSync(initialPassword, salt, 64).toString("hex"),
      ],
    );
  }
  const seeds: [string, string, unknown][] = [
    ...defaultRoles.map((r) => ["role", r.id, r] as [string, string, unknown]),
    ...defaultEnvironments.map(
      (e) => ["environment", e.id, e] as [string, string, unknown],
    ),
    ...defaultOperations.map(
      (o) => ["operation", o.id, o] as [string, string, unknown],
    ),
    ["settings", "portal", defaultSettings],
    ...subscribers.map(
      (s) =>
        [
          "subscriber",
          s.id,
          {
            ...s,
            name: "Demo " + s.msisdn,
            subscriptionId: s.id,
            assignedUsers: [],
            enabled: s.status === "Active",
            approval: "approved",
            remarks: "Demonstration registry",
          },
        ] as [string, string, unknown],
    ),
  ];
  if (
    !(
      await q(
        "SELECT id FROM documents WHERE kind='migration' AND id='portal-v2'",
      )
    ).length
  ) {
    for (const [kind, id, value] of seeds)
      await q(`${ignore} INTO documents VALUES (?,?,?)`, [
        kind,
        id,
        JSON.stringify(value),
      ]);
    await q(`${ignore} INTO documents VALUES ('migration','portal-v2',?)`, [
      JSON.stringify({ completedAt: new Date().toISOString() }),
    ]);
  }
  return backend;
}
export async function database() {
  return await (ready ??= initialize().catch((e) => {
    ready = undefined;
    throw e;
  }));
}
export async function query(sql: string, args: unknown[] = []) {
  return (await database()).query(sql, args);
}
export async function transaction<T>(fn: () => Promise<T>) {
  return (await database()).transaction(fn);
}
export async function save(kind: string, id: string, value: unknown) {
  await query(
    runtimeConfig.driver === "mysql"
      ? "INSERT INTO documents VALUES (?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body)"
      : "INSERT INTO documents VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
    [kind, id, JSON.stringify(value)],
  );
}
export async function get<T>(kind: string, id: string): Promise<T | undefined> {
  const [r] = await query("SELECT body FROM documents WHERE kind=? AND id=?", [
    kind,
    id,
  ]);
  return r ? JSON.parse(r.body as string) : undefined;
}
export async function list<T>(kind: string): Promise<T[]> {
  return (await query("SELECT body FROM documents WHERE kind=?", [kind]))
    .map((r) => JSON.parse(r.body as string))
    .reverse()
    .sort((a, b) =>
      String(b.createdAt || b.timestamp || "").localeCompare(
        String(a.createdAt || a.timestamp || ""),
      ),
    );
}
export async function remove(kind: string, id: string) {
  await query("DELETE FROM documents WHERE kind=? AND id=?", [kind, id]);
}
const publicUser = (r: Row): User => ({
  id: String(r.id),
  name: String(r.name),
  email: String(r.email),
  role: String(r.role),
  status: r.status as User["status"],
});
export async function users() {
  return (
    await query("SELECT id,name,email,role,status FROM users ORDER BY name")
  ).map(publicUser);
}
export async function userById(id: string) {
  const [row] = await query(
    "SELECT id,name,email,role,status FROM users WHERE id=?",
    [id],
  );
  return row ? publicUser(row) : undefined;
}
export async function authenticate(
  email: string,
  password: string,
): Promise<User | undefined> {
  const now = Date.now();
  const [a] = await query(
    "SELECT count,since FROM login_attempts WHERE email=?",
    [email],
  );
  if (a && now - Number(a.since) < 900000 && Number(a.count) >= 10)
    throw new Error("Too many login attempts. Try again in 15 minutes.");
  const [r] = await query("SELECT * FROM users WHERE email=?", [email]);
  const hash = scryptSync(password, String(r?.salt || "invalid-user"), 64);
  if (!r || !timingSafeEqual(hash, Buffer.from(String(r.hash), "hex"))) {
    const count = a && now - Number(a.since) < 900000 ? Number(a.count) + 1 : 1;
    await query("DELETE FROM login_attempts WHERE email=?", [email]);
    await query("INSERT INTO login_attempts VALUES (?,?,?)", [
      email,
      count,
      now,
    ]);
    return;
  }
  if (r.status !== "active")
    throw new Error("Your account is awaiting approval or disabled.");
  await query("DELETE FROM login_attempts WHERE email=?", [email]);
  return publicUser(r);
}
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export async function createSession(user: User, hours: number) {
  const token = randomBytes(32).toString("hex");
  await query("DELETE FROM sessions WHERE expires<?", [Date.now()]);
  await query("INSERT INTO sessions VALUES (?,?,?)", [
    digest(token),
    user.id,
    Date.now() + hours * 3600000,
  ]);
  return token;
}
export async function endSession(token: string) {
  await query("DELETE FROM sessions WHERE token=?", [digest(token)]);
}
export async function sessionUser(token: string): Promise<User | undefined> {
  if (!token) return;
  const [r] = await query(
    "SELECT u.id,u.name,u.email,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.status='active'",
    [digest(token), Date.now()],
  );
  return r ? publicUser(r) : undefined;
}
export async function createUser(i: {
  name: string;
  email: string;
  password: string;
  role: string;
  status: User["status"];
}) {
  const id = randomUUID(),
    salt = randomUUID();
  await query(
    "INSERT INTO users (id,name,email,role,salt,hash,status) VALUES (?,?,?,?,?,?,?)",
    [
      id,
      i.name,
      i.email.toLowerCase(),
      i.role,
      salt,
      scryptSync(i.password, salt, 64).toString("hex"),
      i.status,
    ],
  );
  return {
    id,
    name: i.name,
    email: i.email.toLowerCase(),
    role: i.role,
    status: i.status,
  };
}
export async function setPassword(id: string, password: string) {
  const salt = randomUUID();
  await query("UPDATE users SET salt=?,hash=? WHERE id=?", [
    salt,
    scryptSync(password, salt, 64).toString("hex"),
    id,
  ]);
  await query("DELETE FROM sessions WHERE user_id=?", [id]);
}
export async function audit(user: User, action: string, target: string) {
  const a: Audit = {
    id: randomUUID(),
    actor: user.name,
    actorId: user.id,
    action,
    target,
    timestamp: new Date().toISOString(),
  };
  await save("audit", a.id, a);
}
export async function allSubscribers() {
  return (await list<Subscriber>("subscriber")).map((s) => ({
    ...s,
    name: s.name || s.msisdn,
    subscriptionId: s.subscriptionId || s.id,
    assignedUsers: s.assignedUsers || [],
    enabled: s.enabled ?? s.status === "Active",
    approval: s.approval || ("approved" as const),
    remarks: s.remarks || "",
  }));
}
export type { Plan, Run };
