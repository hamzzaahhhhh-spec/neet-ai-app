import { query } from "../db/postgres.js";

export const scoreAttempt = ({ answers, questionsById, negativeMarkingEnabled }) => {
  let correct = 0;
  let incorrect = 0;
  let unattempted = 0;

  const subjectStats = {
    Physics: { correct: 0, incorrect: 0, unattempted: 0, score: 0 },
    Chemistry: { correct: 0, incorrect: 0, unattempted: 0, score: 0 },
    Biology: { correct: 0, incorrect: 0, unattempted: 0, score: 0 }
  };

  const topicStats = {};
  const difficultyStats = {
    easy: { correct: 0, incorrect: 0, attempted: 0 },
    moderate: { correct: 0, incorrect: 0, attempted: 0 },
    hard: { correct: 0, incorrect: 0, attempted: 0 }
  };

  for (const answer of answers) {
    const question = questionsById.get(answer.questionId);
    if (!question) continue;

    if (!answer.selectedOption) {
      unattempted += 1;
      subjectStats[question.subject].unattempted += 1;
      topicStats[question.topic] = topicStats[question.topic] || { correct: 0, incorrect: 0, unattempted: 0, score: 0 };
      topicStats[question.topic].unattempted += 1;
      continue;
    }

    const difficulty = question.difficulty || "moderate";
    difficultyStats[difficulty] = difficultyStats[difficulty] || { correct: 0, incorrect: 0, attempted: 0 };
    difficultyStats[difficulty].attempted += 1;

    if (answer.selectedOption === question.correct_option) {
      correct += 1;
      difficultyStats[difficulty].correct += 1;
      subjectStats[question.subject].correct += 1;
      subjectStats[question.subject].score += 4;
      topicStats[question.topic] = topicStats[question.topic] || { correct: 0, incorrect: 0, unattempted: 0, score: 0 };
      topicStats[question.topic].correct += 1;
      topicStats[question.topic].score += 4;
    } else {
      incorrect += 1;
      difficultyStats[difficulty].incorrect += 1;
      const penalty = negativeMarkingEnabled ? 1 : 0;
      subjectStats[question.subject].incorrect += 1;
      subjectStats[question.subject].score -= penalty;
      topicStats[question.topic] = topicStats[question.topic] || { correct: 0, incorrect: 0, unattempted: 0, score: 0 };
      topicStats[question.topic].incorrect += 1;
      topicStats[question.topic].score -= penalty;
    }
  }

  const totalScore = correct * 4 - incorrect * (negativeMarkingEnabled ? 1 : 0);
  const attempted = correct + incorrect;
  const accuracy = attempted ? (correct / attempted) * 100 : 0;

  return {
    totalScore,
    accuracy,
    correct,
    incorrect,
    unattempted,
    subjectStats,
    topicStats,
    difficultyStats
  };
};

export const saveAttempt = async ({ userId, paperId, scored, timeTakenSeconds, timeBySubjectSeconds }) => {
  const inserted = await query(
    `INSERT INTO attempts (user_id, paper_id, score, accuracy, time_taken_seconds, topic_stats_json, subject_stats_json, time_by_subject_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      userId,
      paperId,
      scored.totalScore,
      scored.accuracy,
      timeTakenSeconds,
      scored.topicStats,
      scored.subjectStats,
      timeBySubjectSeconds || {}
    ]
  );

  return inserted.rows[0].id;
};
