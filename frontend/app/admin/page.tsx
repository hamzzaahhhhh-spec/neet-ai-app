"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { api, decodeRole } from "@/lib/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const istDate = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [weights, setWeights] = useState<Array<{ subject: string; weights_json: Record<string, number> }>>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [paperDate, setPaperDate] = useState(istDate());
  const [paper, setPaper] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [dailyBoard, setDailyBoard] = useState<any[]>([]);
  const [weeklyBoard, setWeeklyBoard] = useState<any[]>([]);

  const role = useMemo(() => (token ? decodeRole(token) : null), [token]);

  const loadData = useCallback(async (activeToken: string) => {
    const [s, w, l, d, p, a, ld, lw] = await Promise.all([
      api.adminGetSettings(activeToken),
      api.adminTopicWeights(activeToken),
      api.adminLogs(activeToken),
      api.adminDuplicates(activeToken),
      api.adminGetPaper(activeToken, paperDate).catch(() => null),
      api.adminAnalytics(activeToken),
      api.adminLeaderboard(activeToken, "daily"),
      api.adminLeaderboard(activeToken, "weekly"),
    ]);

    setSettings(s);
    setWeights(w);
    setLogs(l as any[]);
    setDuplicates(d as any[]);
    setPaper(p);
    setAnalytics(a);
    setDailyBoard(ld as any[]);
    setWeeklyBoard(lw as any[]);
  }, [paperDate]);

  useEffect(() => {
    const t = localStorage.getItem("neet_token") || "";
    setToken(t);

    if (!t) {
      setError("Login required");
      setLoading(false);
      return;
    }

    if (decodeRole(t) !== "admin") {
      setError("Admin role required");
      setLoading(false);
      return;
    }

    loadData(t)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load admin data"))
      .finally(() => setLoading(false));
  }, [loadData]);

  const updateSetting = async (field: string, value: any) => {
    if (!token) return;
    const updated = await api.adminUpdateSettings(token, { [field]: value });
    setSettings(updated);
  };

  const saveWeight = async (subject: string, topic: string, value: number) => {
    if (!token) return;
    const row = weights.find((item) => item.subject === subject);
    if (!row) return;

    const next = {
      ...row.weights_json,
      [topic]: value,
    };

    const response = await api.adminUpdateTopicWeights(token, { subject, weights: next });
    setWeights(response as Array<{ subject: string; weights_json: Record<string, number> }>);
  };

  const regenerate = async () => {
    if (!token) return;
    await api.adminRegenerate(token, paperDate);
    await loadData(token);
  };

  if (loading) return <div className="p-6 text-sm">Loading admin panel...</div>;

  if (error) return <div className="p-6 text-sm text-rose-600">{error}</div>;

  const dauChart = analytics
    ? {
        labels: analytics.dailyActiveUsers?.map((item: any) => item.day) || [],
        datasets: [
          {
            label: "Daily Active Users",
            data: analytics.dailyActiveUsers?.map((item: any) => Number(item.active_users)) || [],
            borderColor: "#0284c7",
            backgroundColor: "#0ea5e9",
          },
        ],
      }
    : null;

  const scoreChart = analytics
    ? {
        labels: analytics.averageScoreTrend?.map((item: any) => item.day) || [],
        datasets: [
          {
            label: "Average Score",
            data: analytics.averageScoreTrend?.map((item: any) => Number(item.avg_score)) || [],
            borderColor: "#16a34a",
            backgroundColor: "#22c55e",
          },
        ],
      }
    : null;

  const difficultyChart = analytics
    ? {
        labels: analytics.difficultySuccessGraph?.map((item: any) => item.difficulty) || [],
        datasets: [
          {
            label: "Difficulty Success Rate",
            data: analytics.difficultySuccessGraph?.map((item: any) => Number(item.success_rate) * 100) || [],
            backgroundColor: ["#38bdf8", "#f59e0b", "#ef4444"],
          },
        ],
      }
    : null;

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <h1 className="text-3xl font-bold">Admin Control Panel</h1>
      <p className="text-sm">Role: {role}</p>

      <section className="rounded-xl border bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">Exam Controls</h2>
        <div className="grid gap-3 sm:grid-cols-5">
          <label className="rounded bg-panelAlt p-3 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settings?.exam_mode)}
              onChange={(e) => updateSetting("examMode", e.target.checked)}
              className="mr-2"
            />
            Exam Mode
          </label>
          <label className="rounded bg-panelAlt p-3 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settings?.negative_marking_enabled)}
              onChange={(e) => updateSetting("negativeMarkingEnabled", e.target.checked)}
              className="mr-2"
            />
            Negative Marking
          </label>
          <label className="rounded bg-panelAlt p-3 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settings?.prediction_mode_enabled)}
              onChange={(e) => updateSetting("predictionModeEnabled", e.target.checked)}
              className="mr-2"
            />
            Prediction Mode Default
          </label>
          <label className="rounded bg-panelAlt p-3 text-sm">
            Duration (min)
            <input
              type="number"
              min={30}
              max={360}
              value={settings?.exam_duration_minutes || 180}
              onChange={(e) => updateSetting("examDurationMinutes", Number(e.target.value))}
              className="mt-2 w-full rounded border p-2"
            />
          </label>
          <label className="rounded bg-panelAlt p-3 text-sm">
            Inactivity Limit (min)
            <input
              type="number"
              min={5}
              max={60}
              value={settings?.inactivity_limit_minutes || 15}
              onChange={(e) => updateSetting("inactivityLimitMinutes", Number(e.target.value))}
              className="mt-2 w-full rounded border p-2"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">Paper Generation</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={paperDate} onChange={(e) => setPaperDate(e.target.value)} className="rounded border p-2" />
          <button onClick={regenerate} className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white">
            Regenerate Paper
          </button>
          <button onClick={() => token && loadData(token)} className="rounded bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
            Refresh Data
          </button>
        </div>
      </section>

      <section className="rounded-xl border bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">Analytics Dashboard</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded bg-panelAlt p-2">{dauChart ? <Line data={dauChart} /> : <p className="text-sm">No DAU data</p>}</div>
          <div className="rounded bg-panelAlt p-2">{scoreChart ? <Line data={scoreChart} /> : <p className="text-sm">No score trend data</p>}</div>
          <div className="rounded bg-panelAlt p-2">{difficultyChart ? <Bar data={difficultyChart} /> : <p className="text-sm">No difficulty data</p>}</div>
          <div className="rounded bg-panelAlt p-3 text-sm">
            <p className="font-semibold">Most Attempted Subject</p>
            <p>{analytics?.mostAttemptedSubject?.subject || "N/A"}</p>
            <p className="mt-3 font-semibold">Hardest Question Of The Day</p>
            <p className="text-xs">{analytics?.hardestQuestionOfDay?.question_text || "N/A"}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded bg-panelAlt p-3 text-sm">
            <p className="mb-2 font-semibold">Weakest Topics Nationally</p>
            {(analytics?.weakestTopicsNational || []).map((topic: any) => (
              <p key={topic.topic} className="border-b py-1 last:border-b-0">
                {topic.topic}: {topic.avg_topic_score}
              </p>
            ))}
          </div>
          <div className="rounded bg-panelAlt p-3 text-sm">
            <p className="mb-2 font-semibold">Topic Accuracy Heatmap (sample list)</p>
            {(analytics?.topicAccuracyHeatmap || []).slice(0, 20).map((entry: any) => (
              <p key={`${entry.subject}-${entry.topic}`} className="border-b py-1 last:border-b-0">
                {entry.subject} - {entry.topic}: {(Number(entry.accuracy) * 100).toFixed(1)}%
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">Leaderboards</h2>
        <div className="grid gap-4 lg:grid-cols-2 text-sm">
          <div className="rounded bg-panelAlt p-3">
            <p className="mb-2 font-semibold">Daily Top 100</p>
            {dailyBoard.map((row, idx) => (
              <p key={`${row.user_id}-${idx}`} className="border-b py-1 last:border-b-0">
                #{idx + 1} {row.email} | score {row.score} | acc {Number(row.accuracy).toFixed(2)}%
              </p>
            ))}
          </div>
          <div className="rounded bg-panelAlt p-3">
            <p className="mb-2 font-semibold">Weekly Average Ranking</p>
            {weeklyBoard.map((row, idx) => (
              <p key={`${row.user_id}-${idx}`} className="border-b py-1 last:border-b-0">
                #{idx + 1} {row.email} | avg {Number(row.average_score).toFixed(2)} | acc {Number(row.accuracy).toFixed(2)}%
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">Topic Weights</h2>
        <div className="space-y-4">
          {weights.map((group) => (
            <div key={group.subject} className="rounded bg-panelAlt p-3">
              <h3 className="mb-2 text-sm font-bold">{group.subject}</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {Object.entries(group.weights_json).map(([topic, value]) => (
                  <label key={topic} className="grid grid-cols-[1fr_90px] items-center gap-2 text-sm">
                    <span>{topic}</span>
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      defaultValue={value}
                      onBlur={(e) => saveWeight(group.subject, topic, Number(e.target.value))}
                      className="rounded border p-1"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">Generation Logs</h2>
        <div className="max-h-64 overflow-auto rounded bg-panelAlt p-3 text-sm">
          {logs.map((entry) => (
            <p key={entry.id} className="border-b py-1 last:border-b-0">
              [{entry.status}] {entry.run_date} - {entry.message}
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">Duplicate Detection (30 Days)</h2>
        <div className="max-h-64 overflow-auto rounded bg-panelAlt p-3 text-sm">
          {duplicates.map((row) => (
            <p key={row.date} className="border-b py-1 last:border-b-0">
              {row.date}: {row.unique_hashes}/{row.total_questions} unique
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">Daily Paper Preview ({paperDate})</h2>
        {paper ? (
          <div className="max-h-96 overflow-auto rounded bg-panelAlt p-3 text-sm">
            <p className="mb-2 font-semibold">Total Questions: {paper.questions.length}</p>
            {paper.questions.map((q: any, idx: number) => (
              <div key={q.id} className="mb-2 rounded bg-panel p-2">
                <p className="font-semibold">
                  Q{idx + 1} [{q.subject} - {q.topic}] {q.difficulty} | {q.question_format} | {q.syllabus_unit} | {q.concept_tag} | {q.source_type}
                </p>
                <p>{q.question_text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm">No paper found for selected date.</p>
        )}
      </section>
    </main>
  );
}
