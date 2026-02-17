import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.nodeEnv === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-api-key",
      "req.body.password",
      "req.body.confirmPassword",
      "req.body.token",
      "req.body.openaiApiKey",
      "headers.authorization",
      "headers.cookie",
      "headers.x-api-key",
      "OPENAI_API_KEY",
      "AI_SERVICE_API_KEY",
      "JWT_SECRET"
    ],
    censor: "***REDACTED***"
  },
  base: {
    service: "neet-backend",
    env: env.nodeEnv
  }
});
