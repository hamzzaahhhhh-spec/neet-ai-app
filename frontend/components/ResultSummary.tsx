"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { AttemptResult } from "@/lib/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Props = {
  result: AttemptResult;
  timeBySubjectSeconds: Record<string, number>;
  revisionSuggestions?: {
    urgentTopics: string[];
    improvingTopics: string[];
    recommendedDifficulty: string;
    suggestedDailyStudyHours: number;
  };
};

export default function ResultSummary({ result, timeBySubjectSeconds, revisionSuggestions }: Props) {
  const subjectLabels = Object.keys(result.subjectStats);
  const subjectScores = subjectLabels.map((key) => result.subjectStats[key].score);
  const subjectAccuracy = subjectLabels.map((key) => {
    const row = result.subjectStats[key];
    const attempted = row.correct + row.incorrect;
    return attempted ? Number(((row.correct / attempted) * 100).toFixed(2)) : 0;
  });

  const chartData = {
    labels: subjectLabels,
    datasets: [
      {
        label: "Subject Score",
        data: subjectScores,
        backgroundColor: ["#0369a1", "#9333ea", "#16a34a"],
      },
      {
        label: "Subject Accuracy %",
        data: subjectAccuracy,
        backgroundColor: ["#0ea5e9", "#a855f7", "#22c55e"],
      },
    ],
  };

  return (
    <section className="mt-8 space-y-4 rounded-xl border bg-panel p-4 shadow-soft">
      <h2 className="text-xl font-bold">Performance Summary</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-panelAlt p-3">
          <p className="text-xs">Total Score</p>
          <p className="text-2xl font-bold">{result.score}</p>
        </div>
        <div className="rounded-lg bg-panelAlt p-3">
          <p className="text-xs">Accuracy</p>
          <p className="text-2xl font-bold">{result.accuracy.toFixed(2)}%</p>
        </div>
        <div className="rounded-lg bg-panelAlt p-3">
          <p className="text-xs">Correct</p>
          <p className="text-2xl font-bold">{result.correct}</p>
        </div>
        <div className="rounded-lg bg-panelAlt p-3">
          <p className="text-xs">Incorrect</p>
          <p className="text-2xl font-bold">{result.incorrect}</p>
        </div>
        <div className="rounded-lg bg-panelAlt p-3">
          <p className="text-xs">Avg Time / Question</p>
          <p className="text-2xl font-bold">{result.averageTimePerQuestion.toFixed(2)}s</p>
        </div>
        <div className="rounded-lg bg-panelAlt p-3">
          <p className="text-xs">Readiness</p>
          <p className="text-xl font-bold">{result.readiness.band}</p>
        </div>
      </div>

      <div className="rounded-lg bg-white p-2 dark:bg-slate-900">
        <Bar data={chartData} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">Weak Areas (Lowest 3 Topics)</h3>
        <ul className="space-y-2 text-sm">
          {result.weakAreas.map((item) => (
            <li key={item.topic} className="rounded bg-panelAlt p-2">
              {item.topic}: score {item.score}, correct {item.correct}, incorrect {item.incorrect}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">Strong Areas (Top 3 Topics)</h3>
        <ul className="space-y-2 text-sm">
          {result.strongAreas.map((item) => (
            <li key={item.topic} className="rounded bg-panelAlt p-2">
              {item.topic}: score {item.score}, correct {item.correct}, incorrect {item.incorrect}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">Topic-wise Breakdown</h3>
        <div className="max-h-64 overflow-auto rounded bg-panelAlt p-2 text-sm">
          {Object.entries(result.topicStats).map(([topic, stats]) => (
            <p key={topic} className="border-b py-1 last:border-b-0">
              {topic}: score {stats.score}, correct {stats.correct}, incorrect {stats.incorrect}, unattempted {stats.unattempted}
            </p>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">Time Spent Per Subject</h3>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          {Object.entries(timeBySubjectSeconds).map(([subject, seconds]) => (
            <li key={subject} className="rounded bg-panelAlt p-2">
              {subject}: {Math.floor(seconds / 60)}m {seconds % 60}s
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded bg-panelAlt p-3 text-sm">
        <p>
          <span className="font-semibold">Predicted Percentile:</span> {result.predictedRank.percentile}% ({result.predictedRank.note})
        </p>
        <p>
          <span className="font-semibold">Estimated AIR Range:</span> {result.predictedRank.airRange}
        </p>
      </div>

      {revisionSuggestions ? (
        <div className="rounded bg-panelAlt p-3 text-sm">
          <h3 className="mb-2 font-bold">Smart Revision Suggestions</h3>
          <p>Urgent topics: {revisionSuggestions.urgentTopics.join(", ") || "None"}</p>
          <p>Improving topics: {revisionSuggestions.improvingTopics.join(", ") || "None"}</p>
          <p>Recommended next-session difficulty: {revisionSuggestions.recommendedDifficulty}</p>
          <p>Suggested daily study hours: {revisionSuggestions.suggestedDailyStudyHours}</p>
        </div>
      ) : null}
    </section>
  );
}
