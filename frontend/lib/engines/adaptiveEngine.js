export const calculateConfidenceScore = ({ accuracy, consistency }) => Number((accuracy * 0.7 + consistency * 0.3).toFixed(2));

export const detectWeakAreas = (topicStats, limit = 3) =>
  Object.entries(topicStats)
    .map(([topic, stats]) => {
      const attempted = (stats.correct || 0) + (stats.incorrect || 0);
      const accuracy = attempted ? ((stats.correct || 0) / attempted) * 100 : 0;
      return { topic, accuracy, attempted, ...stats };
    })
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);

export const detectImprovementTrend = (history, topic, lookback = 7) => {
  const slice = history.slice(-lookback);
  const points = slice
    .map((entry) => {
      const stats = entry.topicStats?.[topic];
      if (!stats) return null;
      const attempted = (stats.correct || 0) + (stats.incorrect || 0);
      return attempted ? ((stats.correct || 0) / attempted) * 100 : 0;
    })
    .filter((value) => value !== null);

  if (points.length < 2) return { improving: false, delta: 0 };
  const delta = Number((points[points.length - 1] - points[0]).toFixed(2));
  return { improving: delta > 0, delta };
};

export const calculateReadinessScore = ({ overallAccuracy, hardAccuracy, avgTimePerQuestion }) => {
  const timeEfficiency = Math.max(0, Math.min(100, ((120 - avgTimePerQuestion) / 120) * 100));
  const score = overallAccuracy * 0.5 + hardAccuracy * 0.3 + timeEfficiency * 0.2;

  let band = "Beginner";
  if (score >= 90) band = "Top 5% Potential";
  else if (score >= 75) band = "NEET-Ready";
  else if (score >= 60) band = "Competitive";
  else if (score >= 45) band = "Developing";

  return { score: Number(score.toFixed(2)), band };
};

export const adjustDifficultyDistribution = ({
  baseDistribution,
  overallAccuracy,
  hardSuccessRate,
  eliteModeEnabled
}) => {
  const total = Object.values(baseDistribution).reduce((acc, v) => acc + v, 0);
  const next = { ...baseDistribution };

  if (eliteModeEnabled) {
    const hard = Math.round(total * 0.4);
    const easy = Math.max(0, Math.round(total * 0.2));
    const moderate = total - hard - easy;
    return { easy, moderate, hard, eliteMode: true };
  }

  if (overallAccuracy > 75) {
    const shift = Math.max(1, Math.round(total * 0.1));
    next.hard += shift;
    next.easy = Math.max(0, next.easy - shift);
  } else if (overallAccuracy < 45) {
    const shift = Math.max(1, Math.round(total * 0.15));
    next.easy += shift;
    next.hard = Math.max(0, next.hard - shift);
  }

  if (hardSuccessRate > 70) {
    next.hard += 1;
    next.moderate = Math.max(0, next.moderate - 1);
  }

  const currentTotal = next.easy + next.moderate + next.hard;
  if (currentTotal !== total) next.moderate += total - currentTotal;

  return { ...next, eliteMode: false };
};

export const generateAdaptiveWeights = ({ topicStats, predictionMode, recurrenceMap = {} }) => {
  const maxRecurrence = Math.max(1, ...Object.values(recurrenceMap));

  return Object.entries(topicStats).reduce((acc, [topic, stats]) => {
    const attempted = (stats.correct || 0) + (stats.incorrect || 0);
    const accuracy = attempted ? ((stats.correct || 0) / attempted) * 100 : 100;
    const weakness = Math.max(0.1, (100 - accuracy) / 100);
    const recurrence = (recurrenceMap[topic] || 0) / maxRecurrence;
    let weight = 1 + weakness;
    if (predictionMode) weight += recurrence * 0.6;
    if (accuracy < 40) weight += 0.4;
    acc[topic] = Number(weight.toFixed(3));
    return acc;
  }, {});
};

export const analyzePerformance = ({ history, latest }) => {
  const last7 = history.slice(-7);
  const overallAccuracy = Number(latest?.accuracy || 0);
  const subjectStats = latest?.subjectStats || {};
  const topicStats = latest?.topicStats || {};
  const difficultyStats = latest?.difficultyStats || {};

  const hard = difficultyStats.hard || { correct: 0, attempted: 0 };
  const hardSuccessRate = hard.attempted ? (hard.correct / hard.attempted) * 100 : 0;

  const weakAreas = detectWeakAreas(topicStats, 3);
  const weakAreaBoost = weakAreas.length
    ? {
        enabled: last7.length >= 3 && last7.slice(-3).every((entry) => {
          const topic = weakAreas[0].topic;
          const stats = entry.topicStats?.[topic];
          const attempted = stats ? (stats.correct || 0) + (stats.incorrect || 0) : 0;
          const accuracy = attempted ? ((stats.correct || 0) / attempted) * 100 : 100;
          return accuracy < 35;
        }),
        topic: weakAreas[0].topic
      }
    : { enabled: false };

  const eliteMode = hardSuccessRate > 75 && overallAccuracy > 75;

  return {
    overallAccuracy,
    subjectStats,
    topicStats,
    difficultyStats,
    hardSuccessRate: Number(hardSuccessRate.toFixed(2)),
    eliteMode,
    weakAreas,
    weakAreaBoost,
    last7DayTrend: last7.map((entry) => ({ date: entry.date, accuracy: entry.accuracy }))
  };
};