import express from "express";
import { authRequired } from "../middleware/auth.js";
import { getIstDateString } from "../utils/date.js";
import { getPaperWithQuestions } from "../services/generationService.js";
import { getSettings } from "../services/adminService.js";
import { query } from "../db/postgres.js";

export const papersRouter = express.Router();

const sanitizeQuestionsForExam = (questions, examMode) =>
  questions.map((q) => ({
    id: q.id,
    subject: q.subject,
    topic: q.topic,
    syllabusUnit: q.syllabus_unit,
    conceptTag: q.concept_tag,
    questionFormat: q.question_format,
    sourceType: q.source_type,
    questionText: q.question_text,
    options: {
      A: q.option_a,
      B: q.option_b,
      C: q.option_c,
      D: q.option_d
    },
    difficulty: q.difficulty,
    probabilityScore: q.probability_score,
    confidenceScore: q.confidence_score,
    verificationFlag: q.verification_flag,
    ...(examMode
      ? {}
      : {
          correctOption: q.correct_option,
          explanation: q.explanation
        })
  }));

const getUserTopicWeakness = async (userId) => {
  const result = await query(
    `SELECT topic,
            ROUND(AVG(CASE WHEN attempted > 0 THEN (correct::numeric / attempted::numeric) * 100 ELSE 0 END), 2) AS accuracy
     FROM (
       SELECT (entry.key) AS topic,
              ((entry.value->>'correct')::int + (entry.value->>'incorrect')::int) AS attempted,
              (entry.value->>'correct')::int AS correct
       FROM attempts a
       CROSS JOIN LATERAL jsonb_each(a.topic_stats_json) entry
       WHERE a.user_id = $1
         AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'
     ) t
     GROUP BY topic`,
    [userId]
  );

  return result.rows.reduce((acc, row) => {
    acc[row.topic] = Number(row.accuracy || 0);
    return acc;
  }, {});
};

const applyPredictionMode = async (questions, userId) => {
  const weaknessByTopic = await getUserTopicWeakness(userId);

  const recurrenceRows = await query(
    `SELECT topic, COUNT(*)::int AS total
     FROM questions
     WHERE date_generated >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY topic`
  );
  const recurrenceByTopic = recurrenceRows.rows.reduce((acc, row) => {
    acc[row.topic] = Number(row.total);
    return acc;
  }, {});
  const maxRecurrence = Math.max(1, ...Object.values(recurrenceByTopic));

  return [...questions].sort((a, b) => {
    const accuracyA = weaknessByTopic[a.topic] ?? 100;
    const accuracyB = weaknessByTopic[b.topic] ?? 100;
    const weakScoreA = (100 - accuracyA) / 100;
    const weakScoreB = (100 - accuracyB) / 100;
    const recurA = (recurrenceByTopic[a.topic] || 0) / maxRecurrence;
    const recurB = (recurrenceByTopic[b.topic] || 0) / maxRecurrence;
    const scoreA = weakScoreA * 0.65 + recurA * 0.35;
    const scoreB = weakScoreB * 0.65 + recurB * 0.35;
    return scoreB - scoreA;
  });
};

papersRouter.get("/today", authRequired, async (req, res, next) => {
  try {
    const date = getIstDateString();
    const paper = await getPaperWithQuestions(date);
    if (!paper) {
      return res.status(404).json({ error: "Paper not generated yet" });
    }

    const settings = await getSettings();
    const predictionModeEnabled = settings.prediction_mode_enabled || req.query.predictionMode === "1";
    const orderedQuestions = predictionModeEnabled ? await applyPredictionMode(paper.questions, req.user.userId) : paper.questions;

    return res.json({
      date,
      paperId: paper.id,
      settings,
      questions: sanitizeQuestionsForExam(orderedQuestions, settings.exam_mode)
    });
  } catch (error) {
    return next(error);
  }
});

papersRouter.get("/:date", authRequired, async (req, res, next) => {
  try {
    const paper = await getPaperWithQuestions(req.params.date);
    if (!paper) {
      return res.status(404).json({ error: "Paper not found" });
    }

    const settings = await getSettings();
    const predictionModeEnabled = settings.prediction_mode_enabled || req.query.predictionMode === "1";
    const orderedQuestions = predictionModeEnabled ? await applyPredictionMode(paper.questions, req.user.userId) : paper.questions;

    return res.json({
      date: req.params.date,
      paperId: paper.id,
      settings,
      questions: sanitizeQuestionsForExam(orderedQuestions, settings.exam_mode)
    });
  } catch (error) {
    return next(error);
  }
});
