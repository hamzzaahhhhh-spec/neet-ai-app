import { redis } from "../db/redis.js";
import { logger } from "../utils/logger.js";

const buildKey = (prefix, req) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  return `${prefix}:${ip}`;
};

const setRetryHeaders = (res, remaining, resetSeconds) => {
  res.setHeader("X-RateLimit-Remaining", String(Math.max(remaining, 0)));
  res.setHeader("X-RateLimit-Reset", String(Math.max(resetSeconds, 0)));
  if (remaining < 0) {
    res.setHeader("Retry-After", String(Math.max(resetSeconds, 1)));
  }
};

export const createRedisRateLimiter = ({
  prefix,
  windowSeconds,
  maxRequests,
  message = "Too many requests. Please try again later."
}) => {
  return async (req, res, next) => {
    const key = buildKey(prefix, req);

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const ttl = await redis.ttl(key);
      const remaining = maxRequests - count;
      setRetryHeaders(res, remaining, ttl);

      if (count > maxRequests) {
        return res.status(429).json({ error: message });
      }

      return next();
    } catch (error) {
      logger.error({ err: error, keyPrefix: prefix }, "Redis rate limiter failed");
      return res.status(503).json({ error: "Rate limiter unavailable" });
    }
  };
};

export const apiRateLimiter = createRedisRateLimiter({
  prefix: "ratelimit:api",
  windowSeconds: 15 * 60,
  maxRequests: 300
});

export const adminRateLimiter = createRedisRateLimiter({
  prefix: "ratelimit:admin",
  windowSeconds: 15 * 60,
  maxRequests: 60,
  message: "Too many admin requests. Please slow down."
});

export const generationRateLimiter = createRedisRateLimiter({
  prefix: "ratelimit:admin:generate",
  windowSeconds: 15 * 60,
  maxRequests: 2,
  message: "Too many generation requests. Please try again later."
});
