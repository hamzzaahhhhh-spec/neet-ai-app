import crypto from "crypto";
import { isAllowedTopic } from "../config/topics.js";
import { NEET_2026_SYLLABUS_UNITS } from "../config/syllabus2026.js";

const VAGUE_PATTERNS = [
  /all of the above/i,
  /none of the above/i,
  /cannot be determined/i,
  /may be/i
];
const CONTRADICTORY_PATTERNS = [
  /always[^.]{0,80}never/i,
  /increases[^.]{0,80}decreases/i,
  /both true and false/i
];
const NON_NCERT_PATTERNS = [/outside\s+NCERT/i, /not\s+in\s+NCERT/i, /controversial/i, /unverified/i];
const SPECULATIVE_PATTERNS = [/might/i, /could be/i, /possibly/i, /approximately maybe/i];
const UNIT_PATTERN = /\b(m\/s|m s-1|m\/s\^2|N|J|W|Pa|K|mol|g|kg|cm|mm|L|mL|V|A|ohm|Hz)\b/i;
const QUESTION_FORMATS = ["Single Correct", "Assertion-Reason", "Statement I-II", "Multi-Statement", "Case-Based"];

export const normalizeQuestionText = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();

const extractNumbers = (value) => {
  const matches = String(value).match(/-?\d+(\.\d+)?/g) || [];
  return matches.map((item) => Number(item));
};

const hasNumericContent = (value) => extractNumbers(value).length > 0;

const hasUnit = (value) => UNIT_PATTERN.test(String(value));
const wordCount = (value) => String(value).trim().split(/\s+/).filter(Boolean).length;

export const tokenizeForSimilarity = (value) =>
  normalizeQuestionText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

export const semanticSimilarity = (a, b) => {
  const tokensA = new Set(tokenizeForSimilarity(a));
  const tokensB = new Set(tokenizeForSimilarity(b));
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union ? intersection / union : 0;
};

export const hashQuestion = (question) => {
  const base = [
    question.subject,
    question.topic,
    normalizeQuestionText(question.questionText),
    question.options.A.trim(),
    question.options.B.trim(),
    question.options.C.trim(),
    question.options.D.trim()
  ].join("||");

  return crypto.createHash("sha256").update(base).digest("hex");
};

