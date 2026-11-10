import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: MySql2Database<typeof fullSchema> | undefined;

export function getDb() {
  if (!instance) {
    const url = new URL(env.databaseUrl);
    const pool = createPool({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      ssl: env.databaseCaFile ? { ca: readFileSync(env.databaseCaFile, "utf8"), rejectUnauthorized: true, verifyIdentity: true } : undefined,
    });
    instance = drizzle(pool, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance!;
}
