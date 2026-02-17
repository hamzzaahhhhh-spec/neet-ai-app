"use client";

import { memo } from "react";
import type { Question } from "@/lib/api";
import type { QuestionState } from "./PaletteButton";

type Props = {
  question: Question;
  index: number;
  selectedOption: "A" | "B" | "C" | "D" | null;
  onSelect: (questionId: number, option: "A" | "B" | "C" | "D") => void;
  onSubmitQuestion: (questionId: number) => void;
  onToggleSolution: (questionId: number) => void;
  showSolution: boolean;
  examMode: boolean;
  state: QuestionState;
  submitted: boolean;
  locked?: boolean;
  highContrast?: boolean;
  onFocus?: (questionId: number) => void;
};

const stateBorder: Record<QuestionState, string> = {
  unattempted: "border-slate-300",
  attempted: "border-sky-400",
  correct: "border-emerald-400",
  incorrect: "border-rose-400",
};

function QuestionCardComponent({
  question,
  index,
  selectedOption,
  onSelect,
  onSubmitQuestion,
  onToggleSolution,
  showSolution,
  examMode,
  state,
  submitted,
  locked = false,
  highContrast = false,
  onFocus,
}: Props) {
  return (
    <article
      id={`question-${question.id}`}
      tabIndex={0}
      onFocus={() => onFocus?.(question.id)}
      className={`rounded-xl border-2 bg-panel p-4 shadow-soft ${stateBorder[state]} ${highContrast ? "contrast-card" : ""}`}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold tracking-wide text-baseText">
          Q{index + 1}. {question.subject} | {question.topic} | {question.syllabusUnit} | {question.questionFormat} | {question.conceptTag} | {question.sourceType}
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-panelAlt px-2 py-1 text-xs text-baseText/80">{state.toUpperCase()}</span>
          <span className="rounded-full bg-panelAlt px-2 py-1 text-xs text-baseText/80">{question.difficulty.toUpperCase()}</span>
          <span className="rounded-full bg-panelAlt px-2 py-1 text-xs text-baseText/80">{question.verificationFlag}</span>
        </div>
      </header>

      <p className="mb-4 whitespace-pre-line text-sm leading-6 text-baseText">{question.questionText}</p>

      <div className="space-y-2">
        {(["A", "B", "C", "D"] as const).map((opt) => {
          const checked = selectedOption === opt;
          return (
            <label
              key={opt}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm transition ${
                checked ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30" : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={opt}
                checked={checked}
                onChange={() => onSelect(question.id, opt)}
                disabled={submitted || locked}
              />
              <span className="font-semibold">{opt}.</span>
              <span>{question.options[opt]}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          onClick={() => onSubmitQuestion(question.id)}
          disabled={submitted || locked}
        >
          {locked ? "Question Locked" : "Submit This Question"}
        </button>
        <button
          type="button"
          className="rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          onClick={() => onToggleSolution(question.id)}
          disabled={examMode && !submitted}
          title={examMode && !submitted ? "Locked in exam mode until final submit" : "View explanation"}
        >
          View Solution
        </button>
      </div>

      {showSolution && (question.explanation || submitted) ? (
        <div className="mt-3 rounded-lg bg-panelAlt p-3 text-xs text-baseText">
          <p>
            <span className="font-semibold">Correct Option:</span> {question.correctOption || "Shown after final evaluation"}
          </p>
          <p className="mt-1">
            <span className="font-semibold">Explanation:</span> {question.explanation || "Detailed explanation available after submission."}
          </p>
        </div>
      ) : null}
    </article>
  );
}

const QuestionCard = memo(QuestionCardComponent);

export default QuestionCard;