export const validateQuestionShape = (question) => {
  if (!question || typeof question !== "object") return { valid: false, reason: "Question payload missing" };
  const required = [
    "subject",
    "topic",
    "questionText",
    "options",
    "correctOption",
    "explanation",
    "difficulty",
    "probabilityScore",
    "conceptTag",
    "sourceType",
    "questionFormat",
    "syllabusUnit"
  ];
  for (const field of required) {
    if (question[field] === undefined || question[field] === null || question[field] === "") {
      return { valid: false, reason: `Missing field: ${field}` };
    }
  }

  if (!["Physics", "Chemistry", "Biology"].includes(question.subject)) {
    return { valid: false, reason: "Invalid subject" };
  }
  if (!isAllowedTopic(question.subject, question.topic)) {
    return { valid: false, reason: `Topic not allowed: ${question.topic}` };
  }

  if (!["A", "B", "C", "D"].includes(question.correctOption)) {
    return { valid: false, reason: "Correct option must be A/B/C/D" };
  }
  if (!["easy", "medium", "moderate", "hard"].includes(String(question.difficulty))) {
    return { valid: false, reason: "difficulty must be easy/medium/moderate/hard" };
  }
  if (!["Conceptual", "Numerical", "Application"].includes(question.sourceType)) {
    return { valid: false, reason: "sourceType must be Conceptual/Numerical/Application" };
  }
  if (!QUESTION_FORMATS.includes(question.questionFormat)) {
    return { valid: false, reason: "Invalid questionFormat" };
  }
  if (typeof question.syllabusUnit !== "string" || question.syllabusUnit.trim().length < 3) {
    return { valid: false, reason: "syllabusUnit missing or invalid" };
  }
  if (!(NEET_2026_SYLLABUS_UNITS[question.subject] || []).includes(question.syllabusUnit)) {
    return { valid: false, reason: "syllabusUnit not in official NEET 2026 unit list for subject" };
  }
  if (typeof question.conceptTag !== "string" || question.conceptTag.trim().length < 2) {
    return { valid: false, reason: "conceptTag missing or invalid" };
  }

  const options = question.options;
  const optionValues = [options.A, options.B, options.C, options.D].map((value) => (value || "").trim());
  if (optionValues.some((value) => !value)) {
    return { valid: false, reason: "All options must be non-empty" };
  }
  if (optionValues.some((value) => wordCount(value) < 5 && !extractNumbers(value).length)) {
    return { valid: false, reason: "Options must be sufficiently descriptive (minimum 5 words unless numerical)" };
  }

  const unique = new Set(optionValues.map((value) => value.toLowerCase()));
  if (unique.size !== 4) {
    return { valid: false, reason: "Duplicate options detected" };
  }

  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(question.questionText)) {
      return { valid: false, reason: "Vague wording detected" };
    }
  }
  for (const pattern of CONTRADICTORY_PATTERNS) {
    if (pattern.test(question.questionText) || pattern.test(question.explanation)) {
      return { valid: false, reason: "Contradictory wording detected" };
    }
  }
  for (const pattern of SPECULATIVE_PATTERNS) {
    if (pattern.test(question.questionText) || pattern.test(question.explanation)) {
      return { valid: false, reason: "Speculative wording not allowed in NEET pattern" };
    }
  }

  const lines = String(question.questionText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { valid: false, reason: "Question text must be minimum two lines for NEET-style depth" };
  }
  if (wordCount(question.questionText) < 22) {
    return { valid: false, reason: "Question text too short; needs real NEET-style depth" };
  }

  if (question.questionFormat === "Assertion-Reason") {
    if (!/Assertion/i.test(question.questionText) || !/Reason/i.test(question.questionText)) {
      return { valid: false, reason: "Assertion-Reason format requires both Assertion and Reason lines" };
    }
  } else if (question.questionFormat === "Statement I-II") {
    if (!/Statement I/i.test(question.questionText) || !/Statement II/i.test(question.questionText)) {
      return { valid: false, reason: "Statement I-II format requires Statement I and Statement II" };
    }
  } else if (question.questionFormat === "Multi-Statement") {
    if (!/following statements/i.test(question.questionText)) {
      return { valid: false, reason: "Multi-Statement format requires a statements block" };
    }
  } else if (question.questionFormat === "Case-Based") {
    if (!String(question.questionText).trim().startsWith("Case:")) {
      return { valid: false, reason: "Case-Based format must start with 'Case:'" };
    }
  }

  const correctValue = options[question.correctOption] || "";
  if (!correctValue.trim()) {
    return { valid: false, reason: "Correct option text missing" };
  }

  if (question.sourceType === "Numerical") {
    if (!hasNumericContent(correctValue)) {
      return { valid: false, reason: "Numerical question requires numeric correct option" };
    }
    const explanationNumbers = extractNumbers(question.explanation);
    const correctNumbers = extractNumbers(correctValue);
    if (correctNumbers.length && explanationNumbers.length) {
      const match = explanationNumbers.some((num) => correctNumbers.some((correctNum) => Math.abs(num - correctNum) <= 0.02));
      if (!match) {
        return { valid: false, reason: "Numerical answer mismatch with explanation" };
      }
    } else {
      return { valid: false, reason: "Numerical question must include calculable explanation with number" };
    }
  }

  if (hasUnit(question.questionText)) {
    const optionsWithUnits = optionValues.filter((value) => hasUnit(value));
    if (!optionsWithUnits.length) {
      return { valid: false, reason: "Question uses units but options do not include units" };
    }
  }

  if (question.subject === "Biology") {
    for (const pattern of NON_NCERT_PATTERNS) {
      if (pattern.test(question.questionText) || pattern.test(question.explanation)) {
        return { valid: false, reason: "Biology statement not aligned with NCERT-safe wording" };
      }
    }
  }

  const probability = Number(question.probabilityScore);
  if (Number.isNaN(probability) || probability < 0 || probability > 1) {
    return { valid: false, reason: "Probability score must be between 0 and 1" };
  }

  return { valid: true };
};
