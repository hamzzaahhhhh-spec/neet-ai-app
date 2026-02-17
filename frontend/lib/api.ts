export type Subject = "Physics" | "Chemistry" | "Biology";

export type Question = {
  id: number;
  subject: Subject;
  topic: string;
  syllabusUnit: string;
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  difficulty: "easy" | "moderate" | "hard";
  conceptTag: string;
  questionFormat: "Single Correct" | "Assertion-Reason" | "Statement I-II" | "Multi-Statement" | "Case-Based";
  sourceType: "Conceptual" | "Numerical" | "Application";
  confidenceScore: number;
  verificationFlag: "Verified" | "Estimated" | "Regenerated";
  probabilityScore: number;
  correctOption?: "A" | "B" | "C" | "D";
  explanation?: string;
};

export type PaperResponse = {
  date: string;
  paperId: number;
  settings: {
    exam_mode: boolean;
    negative_marking_enabled: boolean;
    exam_duration_minutes: number;
    prediction_mode_enabled?: boolean;
    inactivity_limit_minutes?: number;
  };
  questions: Question[];
};

export type AnswerPayload = {
  questionId: number;
  selectedOption: "A" | "B" | "C" | "D" | null;
};

export type AttemptResult = {
  attemptId: number;
  score: number;
  accuracy: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  subjectStats: Record<string, { correct: number; incorrect: number; unattempted: number; score: number }>;
  topicStats: Record<string, { correct: number; incorrect: number; unattempted: number; score: number }>;
  weakAreas: Array<{ topic: string; correct: number; incorrect: number; unattempted: number; score: number }>;
  strongAreas: Array<{ topic: string; correct: number; incorrect: number; unattempted: number; score: number }>;
  averageTimePerQuestion: number;
  difficultyStats: Record<string, { correct: number; incorrect: number; attempted: number }>;
  readiness: {
    score: number;
    band: "Beginner" | "Developing" | "Competitive" | "NEET-Ready" | "Top 5% Potential";
  };
  predictedRank: {
    percentile: number;
    airRange: string;
    note: "ESTIMATED";
  };
  questionReview: Array<{
    questionId: number;
    selectedOption: "A" | "B" | "C" | "D" | null;
    correctOption: "A" | "B" | "C" | "D";
    explanation: string;
    isCorrect: boolean;
  }>;
};

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:4000/api/v1";

const request = async <T>(path: string, token: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.detail || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const api = {
  login: (email: string, password: string) =>
    fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Login failed");
      }
      return res.json() as Promise<{ token: string }>;
    }),
  register: (email: string, password: string) =>
    fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Register failed");
      }
      return res.json() as Promise<{ token: string }>;
    }),
  getPaperByDate: (date: string, token: string, predictionMode = false) =>
    request<PaperResponse>(`/papers/${date}${predictionMode ? "?predictionMode=1" : ""}`, token),
  getTodayPaper: (token: string, predictionMode = false) =>
    request<PaperResponse>(`/papers/today${predictionMode ? "?predictionMode=1" : ""}`, token),
  submitAttempt: (token: string, payload: { paperDate: string; answers: AnswerPayload[]; timeTakenSeconds: number; timeBySubjectSeconds: Record<string, number> }) =>
    request<AttemptResult>("/attempts/submit", token, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminGetSettings: (token: string) => request("/admin/settings", token),
  adminUpdateSettings: (token: string, payload: Record<string, unknown>) =>
    request("/admin/settings", token, { method: "PUT", body: JSON.stringify(payload) }),
  adminTopicWeights: (token: string) => request<Array<{ subject: string; weights_json: Record<string, number> }>>("/admin/topic-weights", token),
  adminUpdateTopicWeights: (token: string, payload: { subject: string; weights: Record<string, number> }) =>
    request("/admin/topic-weights", token, { method: "PUT", body: JSON.stringify(payload) }),
  adminRegenerate: (token: string, date?: string, adaptiveProfile?: Record<string, unknown>) =>
    request("/admin/paper/regenerate", token, { method: "POST", body: JSON.stringify({ date, adaptiveProfile }) }),
  adminLogs: (token: string) => request("/admin/logs", token),
  adminDuplicates: (token: string) => request("/admin/duplicates", token),
  adminAnalytics: (token: string) => request("/admin/analytics", token),
  adminLeaderboard: (token: string, period: "daily" | "weekly" = "daily") =>
    request(`/admin/leaderboard?period=${period}`, token),
  adminGetPaper: (token: string, date: string) => request(`/admin/paper/${date}`, token),
  leaderboardDaily: (token: string) => request("/leaderboard/daily", token),
  leaderboardWeekly: (token: string) => request("/leaderboard/weekly", token),
  getRevisionQueue: (token: string) => request("/attempts/revision-queue", token),
};

export const decodeRole = (token: string): string | null => {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded.role || null;
  } catch {
    return null;
  }
};
