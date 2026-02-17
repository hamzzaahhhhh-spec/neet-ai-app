export const scoreLocally = ({ questions, answers, negativeMarkingEnabled }) => {
  let correct = 0;
  let incorrect = 0;
  let unattempted = 0;

  const subjectStats = {
    Physics: { correct: 0, incorrect: 0, unattempted: 0, score: 0 },
    Chemistry: { correct: 0, incorrect: 0, unattempted: 0, score: 0 },
    Biology: { correct: 0, incorrect: 0, unattempted: 0, score: 0 }
  };

  const topicStats = {};

  for (const question of questions) {
    const selected = answers[question.id];
    topicStats[question.topic] = topicStats[question.topic] || { correct: 0, incorrect: 0, unattempted: 0, score: 0 };

    if (!selected) {
      unattempted += 1;
      subjectStats[question.subject].unattempted += 1;
      topicStats[question.topic].unattempted += 1;
      continue;
    }

    if (selected === question.correctOption) {
      correct += 1;
      subjectStats[question.subject].correct += 1;
      subjectStats[question.subject].score += 4;
      topicStats[question.topic].correct += 1;
      topicStats[question.topic].score += 4;
    } else {
      const penalty = negativeMarkingEnabled ? 1 : 0;
      incorrect += 1;
      subjectStats[question.subject].incorrect += 1;
      subjectStats[question.subject].score -= penalty;
      topicStats[question.topic].incorrect += 1;
      topicStats[question.topic].score -= penalty;
    }
  }

  const attempted = correct + incorrect;
  const score = correct * 4 - incorrect * (negativeMarkingEnabled ? 1 : 0);
  const accuracy = attempted ? (correct / attempted) * 100 : 0;

  return {
    score,
    correct,
    incorrect,
    unattempted,
    accuracy,
    subjectStats,
    topicStats
  };
};