import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const { Pool } = pg;
const databaseUrl = new URL(env.databaseUrl);
const isProduction = env.nodeEnv === "production";

if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
  throw new Error("DATABASE_URL must use postgres/postgresql protocol");
}

if (isProduction && databaseUrl.searchParams.get("sslmode") !== "require") {
  throw new Error("Production DATABASE_URL must include sslmode=require");
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: isProduction ? { rejectUnauthorized: true } : false
});

pool.on("error", (error) => {
  logger.error({ err: error }, "Unexpected PostgreSQL error");
});

export const query = (text, params = []) => pool.query(text, params);
