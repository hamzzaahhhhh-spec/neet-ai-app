import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "../sql/schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

const run = async () => {
  try {
    await pool.query(sql);
    console.log("Migration completed");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

run();