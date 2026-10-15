import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { config } from "dotenv";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local"), quiet: true });
config({ path: resolve(root, ".env"), quiet: true });
const settings = JSON.parse(
  readFileSync(
    resolve(root, process.env.PTAT_CONFIG_FILE || "server/portal.config.json"),
    "utf8",
  ),
);
const mode = process.argv[2] || "dev";
const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/next/dist/bin/next"),
    mode,
    root,
    "--hostname",
    process.env.PTAT_HOST || "0.0.0.0",
    "--port",
    String(process.env.PORT || settings.port || 3000),
    ...process.argv.slice(3),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PTAT_PROJECT_ROOT: root },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
