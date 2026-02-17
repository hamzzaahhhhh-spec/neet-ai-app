const OPTION_MAP = ["A", "B", "C", "D"];

export const hashQuestionClient = (question) => {
  const normalized = `${question.subject}|${question.topic}|${question.questionText}|${question.options.A}|${question.options.B}|${question.options.C}|${question.options.D}`
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a_${(hash >>> 0).toString(16)}`;
};

export const initializeQuestionState = (questions) => {
  const answers = {};
  const states = {};
  const locked = {};
  const solutionOpen = {};

  questions.forEach((q) => {
    answers[q.id] = null;
    states[q.id] = "unattempted";
    locked[q.id] = false;
    solutionOpen[q.id] = false;
  });

  return { answers, states, locked, solutionOpen };
};

export const applyOptionSelection = ({ answers, states, locked, questionId, option }) => {
  if (locked[questionId]) return { answers, states };
  return {
    answers: { ...answers, [questionId]: option },
    states: { ...states, [questionId]: "attempted" }
  };
};

export const evaluateSingleQuestion = ({
  question,
  selectedOption,
  examMode,
  finalSubmitted,
  review,
  currentState
}) => {
  if (!selectedOption) return "unattempted";

  if (!examMode || finalSubmitted) {
    if (review) return review.isCorrect ? "correct" : "incorrect";
    if (question.correctOption) return selectedOption === question.correctOption ? "correct" : "incorrect";
  }

  return currentState || "attempted";
};

export const submitSingleQuestionState = ({
  question,
  questionId,
  answers,
  states,
  locked,
  examMode,
  finalSubmitted,
  review
}) => {
  const selectedOption = answers[questionId];
  const nextState = evaluateSingleQuestion({
    question,
    selectedOption,
    examMode,
    finalSubmitted,
    review,
    currentState: states[questionId]
  });

  return {
    states: { ...states, [questionId]: nextState },
    locked: examMode ? { ...locked, [questionId]: true } : locked
  };
};

export const buildAnswerPayload = (questions, answers) =>
  questions.map((q) => ({ questionId: q.id, selectedOption: answers[q.id] || null }));

export const getUnansweredQuestionNumbers = (questions, answers) =>
  questions
    .filter((q) => !answers[q.id])
    .map((q, idx) => ({ number: idx + 1, id: q.id }));

export const optionFromKey = (key) => {
  if (["1", "2", "3", "4"].includes(key)) {
    return OPTION_MAP[Number(key) - 1];
  }
  return null;
};

export const getVisibleBatch = (questions, batchCount) => questions.slice(0, Math.max(1, batchCount));