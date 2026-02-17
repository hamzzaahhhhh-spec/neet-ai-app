import { app } from "./app.js";
import { pool } from "./db/postgres.js";
import { redis } from "./db/redis.js";
import { env } from "./config/env.js";
import { bootstrapSystemState } from "./services/bootstrapService.js";
import { scheduleDailyGeneration } from "./services/generationService.js";
import { warmupAi } from "./services/aiClient.js";
import { logger } from "./utils/logger.js";

const start = async () => {
  try {
    await pool.query("SELECT 1");
    await redis.ping();
    await bootstrapSystemState();
    await warmupAi();
    if (!env.disableCron) {
      scheduleDailyGeneration();
    }

    app.listen(env.port, () => {
      logger.info({ port: env.port, cronEnabled: !env.disableCron }, "Backend started");
    });
  } catch (error) {
    logger.error({ err: error }, "Startup failed");
    process.exit(1);
  }
};

start();
