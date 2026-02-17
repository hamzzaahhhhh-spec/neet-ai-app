import express from "express";
import { query } from "../db/postgres.js";
import { authRequired } from "../middleware/auth.js";
import { schemas, validate } from "../middleware/validate.js";
import { getSettings } from "../services/adminService.js";
import { saveAttempt, scoreAttempt } from "../services/attemptService.js";
import { getRevisionQueue } from "../services/adminService.js";

export const attemptsRouter = express.Router();

attemptsRouter.get("/revision-queue", authRequired, async (req, res, next) => {
  try {
    const queue = await getRevisionQueue(req.user.userId);
    return res.json(queue);
  } catch (error) {
    return next(error);
  }
});

attemptsRouter.post("/submit", authRequired, validate(schemas.attemptSubmit), async (req, res, next) => {
  try {
    const { paperDate, answers, timeTakenSeconds, timeBySubjectSeconds } = req.body;

    const paperResult = await query("SELECT id FROM daily_papers WHERE paper_date = $1", [paperDate]);
    if (!paperResult.rowCount) {
      return res.status(404).json({ error: "Paper not found" });
    }

    const paperId = paperResult.rows[0].id;

    const questionsResult = await query(
      `SELECT q.id, q.subject, q.topic, q.correct_option, q.explanation, q.difficulty
       FROM daily_paper_questions dpq
       JOIN questions q ON q.id = dpq.question_id
       WHERE dpq.paper_id = $1`,
      [paperId]
    );

    const questionsById = new Map(questionsResult.rows.map((row) => [row.id, row]));
    const settings = await getSettings();

    const scored = scoreAttempt({
      answers,
      questionsById,
      negativeMarkingEnabled: settings.negative_marking_enabled
    });

    const attemptId = await saveAttempt({
      userId: req.user.userId,
      paperId,
      scored,
      timeTakenSeconds,
      timeBySubjectSeconds
    });

    for (const ans of answers) {
      await query(
        "INSERT INTO attempt_answers (attempt_id, question_id, selected_option) VALUES ($1, $2, $3)",
        [attemptId, ans.questionId, ans.selectedOption]
      );
    }

    const weakestTopics = Object.entries(scored.topicStats)
      .sort((a, b) => a[1].score - b[1].score)
      .slice(0, 3)
      .map(([topic, stats]) => ({ topic, ...stats }));
    const strongestTopics = Object.entries(scored.topicStats)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3)
      .map(([topic, stats]) => ({ topic, ...stats }));

    const totalQuestions = questionsResult.rows.length || 1;
    const averageTimePerQuestion = Number((timeTakenSeconds / totalQuestions).toFixed(2));

    const hardStats = scored.difficultyStats.hard || { correct: 0, attempted: 0 };
    const hardAccuracy = hardStats.attempted ? (hardStats.correct / hardStats.attempted) * 100 : 0;
    const timeEfficiency = Math.max(0, Math.min(100, ((120 - averageTimePerQuestion) / 120) * 100));
    const readinessScore = Number((scored.accuracy * 0.5 + hardAccuracy * 0.3 + timeEfficiency * 0.2).toFixed(2));

    const difficultyWeight = questionsResult.rows.reduce((acc, row) => {
      if (row.difficulty === "hard") return acc + 1.2;
      if (row.difficulty === "moderate") return acc + 1;
      return acc + 0.85;
    }, 0) / totalQuestions;
    const totalMarks = totalQuestions * 4;
    const basePercentile = (Math.max(0, scored.totalScore) / totalMarks) * 100;
    const adjustedPercentile = Math.max(0, Math.min(100, basePercentile * (2 - difficultyWeight)));
    const predictedAirMin = Math.max(1, Math.round((100 - adjustedPercentile) * 1000));
    const predictedAirMax = predictedAirMin + 5000;

    const answerLookup = new Map(answers.map((ans) => [ans.questionId, ans.selectedOption]));
    const questionReview = questionsResult.rows.map((row) => {
      const selectedOption = answerLookup.get(row.id) || null;
      return {
        questionId: row.id,
        selectedOption,
        correctOption: row.correct_option,
        explanation: row.explanation,
        isCorrect: Boolean(selectedOption && selectedOption === row.correct_option)
      };
    });

    for (const review of questionReview) {
      if (review.selectedOption && !review.isCorrect) {
        for (const interval of [1, 3, 7, 14]) {
          await query(
            `INSERT INTO revision_queue (user_id, question_id, attempt_id, next_review_date, interval_days)
             VALUES ($1, $2, $3, CURRENT_DATE + make_interval(days => $4), $4)`,
            [req.user.userId, review.questionId, attemptId, interval]
          );
        }
      }
    }

    const readinessBand = (() => {
      if (readinessScore >= 90) return "Top 5% Potential";
      if (readinessScore >= 75) return "NEET-Ready";
      if (readinessScore >= 60) return "Competitive";
      if (readinessScore >= 45) return "Developing";
      return "Beginner";
    })();

    return res.json({
      attemptId,
      score: scored.totalScore,
      accuracy: scored.accuracy,
      correct: scored.correct,
      incorrect: scored.incorrect,
      unattempted: scored.unattempted,
      subjectStats: scored.subjectStats,
      topicStats: scored.topicStats,
      weakAreas: weakestTopics,
      strongAreas: strongestTopics,
      averageTimePerQuestion,
      difficultyStats: scored.difficultyStats,
      readiness: {
        score: readinessScore,
        band: readinessBand
      },
      predictedRank: {
        percentile: Number(adjustedPercentile.toFixed(2)),
        airRange: `${predictedAirMin}-${predictedAirMax}`,
        note: "ESTIMATED"
      },
      questionReview
    });
  } catch (error) {
    return next(error);
  }
});
