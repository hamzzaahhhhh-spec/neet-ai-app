import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { papersRouter } from "./routes/papers.js";
import { attemptsRouter } from "./routes/attempts.js";
import { adminRouter } from "./routes/admin.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { sanitizeInput } from "./middleware/sanitize.js";
import { logger } from "./utils/logger.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";

export const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"]
      }
    },
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts:
      env.nodeEnv === "production"
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
          }
        : false,
    crossOriginEmbedderPolicy: false
  })
);
app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

app.use((req, res, next) => {
  if (env.nodeEnv !== "production") return next();

  const forwardedProto = req.headers["x-forwarded-proto"];
  const isSecure = req.secure || forwardedProto === "https";
  const isHealthEndpoint = req.path === "/health" || req.path === "/ready";

  if (isSecure || isHealthEndpoint) {
    return next();
  }

  return res.status(400).json({ error: "HTTPS is required" });
});

app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(sanitizeInput);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          ip: req.ip,
          userAgent: req.headers["user-agent"]
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode
        };
      }
    }
  })
);
app.use("/api/v1", apiRateLimiter);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin denied"));
    },
    credentials: true
  })
);

app.use((req, res, next) => {
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (!isWrite) return next();

  const origin = req.headers.origin;
  if (!origin) return next();
  if (env.corsOrigins.includes(origin)) return next();
  return res.status(403).json({ error: "Request origin not allowed" });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "backend",
    uptimeSeconds: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

app.get("/ready", (_req, res) => {
  res.json({ ok: true, service: "backend", ready: true });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/papers", papersRouter);
app.use("/api/v1/attempts", attemptsRouter);
app.use("/api/v1/leaderboard", leaderboardRouter);
app.use("/api/v1/admin", adminRouter);

app.use(notFound);
app.use(errorHandler);
