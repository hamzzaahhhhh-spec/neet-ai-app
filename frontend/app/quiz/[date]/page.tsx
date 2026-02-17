"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PaletteButton, { QuestionState } from "@/components/PaletteButton";
import QuestionCard from "@/components/QuestionCard";
import ResultSummary from "@/components/ResultSummary";
import { api, AttemptResult, PaperResponse, Question } from "@/lib/api";
import {
  applyOptionSelection,
  buildAnswerPayload,
  getUnansweredQuestionNumbers,
  getVisibleBatch,
  hashQuestionClient,
  initializeQuestionState,
  optionFromKey,
  submitSingleQuestionState,
} from "@/lib/engines/questionEngine.js";
import { analyzeSubmissionAnalytics } from "@/lib/engines/analyticsEngine.js";
import { createInactivityMonitor, createTimerEngine } from "@/lib/engines/timerEngine.js";
import {
  clearSessionState,
  isQuestionHashDuplicate,
  loadSessionState,
  registerQuestionHashes,
  restorePerformanceHistory,
  savePerformanceHistory,
  saveSessionState,
} from "@/lib/engines/storageEngine.js";
import {
  analyzePerformance,
  adjustDifficultyDistribution,
  calculateConfidenceScore,
  calculateReadinessScore,
  detectImprovementTrend,
  detectWeakAreas,
  generateAdaptiveWeights,
} from "@/lib/engines/adaptiveEngine.js";
import { applyUiPreferences, debounce, enterFullScreen, exitFullScreen, rafThrottle, smoothScrollToElement } from "@/lib/engines/uiController.js";

type Option = "A" | "B" | "C" | "D";

type Props = {
  params: Promise<{ date: string }>;
};

type ReviewMap = Record<number, { correctOption: Option; explanation: string; isCorrect: boolean }>;

