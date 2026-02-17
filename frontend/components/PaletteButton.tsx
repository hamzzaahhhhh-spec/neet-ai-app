"use client";

import { useMemo } from "react";

export type QuestionState = "unattempted" | "attempted" | "correct" | "incorrect";

type Props = {
  questionNo: number;
  questionId: number;
  state: QuestionState;
  onJump: (questionId: number) => void;
};

const stateClass: Record<QuestionState, string> = {
  unattempted: "bg-slate-300 text-slate-900",
  attempted: "bg-sky-500 text-white",
  correct: "bg-emerald-500 text-white",
  incorrect: "bg-rose-500 text-white",
};

export default function PaletteButton({ questionNo, questionId, state, onJump }: Props) {
  const label = useMemo(() => `${questionNo}`, [questionNo]);
  return (
    <button
      type="button"
      onClick={() => onJump(questionId)}
      className={`h-8 w-8 rounded text-xs font-semibold transition hover:scale-105 ${stateClass[state]}`}
      aria-label={`Jump to question ${questionNo}`}
    >
      {label}
    </button>
  );
}