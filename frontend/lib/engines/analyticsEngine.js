export const analyzeSubmissionAnalytics = ({ result, timeBySubjectSeconds, questionTimes, questions }) => {
  const averageTimePerQuestion =
    questionTimes.length > 0
      ? Number((questionTimes.reduce((acc, value) => acc + value, 0) / questionTimes.length).toFixed(2))
      : result.averageTimePerQuestion || 0;

  const strongestTopics =
    result.strongAreas && result.strongAreas.length
      ? result.strongAreas
      : Object.entries(result.topicStats)
          .sort((a, b) => b[1].score - a[1].score)
          .slice(0, 3)
          .map(([topic, stats]) => ({ topic, ...stats }));

  const weakestTopics =
    result.weakAreas && result.weakAreas.length
      ? result.weakAreas
      : Object.entries(result.topicStats)
          .sort((a, b) => a[1].score - b[1].score)
          .slice(0, 3)
          .map(([topic, stats]) => ({ topic, ...stats }));

  return {
    overallScore: result.score,
    subjectStats: result.subjectStats,
    topicStats: result.topicStats,
    weakestTopics,
    strongestTopics,
    averageTimePerQuestion,
    timeBySubjectSeconds,
    readiness: result.readiness,
    predictedRank: result.predictedRank,
    questionCount: questions.length
  };
};