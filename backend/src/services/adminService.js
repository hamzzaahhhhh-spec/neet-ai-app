import { query } from "../db/postgres.js";

export const getSettings = async () => {
  const result = await query(
    "SELECT exam_mode, negative_marking_enabled, exam_duration_minutes, prediction_mode_enabled, inactivity_limit_minutes FROM admin_settings LIMIT 1"
  );
  return result.rows[0];
};

export const updateSettings = async (payload) => {
  const current = await getSettings();
  const next = {
    exam_mode: payload.examMode ?? current.exam_mode,
    negative_marking_enabled: payload.negativeMarkingEnabled ?? current.negative_marking_enabled,
    exam_duration_minutes: payload.examDurationMinutes ?? current.exam_duration_minutes,
    prediction_mode_enabled: payload.predictionModeEnabled ?? current.prediction_mode_enabled,
    inactivity_limit_minutes: payload.inactivityLimitMinutes ?? current.inactivity_limit_minutes
  };

  await query(
    `UPDATE admin_settings
     SET exam_mode = $1,
         negative_marking_enabled = $2,
         exam_duration_minutes = $3,
         prediction_mode_enabled = $4,
         inactivity_limit_minutes = $5,
         updated_at = NOW()`,
    [next.exam_mode, next.negative_marking_enabled, next.exam_duration_minutes, next.prediction_mode_enabled, next.inactivity_limit_minutes]
  );

  return next;
};

export const getTopicWeights = async () => {
  const result = await query("SELECT subject, weights_json FROM topic_weights ORDER BY subject");
  return result.rows;
};

export const updateTopicWeights = async ({ subject, weights }) => {
  await query("UPDATE topic_weights SET weights_json = $1, updated_at = NOW() WHERE subject = $2", [weights, subject]);
};

export const getGenerationLogs = async (limit = 100) => {
  const result = await query(
    `SELECT id, run_date, status, message, metadata_json, created_at
     FROM generation_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

export const getDuplicateStats = async () => {
  const result = await query(
    `SELECT date_generated::date AS date, COUNT(*) AS total_questions, COUNT(DISTINCT hash_signature) AS unique_hashes
     FROM questions
     WHERE date_generated >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY date_generated::date
     ORDER BY date DESC`
  );
  return result.rows;
};

export const getAdminAnalytics = async () => {
  const [dailyUsers, scoreTrend, weakTopics, attemptedSubject, hardestQuestion, heatmap, difficultySuccess] = await Promise.all([
    query(
      `SELECT DATE(created_at) AS day, COUNT(DISTINCT user_id)::int AS active_users
       FROM attempts
       WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    ),
    query(
      `SELECT DATE(created_at) AS day, ROUND(AVG(score)::numeric, 2) AS avg_score
       FROM attempts
       WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    ),
    query(
      `SELECT entry.key AS topic, ROUND(AVG((entry.value->>'score')::numeric), 2) AS avg_topic_score
       FROM attempts
       CROSS JOIN LATERAL jsonb_each(topic_stats_json) entry
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY entry.key
       ORDER BY avg_topic_score ASC
       LIMIT 10`
    ),
    query(
      `SELECT entry.key AS subject, SUM((entry.value->>'correct')::int + (entry.value->>'incorrect')::int)::int AS attempts
       FROM attempts
       CROSS JOIN LATERAL jsonb_each(subject_stats_json) entry
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY entry.key
       ORDER BY attempts DESC`
    ),
    query(
      `SELECT q.id, q.question_text, q.subject, q.topic,
              ROUND(AVG(CASE WHEN aa.selected_option = q.correct_option THEN 1 ELSE 0 END)::numeric, 3) AS correctness_rate
       FROM attempt_answers aa
       JOIN questions q ON q.id = aa.question_id
       JOIN attempts a ON a.id = aa.attempt_id
       WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY q.id
       HAVING COUNT(*) >= 5
       ORDER BY correctness_rate ASC
       LIMIT 1`
    ),
    query(
      `SELECT q.subject, q.topic,
              ROUND(AVG(CASE WHEN aa.selected_option = q.correct_option THEN 1 ELSE 0 END)::numeric, 3) AS accuracy
       FROM attempt_answers aa
       JOIN questions q ON q.id = aa.question_id
       JOIN attempts a ON a.id = aa.attempt_id
       WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY q.subject, q.topic
       ORDER BY q.subject, q.topic`
    ),
    query(
      `SELECT q.difficulty,
              ROUND(AVG(CASE WHEN aa.selected_option = q.correct_option THEN 1 ELSE 0 END)::numeric, 3) AS success_rate,
              COUNT(*)::int AS attempts
       FROM attempt_answers aa
       JOIN questions q ON q.id = aa.question_id
       JOIN attempts a ON a.id = aa.attempt_id
       WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY q.difficulty
       ORDER BY q.difficulty`
    )
  ]);

  return {
    dailyActiveUsers: dailyUsers.rows,
    averageScoreTrend: scoreTrend.rows,
    weakestTopicsNational: weakTopics.rows,
    mostAttemptedSubject: attemptedSubject.rows[0] || null,
    hardestQuestionOfDay: hardestQuestion.rows[0] || null,
    topicAccuracyHeatmap: heatmap.rows,
    difficultySuccessGraph: difficultySuccess.rows
  };
};

export const getLeaderboard = async ({ period = "daily", limit = 100 } = {}) => {
  if (period === "weekly") {
    const result = await query(
      `SELECT u.id AS user_id, u.email,
              ROUND(AVG(a.score)::numeric, 2) AS average_score,
              ROUND(AVG(a.accuracy)::numeric, 2) AS accuracy,
              ROUND(AVG(a.time_taken_seconds)::numeric, 2) AS avg_time_seconds,
              COUNT(*)::int AS attempts
       FROM attempts a
       JOIN users u ON u.id = a.user_id
       WHERE a.created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY u.id
       ORDER BY average_score DESC, accuracy DESC, avg_time_seconds ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  const result = await query(
    `SELECT u.id AS user_id, u.email, a.score, a.accuracy,
            a.time_taken_seconds,
            ROUND(((100.0 - LEAST(100, a.time_taken_seconds / 2.0)) + a.accuracy) / 2.0, 2) AS time_efficiency
     FROM attempts a
     JOIN users u ON u.id = a.user_id
     WHERE DATE(a.created_at) = CURRENT_DATE
     ORDER BY a.score DESC, a.accuracy DESC, a.time_taken_seconds ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
};

export const getRevisionQueue = async (userId) => {
  const result = await query(
    `SELECT rq.id, rq.question_id, rq.next_review_date, rq.interval_days, rq.status,
            q.subject, q.topic, q.question_text
     FROM revision_queue rq
     JOIN questions q ON q.id = rq.question_id
     WHERE rq.user_id = $1 AND rq.status = 'pending'
     ORDER BY rq.next_review_date ASC`,
    [userId]
  );
  return result.rows;
};
