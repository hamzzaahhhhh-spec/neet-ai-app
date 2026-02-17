import { logger } from "../utils/logger.js";

export const notFound = (_req, res) => {
  res.status(404).json({ error: "Route not found" });
};

export const errorHandler = (error, _req, res, _next) => {
  const status = Number(error?.status || error?.statusCode || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;

  logger.error(
    {
      err: error,
      status: safeStatus
    },
    "Request failed"
  );

  if (safeStatus >= 500) {
    return res.status(500).json({ error: "Internal server error" });
  }

  return res.status(safeStatus).json({ error: error?.message || "Request failed" });
};
