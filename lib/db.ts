import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { subscribers } from "./catalog";
import type { User, Plan, Run, Audit, Subscriber } from "./types";
const directory = process.env.PTAT_DATA_DIR || join(process.cwd(), ".data");
mkdirSync(directory, { recursive: true });
export const db = new DatabaseSync(join(directory, "ptat.sqlite"));
db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS documents (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id));
 CREATE TABLE IF NOT EXISTS login_attempts (email TEXT PRIMARY KEY, count INTEGER NOT NULL, since INTEGER NOT NULL);`);
const accounts = [
  ["lead", "Nadia Rahman", "lead@ptat.local", "Test Lead"],
  ["tester", "Arif Hasan", "tester@ptat.local", "Tester"],
  ["auditor", "Sarah Ahmed", "auditor@ptat.local", "Auditor"],
];
if (process.env.NODE_ENV === "production" && !process.env.PTAT_DEMO_PASSWORD)
  throw new Error(
    "PTAT_DEMO_PASSWORD must be set before running in production mode. This release supports simulated UAT only.",
  );
for (const [id, name, email, role] of accounts) {
  if (!db.prepare("SELECT id FROM users WHERE id=?").get(id)) {
    const salt = randomUUID();
    const hash = scryptSync(
      process.env.PTAT_DEMO_PASSWORD || "UatDemo!2026",
      salt,
      64,
    ).toString("hex");
    db.prepare("INSERT OR IGNORE INTO users VALUES (?,?,?,?,?,?)").run(
      id,
      name,
      email,
      role,
      salt,
      hash,
    );
  }
}
export function save(kind: string, id: string, value: unknown) {
  db.prepare(
    "INSERT INTO documents VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
  ).run(kind, id, JSON.stringify(value));
}
export function get<T>(kind: string, id: string): T | undefined {
  const row = db
    .prepare("SELECT body FROM documents WHERE kind=? AND id=?")
    .get(kind, id) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : undefined;
}
export function list<T>(kind: string): T[] {
  return (
    db
      .prepare("SELECT body FROM documents WHERE kind=? ORDER BY rowid DESC")
      .all(kind) as { body: string }[]
  ).map((x) => JSON.parse(x.body));
}
for (const subscriber of subscribers) {
  db.prepare("INSERT OR IGNORE INTO documents VALUES (?,?,?)").run(
    "subscriber",
    subscriber.id,
    JSON.stringify(subscriber),
  );
}
export function authenticate(
  email: string,
  password: string,
): User | undefined {
  const now = Date.now();
  const attempts = db
    .prepare("SELECT count,since FROM login_attempts WHERE email=?")
    .get(email) as { count: number; since: number } | undefined;
  if (attempts && now - attempts.since < 900000 && attempts.count >= 10)
    throw new Error("Too many login attempts. Try again in 15 minutes.");
  const row = db.prepare("SELECT * FROM users WHERE email=?").get(email) as
    (User & { salt: string; hash: string }) | undefined;
  const salt = row?.salt || "invalid-user";
  const hash = scryptSync(password, salt, 64);
  if (!row || !timingSafeEqual(hash, Buffer.from(row.hash, "hex"))) {
    db.prepare(
      "INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(email) DO UPDATE SET count=CASE WHEN ?-since>900000 THEN 1 ELSE count+1 END,since=CASE WHEN ?-since>900000 THEN ? ELSE since END",
    ).run(email, now, now, now, now);
    return;
  }
  db.prepare("DELETE FROM login_attempts WHERE email=?").run(email);
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}
export function sessionUser(token: string): User | undefined {
  const row = db
    .prepare(
      "SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
    )
    .get(token, Date.now());
  return row as User | undefined;
}
export function audit(user: User, action: string, target: string) {
  const entry: Audit = {
    id: randomUUID(),
    actor: user.name,
    action,
    target,
    timestamp: new Date().toISOString(),
  };
  save("audit", entry.id, entry);
}
export function allSubscribers() {
  return list<Subscriber>("subscriber");
}
export type { Plan, Run };
