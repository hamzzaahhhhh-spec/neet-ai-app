import express from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { validate, schemas } from "../middleware/validate.js";
import { adminRateLimiter, generationRateLimiter } from "../middleware/rateLimit.js";
import {
  getAdminAnalytics,
  getDuplicateStats,
  getGenerationLogs,
  getLeaderboard,
  getSettings,
  getTopicWeights,
  updateSettings,
  updateTopicWeights
} from "../services/adminService.js";
import { generateDailyPaper, getPaperWithQuestions } from "../services/generationService.js";
import { getIstDateString } from "../utils/date.js";

export const adminRouter = express.Router();

adminRouter.use(authRequired, requireRole("admin"));
adminRouter.use(adminRateLimiter);

adminRouter.get("/paper/:date", async (req, res, next) => {
  try {
    const paper = await getPaperWithQuestions(req.params.date);
    if (!paper) {
      return res.status(404).json({ error: "Paper not found" });
    }

    return res.json(paper);
  } catch (error) {
    return next(error);
  }
});

adminRouter.post("/paper/regenerate", generationRateLimiter, validate(schemas.regenerate), async (req, res, next) => {
  try {
    const date = req.body.date || getIstDateString();
    const result = await generateDailyPaper({
      forceDate: date,
      triggeredBy: "admin-regenerate",
      adaptiveProfile: req.body.adaptiveProfile || null
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/settings", async (_req, res, next) => {
  try {
    const settings = await getSettings();
    return res.json(settings);
  } catch (error) {
    return next(error);
  }
});

adminRouter.put("/settings", validate(schemas.updateSettings), async (req, res, next) => {
  try {
    const settings = await updateSettings(req.body);
    return res.json(settings);
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/topic-weights", async (_req, res, next) => {
  try {
    const rows = await getTopicWeights();
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

adminRouter.put("/topic-weights", validate(schemas.updateTopicWeights), async (req, res, next) => {
  try {
    await updateTopicWeights(req.body);
    const rows = await getTopicWeights();
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/logs", async (_req, res, next) => {
  try {
    const rows = await getGenerationLogs();
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/duplicates", async (_req, res, next) => {
  try {
    const stats = await getDuplicateStats();
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/analytics", async (_req, res, next) => {
  try {
    const stats = await getAdminAnalytics();
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/leaderboard", async (req, res, next) => {
  try {
    const period = req.query.period === "weekly" ? "weekly" : "daily";
    const limit = Number(req.query.limit || 100);
    const rows = await getLeaderboard({ period, limit: Number.isNaN(limit) ? 100 : Math.min(Math.max(limit, 1), 200) });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});
