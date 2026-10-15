import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
export const projectRoot = resolve(
  process.env.PTAT_PROJECT_ROOT || process.cwd(),
);
loadEnv({ path: resolve(projectRoot, ".env.local"), quiet: true });
loadEnv({ path: resolve(projectRoot, ".env"), quiet: true });
const filename = resolve(
  projectRoot,
  process.env.PTAT_CONFIG_FILE || "server/portal.config.json",
);
const settings = existsSync(filename)
  ? JSON.parse(readFileSync(filename, "utf8"))
  : {};
export const runtimeConfig = {
  port: Number(process.env.PORT || settings.port || 3000),
  driver: process.env.PTAT_DB_DRIVER || settings.database?.driver || "mysql",
  dataDir: resolve(process.env.PTAT_DATA_DIR || resolve(projectRoot, ".data")),
  mysql: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "ptat",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "ptat",
  },
  maxBodyBytes: Number(settings.maxBodyBytes || 262144),
};