type AdaptiveInsights = {
  overallAccuracy: number;
  hardSuccessRate: number;
  eliteMode: boolean;
  recommendedDistribution: { easy: number; moderate: number; hard: number };
  adaptiveWeights: Record<string, number>;
  weakAreas: Array<{ topic: string; accuracy: number }>;
  confidenceByTopic: Record<string, { score: number; level: string }>;
  recommendedDifficulty: string;
  suggestedDailyStudyHours: number;
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

export default function QuizDatePage({ params }: Props) {
  const router = useRouter();

  const [date, setDate] = useState("");
  const [paper, setPaper] = useState<PaperResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const [answers, setAnswers] = useState<Record<number, Option | null>>({});
  const [states, setStates] = useState<Record<number, QuestionState>>({});
  const [locked, setLocked] = useState<Record<number, boolean>>({});
  const [solutionOpen, setSolutionOpen] = useState<Record<number, boolean>>({});
  const [reviewById, setReviewById] = useState<ReviewMap>({});

  const [batchSize, setBatchSize] = useState(26);
  const [remainingSeconds, setRemainingSeconds] = useState(180 * 60);
  const [finalSubmitting, setFinalSubmitting] = useState(false);
  const [finalSubmitted, setFinalSubmitted] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);

  const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);
  const [activeSubject, setActiveSubject] = useState<"Physics" | "Chemistry" | "Biology">("Physics");
  const [timeBySubject, setTimeBySubject] = useState<Record<string, number>>({ Physics: 0, Chemistry: 0, Biology: 0 });
  const [questionTimeSpent, setQuestionTimeSpent] = useState<Record<number, number>>({});

  const [isDark, setIsDark] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [fontScale, setFontScale] = useState(1);

  const [predictionMode, setPredictionMode] = useState(false);
  const [examModeEnabled, setExamModeEnabled] = useState(true);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [unansweredList, setUnansweredList] = useState<number[]>([]);

  const [adaptiveInsights, setAdaptiveInsights] = useState<AdaptiveInsights | null>(null);
  const [revisionSuggestions, setRevisionSuggestions] = useState<{
    urgentTopics: string[];
    improvingTopics: string[];
    recommendedDifficulty: string;
    suggestedDailyStudyHours: number;
  } | null>(null);

  const timerRef = useRef<ReturnType<typeof createTimerEngine> | null>(null);
  const inactivityRef = useRef<ReturnType<typeof createInactivityMonitor> | null>(null);
  const activeQuestionRef = useRef<number | null>(null);
  const remainingSecondsRef = useRef(180 * 60);
  const questionByIdRef = useRef<Map<number, Question>>(new Map());
  const submitRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    params.then((resolved) => setDate(resolved.date));
  }, [params]);

  useEffect(() => {
    const storedTheme = localStorage.getItem("neet_theme");
    const storedContrast = localStorage.getItem("neet_contrast") === "1";
    const storedScale = Number(localStorage.getItem("neet_font_scale") || 1);
    const storedPrediction = localStorage.getItem("neet_prediction_mode") === "1";

    setIsDark(storedTheme === "dark");
    setHighContrast(storedContrast);
    setFontScale(clamp(storedScale, 0.9, 1.2));
    setPredictionMode(storedPrediction);
  }, []);

  useEffect(() => {
    localStorage.setItem("neet_theme", isDark ? "dark" : "light");
    localStorage.setItem("neet_contrast", highContrast ? "1" : "0");
    localStorage.setItem("neet_font_scale", String(fontScale));
    localStorage.setItem("neet_prediction_mode", predictionMode ? "1" : "0");
    applyUiPreferences({ isDark, highContrast, fontScale });
  }, [fontScale, highContrast, isDark, predictionMode]);

  const loadPaper = useCallback(async () => {
    if (!date) return;
    const token = localStorage.getItem("neet_token");
    if (!token) {
      router.push("/");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setWarning("");

      const payload = await api.getPaperByDate(date, token, predictionMode);
      setPaper(payload);
      setRemainingSeconds(payload.settings.exam_duration_minutes * 60);
      setExamModeEnabled(payload.settings.exam_mode);

      const init = initializeQuestionState(payload.questions) as {
        answers: Record<number, Option | null>;
        states: Record<number, QuestionState>;
        locked: Record<number, boolean>;
        solutionOpen: Record<number, boolean>;
      };
      setAnswers(init.answers);
      setStates(init.states);
      setLocked(init.locked);
      setSolutionOpen(init.solutionOpen);

      const dup = payload.questions.filter((q) => isQuestionHashDuplicate(hashQuestionClient(q))).length;
      setDuplicateCount(dup);
      if (dup > 0) {
        setWarning(`${dup} questions were seen in your last 30-day local history.`);
      }

      const restored = loadSessionState(date);
      if (restored && restored.paperId === payload.paperId && !restored.finalSubmitted) {
        setAnswers((prev) => ({ ...prev, ...(restored.answers || {}) }));
        setStates((prev) => ({ ...prev, ...(restored.states || {}) }));
        setLocked((prev) => ({ ...prev, ...(restored.locked || {}) }));
        setSolutionOpen((prev) => ({ ...prev, ...(restored.solutionOpen || {}) }));
        setRemainingSeconds(Number(restored.remainingSeconds || payload.settings.exam_duration_minutes * 60));
        setWarning((existing) => existing || "Previous session restored from autosave.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load paper";
      const paperMissing = message.toLowerCase().includes("paper not found") || message.includes("404");
      const today = istDate();

      if (paperMissing && date !== today) {
        try {
          const todayPayload = await api.getTodayPaper(token, predictionMode);
          setPaper(todayPayload);
          setWarning(`Paper for ${date} was not available. Loaded today's paper (${today}).`);
          setRemainingSeconds(todayPayload.settings.exam_duration_minutes * 60);
          setExamModeEnabled(todayPayload.settings.exam_mode);
          const init = initializeQuestionState(todayPayload.questions) as {
            answers: Record<number, Option | null>;
            states: Record<number, QuestionState>;
            locked: Record<number, boolean>;
            solutionOpen: Record<number, boolean>;
          };
          setAnswers(init.answers);
          setStates(init.states);
          setLocked(init.locked);
          setSolutionOpen(init.solutionOpen);
          return;
        } catch {
          setError("Today's paper is not generated yet. Ask admin to generate paper from Admin Panel.");
          return;
        }
      }

      if (paperMissing) {
        setError("Paper is not generated yet for this date. Ask admin to regenerate from Admin Panel.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [date, predictionMode, router]);

  useEffect(() => {
    loadPaper();
  }, [loadPaper]);

  const mergedQuestions: Question[] = useMemo(() => {
    if (!paper) return [];
    return paper.questions.map((q) => {
      const review = reviewById[q.id];
      if (!review) return q;
      return {
        ...q,
        correctOption: review.correctOption,
        explanation: review.explanation,
      };
    });
  }, [paper, reviewById]);

  const visibleQuestions = useMemo(() => getVisibleBatch(mergedQuestions, batchSize), [batchSize, mergedQuestions]);

  const questionById = useMemo(() => {
    const map = new Map<number, Question>();
    mergedQuestions.forEach((q) => map.set(q.id, q));
    return map;
  }, [mergedQuestions]);

  useEffect(() => {
    activeQuestionRef.current = activeQuestionId;
  }, [activeQuestionId]);

  useEffect(() => {
    remainingSecondsRef.current = remainingSeconds;
  }, [remainingSeconds]);

  useEffect(() => {
    questionByIdRef.current = questionById;
  }, [questionById]);

  const attemptedCount = useMemo(() => Object.values(answers).filter((item) => item !== null).length, [answers]);
  const totalQuestions = mergedQuestions.length;
  const progressPercent = totalQuestions ? Math.round((attemptedCount / totalQuestions) * 100) : 0;

  const scrollToQuestion = useCallback((questionId: number) => {
    smoothScrollToElement(`question-${questionId}`);
  }, []);

  const updateStateAfterSubmit = useCallback(
    (questionId: number) => {
      const question = questionById.get(questionId);
      if (!question) return;
      const review = reviewById[questionId];
      const computed = submitSingleQuestionState({
        question,
        questionId,
        answers,
        states,
        locked,
        examMode: examModeEnabled,
        finalSubmitted,
        review,
      }) as { states: Record<number, QuestionState>; locked: Record<number, boolean> };

      setStates(computed.states);
      setLocked(computed.locked);
    },
    [answers, examModeEnabled, finalSubmitted, locked, questionById, reviewById, states]
  );

  const selectOption = useCallback(
    (questionId: number, option: Option) => {
      if (finalSubmitted) return;
      const updated = applyOptionSelection({ answers, states, locked, questionId, option }) as {
        answers: Record<number, Option | null>;
        states: Record<number, QuestionState>;
      };
      setAnswers(updated.answers);
      setStates(updated.states);
      setActiveQuestionId(questionId);

      const question = questionById.get(questionId);
      if (question) {
        setActiveSubject(question.subject);
      }
    },
    [answers, finalSubmitted, locked, questionById, states]
  );

  const submitQuestion = useCallback(
    (questionId: number) => {
      updateStateAfterSubmit(questionId);
    },
    [updateStateAfterSubmit]
  );

  const toggleSolution = useCallback((questionId: number) => {
    setSolutionOpen((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  }, []);

  const finalizeAdaptiveAnalytics = useCallback(
    (payload: AttemptResult) => {
      const history = restorePerformanceHistory();
      const todayEntry = {
        date,
        score: payload.score,
        accuracy: payload.accuracy,
        overallAccuracy: payload.accuracy,
        subjectStats: payload.subjectStats,
        topicStats: payload.topicStats,
        difficultyStats: payload.difficultyStats,
        averageResponseTimeSeconds: payload.averageTimePerQuestion,
      };
      const updatedHistory = savePerformanceHistory(todayEntry);

      const perf = analyzePerformance({ history: updatedHistory, latest: todayEntry }) as {
        overallAccuracy: number;
        hardSuccessRate: number;
        eliteMode: boolean;
        topicStats: Record<string, { correct: number; incorrect: number }>;
        weakAreas: Array<{ topic: string; accuracy: number }>;
      };

      const recommendedDistribution = adjustDifficultyDistribution({
        baseDistribution: { easy: 40, moderate: 36, hard: 24 },
        overallAccuracy: perf.overallAccuracy,
        hardSuccessRate: perf.hardSuccessRate,
        eliteModeEnabled: perf.eliteMode,
      }) as { easy: number; moderate: number; hard: number };

      const adaptiveWeights = generateAdaptiveWeights({
        topicStats: perf.topicStats,
        predictionMode,
        recurrenceMap: {},
      }) as Record<string, number>;

      const confidenceByTopic: Record<string, { score: number; level: string }> = {};
      Object.entries(perf.topicStats).forEach(([topic, stats]) => {
        const attempted = (stats.correct || 0) + (stats.incorrect || 0);
        const accuracy = attempted ? ((stats.correct || 0) / attempted) * 100 : 0;
        const trend = detectImprovementTrend(updatedHistory, topic, 7) as { delta: number };
        const consistency = clamp(50 + trend.delta * 2, 0, 100);
        const score = calculateConfidenceScore({ accuracy, consistency }) as number;
        const level = score >= 85 ? "Mastered" : score >= 65 ? "Strong" : score >= 45 ? "Moderate" : "Low";
        confidenceByTopic[topic] = { score, level };
      });

      calculateReadinessScore({
        overallAccuracy: payload.accuracy,
        hardAccuracy:
          payload.difficultyStats?.hard?.attempted
            ? (payload.difficultyStats.hard.correct / payload.difficultyStats.hard.attempted) * 100
            : 0,
        avgTimePerQuestion: payload.averageTimePerQuestion,
      });

      const weakTopics = detectWeakAreas(payload.topicStats, 3) as Array<{ topic: string }>;
      const improvingTopics = Object.keys(payload.topicStats)
        .filter((topic) => (detectImprovementTrend(updatedHistory, topic, 7) as { improving: boolean }).improving)
        .slice(0, 2);

      const recommendedDifficulty =
        recommendedDistribution.hard > recommendedDistribution.easy
          ? "Moderate-Hard"
          : recommendedDistribution.easy > recommendedDistribution.hard
          ? "Easy-Moderate"
          : "Balanced";

      const suggestedDailyStudyHours =
        payload.accuracy >= 75 ? 3 : payload.accuracy >= 55 ? 4 : payload.accuracy >= 40 ? 5 : 6;

      setAdaptiveInsights({
        overallAccuracy: perf.overallAccuracy,
        hardSuccessRate: perf.hardSuccessRate,
        eliteMode: perf.eliteMode,
        recommendedDistribution,
        adaptiveWeights,
        weakAreas: perf.weakAreas,
        confidenceByTopic,
        recommendedDifficulty,
        suggestedDailyStudyHours,
      });

      setRevisionSuggestions({
        urgentTopics: weakTopics.map((w) => w.topic).slice(0, 3),
        improvingTopics,
        recommendedDifficulty,
        suggestedDailyStudyHours,
      });

      return { adaptiveWeights };
    },
    [date, predictionMode]
  );

  const submitFullQuiz = useCallback(
    async (force = false) => {
      if (!paper || finalSubmitting || finalSubmitted) return;

      const unanswered = getUnansweredQuestionNumbers(mergedQuestions, answers) as Array<{ number: number; id: number }>;
      setUnansweredList(unanswered.map((item) => item.number));

      if (!force && unanswered.length > 0) {
        scrollToQuestion(unanswered[0].id);
        const numbers = unanswered.map((item) => item.number).join(", ");
        const proceed = window.confirm(
          `You have ${unanswered.length} unanswered questions. Numbers: ${numbers}. Press OK to submit anyway.`
        );
        if (!proceed) return;
      }

      if (!force) {
        const confirmed = window.confirm("Confirm final submission? This action cannot be undone.");
        if (!confirmed) return;
      }

      const token = localStorage.getItem("neet_token");
      if (!token) {
        setError("Session expired. Please login again.");
        return;
      }

      try {
        setFinalSubmitting(true);
        const payload = await api.submitAttempt(token, {
          paperDate: paper.date,
          answers: buildAnswerPayload(mergedQuestions, answers),
          timeTakenSeconds: timerRef.current?.getElapsedSeconds() || 0,
          timeBySubjectSeconds: timeBySubject,
        });

        setResult(payload);
        setFinalSubmitted(true);

        const nextReview: ReviewMap = {};
        payload.questionReview.forEach((row) => {
          nextReview[row.questionId] = {
            correctOption: row.correctOption,
            explanation: row.explanation,
            isCorrect: row.isCorrect,
          };
        });
        setReviewById(nextReview);

        const nextStates: Record<number, QuestionState> = { ...states };
        const nextLocked = { ...locked };
        payload.questionReview.forEach((row) => {
          nextLocked[row.questionId] = true;
          nextStates[row.questionId] = row.selectedOption ? (row.isCorrect ? "correct" : "incorrect") : "unattempted";
        });
        setLocked(nextLocked);
        setStates(nextStates);

        analyzeSubmissionAnalytics({
          result: payload,
          timeBySubjectSeconds: timeBySubject,
          questionTimes: Object.values(questionTimeSpent),
          questions: mergedQuestions,
        });
        finalizeAdaptiveAnalytics(payload);

        registerQuestionHashes(
          paper.date,
          mergedQuestions.map((q) => hashQuestionClient(q))
        );
        clearSessionState(date);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submission failed");
      } finally {
        setFinalSubmitting(false);
      }
    },
    [
      answers,
      date,
      finalSubmitted,
      finalSubmitting,
      finalizeAdaptiveAnalytics,
      locked,
      mergedQuestions,
      paper,
      questionTimeSpent,
      scrollToQuestion,
      states,
      timeBySubject,
    ]
  );

  useEffect(() => {
    submitRef.current = submitFullQuiz;
  }, [submitFullQuiz]);

  useEffect(() => {
    if (!paper || finalSubmitted) return;

    timerRef.current?.stop();
    const startRemaining = remainingSecondsRef.current;
    const timer = createTimerEngine({
      durationSeconds: startRemaining,
      onTick: (remaining: number) => {
        setRemainingSeconds(remaining);

        const activeId = activeQuestionRef.current;
        const activeQuestion = activeId ? questionByIdRef.current.get(activeId) : null;
        if (activeQuestion) {
          setActiveSubject(activeQuestion.subject);
          setTimeBySubject((prev) => ({ ...prev, [activeQuestion.subject]: (prev[activeQuestion.subject] || 0) + 1 }));
          setQuestionTimeSpent((prev) => ({ ...prev, [activeQuestion.id]: (prev[activeQuestion.id] || 0) + 1 }));
        }
      },
      onTimeout: () => {
        submitRef.current(true);
      },
    });

    timerRef.current = timer;
    timer.start();

    return () => {
      timer.stop();
    };
  }, [finalSubmitted, paper]);

  useEffect(() => {
    if (!paper || finalSubmitted || !examModeEnabled) return;
    const inactivityMinutes = Number(paper.settings.inactivity_limit_minutes || 15);
    inactivityRef.current?.stop();
    const monitor = createInactivityMonitor({
      timeoutMs: inactivityMinutes * 60 * 1000,
      onTimeout: () => {
        window.alert("Inactivity limit reached. Quiz will be auto-submitted.");
        submitFullQuiz(true);
      },
    });
    inactivityRef.current = monitor;
    monitor.start();

    return () => monitor.stop();
  }, [examModeEnabled, finalSubmitted, paper, submitFullQuiz]);

  useEffect(() => {
    if (!examModeEnabled || finalSubmitted) return;
    const onVisibility = () => {
      if (document.hidden) {
        window.alert("Tab switch detected. Stay in this tab during Exam Mode.");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [examModeEnabled, finalSubmitted]);

  useEffect(() => {
    if (!paper || finalSubmitted) return;
    const interval = window.setInterval(() => {
      saveSessionState(date, {
        paperId: paper.paperId,
        answers,
        states,
        locked,
        solutionOpen,
        remainingSeconds,
        finalSubmitted,
      });
    }, 10000);

    return () => window.clearInterval(interval);
  }, [answers, date, finalSubmitted, locked, paper, remainingSeconds, solutionOpen, states]);

  useEffect(() => {
    if (!paper || finalSubmitted) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeQuestionId) return;
      const option = optionFromKey(event.key) as Option | null;
      if (option) {
        event.preventDefault();
        selectOption(activeQuestionId, option);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        submitQuestion(activeQuestionId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeQuestionId, finalSubmitted, paper, selectOption, submitQuestion]);

  useEffect(() => {
    if (!paper) return;

    const handleScroll = rafThrottle(() => {
      for (const question of mergedQuestions) {
        const element = document.getElementById(`q-wrap-${question.id}`);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (rect.top >= 0 && rect.top <= 220) {
          setActiveQuestionId(question.id);
          setActiveSubject(question.subject);
          break;
        }
      }
    });

    const loadMore = debounce(() => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 800;
      if (nearBottom) {
        setBatchSize((prev) => Math.min(mergedQuestions.length, prev + 14));
      }
    }, 90);

    const onScroll = () => {
      handleScroll();
      loadMore();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mergedQuestions, paper]);

  const toggleExamMode = async () => {
    const next = !examModeEnabled;
    setExamModeEnabled(next);
    if (next) {
      await enterFullScreen();
    } else {
      await exitFullScreen();
    }
  };

  if (loading) {
    return <div className="p-8 text-sm">Loading question paper...</div>;
  }

  if (error || !paper) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="rounded bg-rose-100 p-3 text-sm text-rose-700">{error || "Paper unavailable"}</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-3 pb-20 pt-4 sm:px-6">
      <section className="sticky top-0 z-40 mb-4 rounded-xl border bg-panel p-3 shadow-soft backdrop-blur">
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
          <div>
            <p className="text-sm font-bold">Daily Paper: {paper.date}</p>
            <p className="text-xs text-baseText/75">
              Timer: {formatTime(remainingSeconds)} | Attempted: {attemptedCount}/{totalQuestions} | Active: {activeSubject}
            </p>
            {duplicateCount > 0 ? <p className="text-xs text-amber-600">Local duplicate history hit: {duplicateCount}</p> : null}
            {warning ? <p className="text-xs text-amber-600">{warning}</p> : null}
          </div>

          <div className="h-3 w-full overflow-hidden rounded bg-panelAlt md:w-56">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>

          <button
            type="button"
            className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            onClick={() => submitFullQuiz(false)}
            disabled={finalSubmitting || finalSubmitted}
          >
            {finalSubmitting ? "Submitting..." : finalSubmitted ? "Submitted" : "Submit Full Quiz"}
          </button>

          <div className="flex flex-wrap gap-1 text-xs">
            <button type="button" className="rounded bg-slate-700 px-2 py-1 text-white" onClick={() => setIsDark((v) => !v)}>
              {isDark ? "Light" : "Dark"}
            </button>
            <button type="button" className="rounded bg-slate-700 px-2 py-1 text-white" onClick={() => setHighContrast((v) => !v)}>
              Contrast
            </button>
            <button type="button" className="rounded bg-slate-700 px-2 py-1 text-white" onClick={() => setFontScale((v) => clamp(v + 0.05, 0.9, 1.2))}>
              A+
            </button>
            <button type="button" className="rounded bg-slate-700 px-2 py-1 text-white" onClick={() => setFontScale((v) => clamp(v - 0.05, 0.9, 1.2))}>
              A-
            </button>
            <button type="button" className="rounded bg-indigo-700 px-2 py-1 text-white" onClick={toggleExamMode}>
              {examModeEnabled ? "Exam ON" : "Exam OFF"}
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 text-white ${predictionMode ? "bg-emerald-700" : "bg-slate-700"}`}
              onClick={() => {
                if (!finalSubmitted && attemptedCount > 0) {
                  const ok = window.confirm("Switching prediction mode reloads the paper view. Continue?");
                  if (!ok) return;
                }
                setPredictionMode((v) => !v);
              }}
            >
              Prediction {predictionMode ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {unansweredList.length > 0 && !finalSubmitted ? (
          <p className="mt-2 text-xs text-amber-700">Unanswered question numbers: {unansweredList.join(", ")}</p>
        ) : null}
      </section>

      <section className="sticky bottom-0 z-30 mb-4 rounded-xl border bg-panel p-3 shadow-soft md:static md:mb-4">
        <h2 className="mb-2 text-sm font-bold">Question Palette</h2>
        <div className="grid grid-cols-10 gap-2 sm:grid-cols-14 md:grid-cols-20">
          {mergedQuestions.map((q, idx) => (
            <PaletteButton key={q.id} questionNo={idx + 1} questionId={q.id} state={states[q.id] || "unattempted"} onJump={scrollToQuestion} />
          ))}
        </div>
      </section>

      <section className="space-y-3" style={{ fontSize: `${fontScale}rem`, scrollBehavior: "smooth" }}>
        {visibleQuestions.map((question: Question, idx: number) => (
          <div key={question.id} id={`q-wrap-${question.id}`} data-qid={question.id}>
            <QuestionCard
              question={question}
              index={idx}
              selectedOption={answers[question.id] ?? null}
              onSelect={selectOption}
              onSubmitQuestion={submitQuestion}
              onToggleSolution={toggleSolution}
              showSolution={Boolean(solutionOpen[question.id])}
              examMode={examModeEnabled}
              state={states[question.id] || "unattempted"}
              submitted={finalSubmitted}
              locked={Boolean(locked[question.id] && examModeEnabled)}
              highContrast={highContrast}
              onFocus={(id) => setActiveQuestionId(id)}
            />
          </div>
        ))}
      </section>

      {result ? <ResultSummary result={result} timeBySubjectSeconds={timeBySubject} revisionSuggestions={revisionSuggestions || undefined} /> : null}

      {adaptiveInsights ? (
        <section className="mt-6 space-y-3 rounded-xl border bg-panel p-4 shadow-soft">
          <h2 className="text-lg font-bold">Adaptive Intelligence Panel</h2>
          <p className="text-sm">
            Overall Accuracy: {adaptiveInsights.overallAccuracy.toFixed(2)}% | Hard Success: {adaptiveInsights.hardSuccessRate.toFixed(2)}% | Elite Mode: {adaptiveInsights.eliteMode ? "Unlocked" : "Locked"}
          </p>
          <p className="text-sm">
            Recommended Next Distribution: Easy {adaptiveInsights.recommendedDistribution.easy}, Moderate {adaptiveInsights.recommendedDistribution.moderate}, Hard {adaptiveInsights.recommendedDistribution.hard}
          </p>
          <p className="text-sm">
            Recommended session difficulty: {adaptiveInsights.recommendedDifficulty} | Suggested study hours/day: {adaptiveInsights.suggestedDailyStudyHours}
          </p>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Confidence Meter By Topic</h3>
            <div className="max-h-64 overflow-auto rounded bg-panelAlt p-2 text-sm">
              {Object.entries(adaptiveInsights.confidenceByTopic)
                .sort((a, b) => b[1].score - a[1].score)
                .map(([topic, data]) => (
                  <p key={topic} className="border-b py-1 last:border-b-0">
                    {topic}: {data.score.toFixed(2)} ({data.level})
                  </p>
                ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
