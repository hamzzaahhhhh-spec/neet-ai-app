import express from "express";
import { authRequired } from "../middleware/auth.js";
import { getLeaderboard } from "../services/adminService.js";

export const leaderboardRouter = express.Router();

leaderboardRouter.get("/daily", authRequired, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 100);
    const rows = await getLeaderboard({ period: "daily", limit: Number.isNaN(limit) ? 100 : Math.min(Math.max(limit, 1), 200) });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

leaderboardRouter.get("/weekly", authRequired, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 100);
    const rows = await getLeaderboard({ period: "weekly", limit: Number.isNaN(limit) ? 100 : Math.min(Math.max(limit, 1), 200) });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});