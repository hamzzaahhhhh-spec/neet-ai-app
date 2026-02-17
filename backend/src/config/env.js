import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const parseList = (raw) =>
  raw
    ? raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const parseJsonArray = (raw, fallback = []) => {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().min(1).default("7d"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    AI_SERVICE_URL: z.string().url(),
    AI_SERVICE_API_KEY: z.string().min(24),
    OPENAI_API_KEY: z.string().min(20),
    CORS_ORIGINS: z.string().min(1),
    ADMIN_BOOTSTRAP_EMAIL: z.string().optional().default(""),
    ADMIN_BOOTSTRAP_PASSWORD: z.string().optional().default(""),
    BIOLOGY_TOPICS_JSON: z.string().optional().default("[]"),
    EXAM_DURATION_MINUTES: z.coerce.number().int().min(30).max(360).default(180),
    PREDICTION_MODE_ENABLED: z.string().optional().default("false"),
    INACTIVITY_LIMIT_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    DISABLE_CRON: z.string().optional().default("false")
  })
  .superRefine((raw, ctx) => {
    const dbUrl = new URL(raw.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(dbUrl.protocol)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL must use postgres/postgresql protocol"
      });
    }
    if (raw.NODE_ENV === "production") {
      const sslMode = dbUrl.searchParams.get("sslmode");
      if (sslMode !== "require") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message: "Production DATABASE_URL must include sslmode=require"
        });
      }
    }

    const origins = parseList(raw.CORS_ORIGINS);
    if (!origins.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGINS"],
        message: "At least one CORS origin is required"
      });
    }
    for (const origin of origins) {
      if (origin.includes("*")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGINS"],
          message: "Wildcard CORS origins are not allowed"
        });
      }
      let parsedOrigin = null;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGINS"],
          message: `Invalid CORS origin: ${origin}`
        });
        continue;
      }

      if (raw.NODE_ENV === "production" && parsedOrigin.protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGINS"],
          message: "Production CORS origins must use HTTPS"
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${errors}`);
}

const config = parsed.data;

export const env = {
  nodeEnv: config.NODE_ENV,
  port: config.PORT,
  jwtSecret: config.JWT_SECRET,
  jwtExpiresIn: config.JWT_EXPIRES_IN,
  databaseUrl: config.DATABASE_URL,
  redisUrl: config.REDIS_URL,
  aiServiceUrl: config.AI_SERVICE_URL,
  aiServiceApiKey: config.AI_SERVICE_API_KEY,
  openaiApiKey: config.OPENAI_API_KEY,
  corsOrigins: parseList(config.CORS_ORIGINS),
  adminBootstrapEmail: config.ADMIN_BOOTSTRAP_EMAIL,
  adminBootstrapPassword: config.ADMIN_BOOTSTRAP_PASSWORD,
  biologyTopics: parseJsonArray(config.BIOLOGY_TOPICS_JSON, []),
  examDurationMinutes: config.EXAM_DURATION_MINUTES,
  predictionModeEnabled: config.PREDICTION_MODE_ENABLED === "true",
  inactivityLimitMinutes: config.INACTIVITY_LIMIT_MINUTES,
  disableCron: config.DISABLE_CRON === "true"
};
