import cron from "node-cron";
import { query, pool } from "../db/postgres.js";
import { redis } from "../db/redis.js";
import { BIOLOGY_TOPICS, CHEMISTRY_TOPICS, PHYSICS_TOPICS } from "../config/topics.js";
import { getSyllabusUnitsForTopic } from "../config/syllabus2026.js";
import { generateQuestionFromAi } from "./aiClient.js";
import { hashQuestion, semanticSimilarity, validateQuestionShape } from "./questionValidation.js";
import { getIstDateString } from "../utils/date.js";
import { logger } from "../utils/logger.js";

const BASE_BLUEPRINT = {
  Physics: 30,
  Chemistry: 30,
  Biology: 40
};

const BASE_DIFFICULTY_DISTRIBUTION = {
  Physics: { easy: 10, moderate: 12, hard: 8 },
  Chemistry: { easy: 10, moderate: 12, hard: 8 },
  Biology: { easy: 20, moderate: 12, hard: 8 }
};

const BASE_FORMAT_DISTRIBUTION = {
  Physics: { "Single Correct": 12, "Assertion-Reason": 5, "Statement I-II": 5, "Multi-Statement": 4, "Case-Based": 4 },
  Chemistry: { "Single Correct": 12, "Assertion-Reason": 5, "Statement I-II": 5, "Multi-Statement": 4, "Case-Based": 4 },
  Biology: { "Single Correct": 16, "Assertion-Reason": 8, "Statement I-II": 6, "Multi-Statement": 5, "Case-Based": 5 }
};

const DUPLICATE_TTL_SECONDS = 60 * 60 * 24 * 30;
const CACHE_TTL_SECONDS = 60 * 60 * 24;
const SEMANTIC_SIMILARITY_THRESHOLD = 0.85;
const ADMIN_REGENERATE_SEMANTIC_THRESHOLD = 0.93;
const MIN_CONFIDENCE = 0.75;
const TOPIC_CONCEPT_REPEAT_LIMIT_7D = 3;
const MAX_DAILY_GENERATION_QUESTIONS = 100;
const GENERATION_LOCK_TTL_SECONDS = 60 * 20;
const CRON_LOCK_TTL_SECONDS = 60 * 60 * 3;
const totalBlueprintQuestions = Object.values(BASE_BLUEPRINT).reduce((sum, count) => sum + count, 0);

const normalizeWeights = (topics, rawWeights = {}) => {
  const filtered = topics.map((topic) => ({ topic, weight: Number(rawWeights[topic] || 1) })).filter((item) => item.weight > 0);
  if (!filtered.length) return topics.map((topic) => ({ topic, weight: 1 }));
  return filtered;
};

const getSubjectTopics = (subject) => {
  if (subject === "Physics") return PHYSICS_TOPICS;
  if (subject === "Chemistry") return CHEMISTRY_TOPICS;
  return BIOLOGY_TOPICS;
};

const getSyllabusUnitPool = (subject, topics) => {
  const units = topics.flatMap((topic) => getSyllabusUnitsForTopic(subject, topic));
  return [...new Set(units)];
};

const getTopicWeightsMap = async () => {
  const rows = await query("SELECT subject, weights_json FROM topic_weights");
  return rows.rows.reduce((acc, row) => {
    acc[row.subject] = row.weights_json;
    return acc;
  }, {});
};

const applyAdaptiveDifficultyShift = (baseCounts, totalCount, adaptiveProfile) => {
  const next = { ...baseCounts };
  if (!adaptiveProfile) return next;

  if (adaptiveProfile.eliteMode) {
    const hard = Math.round(totalCount * 0.4);
    const easy = Math.max(0, next.easy - Math.round(totalCount * 0.15));
    const moderate = totalCount - hard - easy;
    return { easy, moderate: Math.max(0, moderate), hard };
  }

  const overallAccuracy = Number(adaptiveProfile.overallAccuracy || 0);
  if (overallAccuracy > 75) {
    const shift = Math.max(1, Math.round(totalCount * 0.1));
    next.hard += shift;
    next.easy = Math.max(0, next.easy - shift);
  } else if (overallAccuracy < 45) {
    const shift = Math.max(1, Math.round(totalCount * 0.15));
    next.easy += shift;
    next.hard = Math.max(0, next.hard - shift);
  }

  if ((adaptiveProfile.averageResponseTimeSeconds || 0) > 120) {
    const shift = Math.max(1, Math.round(totalCount * 0.05));
    next.moderate += shift;
    next.easy = Math.max(0, next.easy - shift);
  }

  if ((adaptiveProfile.averageResponseTimeSeconds || 0) < 45) {
    const shift = Math.max(1, Math.round(totalCount * 0.05));
    next.hard += shift;
    next.moderate = Math.max(0, next.moderate - shift);
  }

  const currentTotal = next.easy + next.moderate + next.hard;
  if (currentTotal !== totalCount) {
    next.moderate += totalCount - currentTotal;
  }

  return next;
};

const expandDifficultyPlan = (distribution) => {
  const entries = [];
  for (const [difficulty, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i += 1) entries.push(difficulty);
  }
  // Fisher-Yates shuffling avoids clustered difficulty ordering in UI.
  for (let i = entries.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return entries;
};

const getDifficultyPlanBySubject = (adaptiveProfile) => {
  const plan = {};
  for (const [subject, count] of Object.entries(BASE_BLUEPRINT)) {
    const base = BASE_DIFFICULTY_DISTRIBUTION[subject];
    const adjusted = applyAdaptiveDifficultyShift(base, count, adaptiveProfile);
    plan[subject] = expandDifficultyPlan(adjusted);
  }
  return plan;
};

const expandFormatPlan = (distribution) => {
  const entries = [];
  for (const [format, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i += 1) entries.push(format);
  }
  for (let i = entries.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return entries;
};

const getFormatPlanBySubject = () => {
  const plan = {};
  for (const [subject, distribution] of Object.entries(BASE_FORMAT_DISTRIBUTION)) {
    plan[subject] = expandFormatPlan(distribution);
  }
  return plan;
};

const logGeneration = async ({ runDate, status, message, metadata = {} }) => {
  await query(
    `INSERT INTO generation_logs (run_date, status, message, metadata_json)
     VALUES ($1, $2, $3, $4)`,
    [runDate, status, message, metadata]
  );
};

const getRecentHashes = async () => {
  const result = await query(
    `SELECT DISTINCT hash_signature
     FROM questions
     WHERE date_generated >= CURRENT_DATE - INTERVAL '30 days'`
  );
  return new Set(result.rows.map((row) => row.hash_signature));
};

const getRecentQuestionContext = async () => {
  const result = await query(
    `SELECT question_text, topic, concept_tag
     FROM questions
     WHERE date_generated >= CURRENT_DATE - INTERVAL '30 days'`
  );
  return result.rows;
};

const getTopicConceptCounts7d = async () => {
  const result = await query(
    `SELECT subject, topic, concept_tag, COUNT(*)::int AS total
     FROM questions
     WHERE date_generated >= CURRENT_DATE - INTERVAL '7 days'
     GROUP BY subject, topic, concept_tag`
  );
  return result.rows.reduce((acc, row) => {
    acc[`${row.subject}::${row.topic}::${row.concept_tag}`] = Number(row.total);
    return acc;
  }, {});
};

const existsInRedis = async (hash) => {
  const value = await redis.get(`qhash:${hash}`);
  return Boolean(value);
};

const addHashToRedis = async (hash) => {
  await redis.set(`qhash:${hash}`, "1", "EX", DUPLICATE_TTL_SECONDS);
};

const hasHighSemanticSimilarity = (candidateText, recentContexts, generatedTexts, threshold = SEMANTIC_SIMILARITY_THRESHOLD) => {
  const recentHit = recentContexts.some((ctx) => semanticSimilarity(candidateText, ctx.question_text) >= threshold);
  if (recentHit) return true;
  return generatedTexts.some((text) => semanticSimilarity(candidateText, text) >= threshold);
};

const mergeAdaptiveTopicWeights = (weights, adaptiveProfile, subject) => {
  if (!adaptiveProfile?.topicStats) return weights;
  const output = weights.map((item) => ({ ...item }));

  for (const entry of output) {
    const topicStat = adaptiveProfile.topicStats[entry.topic];
    if (!topicStat) continue;

    const accuracy = Number(topicStat.accuracy ?? 100);
    if (accuracy < 40) {
      entry.weight *= 1.35;
    }

    if (adaptiveProfile.predictionMode && Number(topicStat.errorTrend ?? 0) > 0) {
      entry.weight *= 1.15;
    }
  }

  if (adaptiveProfile?.weakAreaBoost?.enabled && adaptiveProfile?.weakAreaBoost?.subject === subject) {
    const boosted = adaptiveProfile.weakAreaBoost.topic;
    for (const entry of output) {
      if (entry.topic === boosted) {
        entry.weight *= 1.5;
      }
    }
  }

  return output;
};

const getGenerationLockKey = (runDate) => `generation:lock:${runDate}`;
const getCronLockKey = (runDate) => `generation:cron:${runDate}`;

const acquireRedisLock = async (key, ttlSeconds) => {
  const lockValue = `${process.pid}:${Date.now()}`;
  const result = await redis.set(key, lockValue, "EX", ttlSeconds, "NX");
  return result === "OK" ? lockValue : null;
};

const releaseRedisLock = async (key, lockValue) => {
  try {
    const current = await redis.get(key);
    if (current === lockValue) {
      await redis.del(key);
    }
  } catch {
    // Ignore lock release failures; TTL prevents deadlocks.
  }
};

const hasSuccessfulGenerationLog = async (runDate) => {
  const result = await query(
    `SELECT 1
     FROM generation_logs
     WHERE run_date = $1 AND status = 'success'
     LIMIT 1`,
    [runDate]
  );
  return Boolean(result.rowCount);
};

export const generateDailyPaper = async ({ forceDate, triggeredBy = "system", adaptiveProfile = null } = {}) => {
  const runDate = forceDate || getIstDateString();
  const isAdminRegenerate = triggeredBy === "admin-regenerate";
  const semanticThreshold = isAdminRegenerate ? ADMIN_REGENERATE_SEMANTIC_THRESHOLD : SEMANTIC_SIMILARITY_THRESHOLD;
  const maxSlotAttempts = isAdminRegenerate ? 60 : 20;
  const lockKey = getGenerationLockKey(runDate);
  const lockValue = await acquireRedisLock(lockKey, GENERATION_LOCK_TTL_SECONDS);

  if (!lockValue) {
    return { date: runDate, skipped: true, reason: "Generation already in progress" };
  }

  try {
    if (!BIOLOGY_TOPICS.length) {
      const message = "Biology topic list is empty. Set BIOLOGY_TOPICS_JSON before generation.";
      await logGeneration({ runDate, status: "failed", message });
      throw new Error(message);
    }

    if (totalBlueprintQuestions > MAX_DAILY_GENERATION_QUESTIONS) {
      const message = `Generation blueprint exceeds daily max of ${MAX_DAILY_GENERATION_QUESTIONS} questions`;
      await logGeneration({ runDate, status: "failed", message });
      throw new Error(message);
    }

    const existingPaper = await query("SELECT id FROM daily_papers WHERE paper_date = $1", [runDate]);
    if (existingPaper.rowCount || (await hasSuccessfulGenerationLog(runDate))) {
      return { date: runDate, skipped: true, reason: "Daily generation already completed" };
    }

    const topicWeightsMap = await getTopicWeightsMap();
    const recentHashes = await getRecentHashes();
    const recentContexts = await getRecentQuestionContext();
    const topicConceptCounts = await getTopicConceptCounts7d();
    const selectedHashes = new Set();
    const generatedTexts = [];
    const generated = [];
    const rejectionStats = {
      validation: 0,
      confidence: 0,
      semanticDuplicate: 0,
      hashDuplicate: 0,
      topicRepetition: 0,
      syllabusMismatch: 0,
      formatMismatch: 0
    };

    const difficultyPlanBySubject = getDifficultyPlanBySubject(adaptiveProfile);
    const formatPlanBySubject = getFormatPlanBySubject();

    for (const [subject, count] of Object.entries(BASE_BLUEPRINT)) {
      const topics = getSubjectTopics(subject);
      const normalizedWeights = normalizeWeights(topics, topicWeightsMap[subject] || {});
      const adaptiveWeights = mergeAdaptiveTopicWeights(normalizedWeights, adaptiveProfile, subject);
      const syllabusUnitPool = getSyllabusUnitPool(subject, topics);

      for (let i = 0; i < count; i += 1) {
        const requiredDifficulty = difficultyPlanBySubject[subject][i] || "moderate";
        const requiredFormat = formatPlanBySubject[subject][i] || "Single Correct";
        let accepted = false;
        let slotAttempts = 0;

        while (!accepted && slotAttempts < maxSlotAttempts) {
          slotAttempts += 1;
          const aiPayload = await generateQuestionFromAi({
            subject,
            topics,
            topicWeights: adaptiveWeights,
            difficulty: requiredDifficulty,
            questionFormat: requiredFormat,
            syllabusUnits: syllabusUnitPool,
            excludeHashes: [...selectedHashes, ...recentHashes].slice(-2000)
          });

        const candidate = {
          ...aiPayload.question,
          difficulty: aiPayload.question.difficulty || requiredDifficulty
        };
        const confidence = Number(aiPayload.confidence ?? 0);
        const verificationFlag = aiPayload.verificationFlag || "Estimated";

        if (confidence < MIN_CONFIDENCE) {
          rejectionStats.confidence += 1;
          continue;
        }

        if (candidate.difficulty !== requiredDifficulty) {
          candidate.difficulty = requiredDifficulty;
        }
        if (candidate.questionFormat !== requiredFormat) {
          rejectionStats.formatMismatch += 1;
          continue;
        }
        const allowedSyllabusUnits = getSyllabusUnitsForTopic(subject, candidate.topic);
        if (!allowedSyllabusUnits.includes(candidate.syllabusUnit)) {
          rejectionStats.syllabusMismatch += 1;
          continue;
        }

        const validation = validateQuestionShape(candidate);
        if (!validation.valid) {
          rejectionStats.validation += 1;
          continue;
        }

        const hash = hashQuestion(candidate);
        if (selectedHashes.has(hash) || recentHashes.has(hash) || (await existsInRedis(hash))) {
          rejectionStats.hashDuplicate += 1;
          continue;
        }

        if (hasHighSemanticSimilarity(candidate.questionText, recentContexts, generatedTexts, semanticThreshold)) {
          rejectionStats.semanticDuplicate += 1;
          continue;
        }

        const conceptKey = `${subject}::${candidate.topic}::${candidate.conceptTag}`;
        const repeated = topicConceptCounts[conceptKey] || 0;
        if (!isAdminRegenerate && repeated >= TOPIC_CONCEPT_REPEAT_LIMIT_7D) {
          rejectionStats.topicRepetition += 1;
          continue;
        }

        generated.push({
          ...candidate,
          hashSignature: hash,
          probabilityScore: Number(candidate.probabilityScore),
          confidenceScore: confidence,
          verificationFlag,
          difficulty: requiredDifficulty,
          sourceType: candidate.sourceType,
          conceptTag: candidate.conceptTag,
          questionFormat: candidate.questionFormat,
          syllabusUnit: candidate.syllabusUnit
        });
        generatedTexts.push(candidate.questionText);
        selectedHashes.add(hash);
        topicConceptCounts[conceptKey] = repeated + 1;
        accepted = true;
      }

        if (!accepted) {
          const message = `Unable to generate unique ${subject} question for slot ${i + 1}`;
          await logGeneration({
            runDate,
            status: "failed",
            message,
            metadata: {
              subject,
              slot: i + 1,
              requiredDifficulty,
              requiredFormat,
              rejectionStats
            }
          });
          throw new Error(message);
        }
      }
    }

    if (generated.length !== totalBlueprintQuestions || generated.length > MAX_DAILY_GENERATION_QUESTIONS) {
      const message = "Generated question count exceeds daily limit";
      await logGeneration({ runDate, status: "failed", message, metadata: { generatedCount: generated.length } });
      throw new Error(message);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const paperInsert = await client.query(
        `INSERT INTO daily_papers (paper_date, physics_count, chemistry_count, biology_count)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [runDate, BASE_BLUEPRINT.Physics, BASE_BLUEPRINT.Chemistry, BASE_BLUEPRINT.Biology]
      );

    const paperId = paperInsert.rows[0].id;

    let order = 1;
    for (const q of generated) {
      const inserted = await client.query(
        `INSERT INTO questions (
          subject, topic, syllabus_unit, concept_tag, question_format, source_type, question_text, option_a, option_b, option_c, option_d,
          correct_option, explanation, probability_score, confidence_score, verification_flag, difficulty, hash_signature, date_generated
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING id`,
        [
          q.subject,
          q.topic,
          q.syllabusUnit,
          q.conceptTag,
          q.questionFormat,
          q.sourceType,
          q.questionText,
          q.options.A,
          q.options.B,
          q.options.C,
          q.options.D,
          q.correctOption,
          q.explanation,
          q.probabilityScore,
          q.confidenceScore,
          q.verificationFlag,
          q.difficulty,
          q.hashSignature,
          runDate
        ]
      );

      await client.query("INSERT INTO daily_paper_questions (paper_id, question_id, question_order) VALUES ($1, $2, $3)", [
        paperId,
        inserted.rows[0].id,
        order
      ]);
      order += 1;
    }

      await client.query("COMMIT");

      for (const q of generated) {
        await addHashToRedis(q.hashSignature);
      }

    await redis.del(`paper:${runDate}`);
    await logGeneration({
      runDate,
      status: "success",
      message: `Generated ${generated.length} questions`,
      metadata: {
        rejectionStats,
        adaptiveProfileApplied: Boolean(adaptiveProfile),
        difficultyBlueprint: difficultyPlanBySubject,
        formatBlueprint: formatPlanBySubject
      }
    });

      return { date: runDate, paperId, generatedCount: generated.length, skipped: false, rejectionStats };
    } catch (error) {
      await client.query("ROLLBACK");
      await logGeneration({ runDate, status: "failed", message: error.message, metadata: { rejectionStats } });
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await releaseRedisLock(lockKey, lockValue);
  }
};

export const getPaperWithQuestions = async (date) => {
  const cacheKey = `paper:${date}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const paper = await query("SELECT id, paper_date, physics_count, chemistry_count, biology_count FROM daily_papers WHERE paper_date = $1", [date]);

  if (!paper.rowCount) {
    return null;
  }

  const questions = await query(
    `SELECT q.id, q.subject, q.topic, q.syllabus_unit, q.concept_tag, q.question_format, q.source_type, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
            q.correct_option, q.explanation, q.difficulty, q.probability_score, q.confidence_score, q.verification_flag, dpq.question_order
     FROM daily_paper_questions dpq
     JOIN questions q ON q.id = dpq.question_id
     WHERE dpq.paper_id = $1
     ORDER BY dpq.question_order ASC`,
    [paper.rows[0].id]
  );

  const payload = {
    ...paper.rows[0],
    questions: questions.rows
  };

  await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS);
  return payload;
};

export const scheduleDailyGeneration = () => {
  if (totalBlueprintQuestions > MAX_DAILY_GENERATION_QUESTIONS) {
    throw new Error(`Daily generation blueprint must be <= ${MAX_DAILY_GENERATION_QUESTIONS} questions`);
  }

  cron.schedule(
    "1 0 * * *",
    async () => {
      const date = getIstDateString();
      const cronLockKey = getCronLockKey(date);
      let cronLock = null;
      try {
        cronLock = await acquireRedisLock(cronLockKey, CRON_LOCK_TTL_SECONDS);
        if (!cronLock) {
          return;
        }
        await generateDailyPaper({ triggeredBy: "cron" });
        logger.info({ date }, "Daily paper generated successfully");
      } catch (error) {
        logger.error({ err: error }, "Daily generation failed");
      } finally {
        if (cronLock) {
          await releaseRedisLock(cronLockKey, cronLock);
        }
      }
    },
    {
      timezone: "Asia/Kolkata"
    }
  );
};
