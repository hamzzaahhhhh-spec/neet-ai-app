from __future__ import annotations

import hashlib
import json
import random
import re
from typing import Literal

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

from app.config import settings
from app.schemas import GeneratedQuestion, GenerateQuestionRequest
from app.syllabus2026 import NEET_2026_SYLLABUS_UNITS, QUESTION_FORMATS
from app.topics import assert_topic_allowed


_uncertain_patterns = [
    re.compile(r"all of the above", re.IGNORECASE),
    re.compile(r"none of the above", re.IGNORECASE),
    re.compile(r"cannot be determined", re.IGNORECASE),
    re.compile(r"might", re.IGNORECASE),
    re.compile(r"possibly", re.IGNORECASE),
]

_contradiction_patterns = [
    re.compile(r"always[^.]{0,80}never", re.IGNORECASE),
    re.compile(r"increases[^.]{0,80}decreases", re.IGNORECASE),
]

_unit_pattern = re.compile(r"\b(m/s|m s-1|m/s\^2|N|J|W|Pa|K|mol|g|kg|cm|mm|L|mL|V|A|ohm|Hz)\b", re.IGNORECASE)

_openai_client = None
if OpenAI and settings.openai_api_key:
    _openai_client = OpenAI(api_key=settings.openai_api_key)


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def _extract_numbers(value: str) -> list[float]:
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", value)]


def _word_count(value: str) -> int:
    return len([w for w in re.split(r"\s+", value.strip()) if w])


def _pick_syllabus_unit(request: GenerateQuestionRequest) -> str:
    if request.syllabusUnits:
        return random.choice(request.syllabusUnits)
    return random.choice(NEET_2026_SYLLABUS_UNITS[request.subject])


def hash_signature(question: GeneratedQuestion) -> str:
    payload = "||".join(
        [
            question.subject,
            question.topic,
            _normalize_text(question.questionText),
            question.options.A.strip(),
            question.options.B.strip(),
            question.options.C.strip(),
            question.options.D.strip(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def pick_weighted_topic(request: GenerateQuestionRequest) -> str:
    available = [item for item in request.topicWeights if item.topic in request.topics]
    if not available:
        available = request.topicWeights
    total = sum(item.weight for item in available)
    threshold = random.random() * total
    cumulative = 0.0
    for item in available:
        cumulative += item.weight
        if cumulative >= threshold:
            return item.topic
    return available[-1].topic


def _confidence(question: GeneratedQuestion) -> float:
    score = float(question.probabilityScore)

    lines = [line for line in question.questionText.split("\n") if line.strip()]
    if len(lines) < 2:
        score -= 0.2
    if _word_count(question.questionText) < 22:
        score -= 0.15

    option_values = [question.options.A, question.options.B, question.options.C, question.options.D]
    if any(_word_count(option) < 5 for option in option_values):
        score -= 0.15
    if len({value.lower().strip() for value in option_values}) < 4:
        score -= 0.25

    for pattern in _uncertain_patterns:
        if pattern.search(question.questionText):
            score -= 0.3

    if len(question.explanation) < 40:
        score -= 0.08

    if question.sourceType == "Numerical" and not _extract_numbers(question.explanation):
        score -= 0.2

    return max(0.0, min(1.0, score))


def _is_uncertain(question: GeneratedQuestion) -> bool:
    return _confidence(question) < settings.confidence_threshold


def _verification_flag(confidence: float, regenerated: bool) -> Literal["Verified", "Estimated", "Regenerated"]:
    if regenerated:
        return "Regenerated"
    if confidence >= 0.85:
        return "Verified"
    return "Estimated"


def _build_prompt(request: GenerateQuestionRequest, topic: str, syllabus_unit: str) -> str:
    excluded = ", ".join(request.excludeHashes[-120:]) if request.excludeHashes else "none"

    return (
        "Generate exactly one NEET UG 2026 MCQ and return strict JSON only. "
        "Required keys: subject, topic, questionText, options(A/B/C/D), correctOption, explanation, probabilityScore, conceptTag, sourceType, questionFormat, syllabusUnit, difficulty. "
        "Hard rules: "
        "(1) questionText must be at least TWO lines separated by a newline, and at least 22 words; "
        "(2) each option must be meaningful and at least 5 words (unless numerical sentence with unit), "
        "(3) exactly one correct answer, "
        "(4) no duplicate options, no contradictory wording, no vague wording, "
        "(5) Biology facts must be NCERT aligned, "
        "(6) Numerical questions must include result calculation and units in explanation. "
        f"Subject: {request.subject}. Topic: {topic}. Difficulty: {request.difficulty}. "
        f"questionFormat must be exactly: {request.questionFormat}. "
        f"Use syllabusUnit exactly as: {syllabus_unit}. "
        "Allowed sourceType values: Conceptual, Numerical, Application. "
        "Allowed questionFormat values: Single Correct, Assertion-Reason, Statement I-II, Multi-Statement, Case-Based. "
        f"Avoid semantic duplicates of these recent hashes: {excluded}."
    )


def _from_openai(request: GenerateQuestionRequest, topic: str, syllabus_unit: str) -> GeneratedQuestion:
    if _openai_client is None:
        raise RuntimeError("OpenAI client unavailable")

    response = _openai_client.responses.create(
        model=settings.openai_model,
        input=[
            {
                "role": "system",
                "content": [{"type": "input_text", "text": "Return compact JSON only without markdown fences."}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": _build_prompt(request, topic, syllabus_unit)}],
            },
        ],
        temperature=0.35,
    )

    raw = (response.output_text or "").strip()
    if not raw:
        chunks: list[str] = []
        for item in getattr(response, "output", []) or []:
            for content in getattr(item, "content", []) or []:
                text = getattr(content, "text", None)
                if text:
                    chunks.append(str(text))
        raw = "\n".join(chunks).strip()

    if not raw:
        raise RuntimeError("Empty response from model")

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    parsed = json.loads(cleaned)
    return GeneratedQuestion(**parsed)


def _format_specific_options(question_format: str, truth_pattern: str = "A") -> tuple[dict[str, str], str]:
    if question_format == "Assertion-Reason":
        options = {
            "A": "Both Assertion and Reason are true, and Reason is the correct explanation of Assertion.",
            "B": "Both Assertion and Reason are true, but Reason is not the correct explanation of Assertion.",
            "C": "Assertion is true, but Reason is false according to standard NEET concepts.",
            "D": "Assertion is false, but Reason is true according to standard NEET concepts.",
        }
        return options, truth_pattern

    if question_format == "Statement I-II":
        options = {
            "A": "Both Statement I and Statement II are correct in this context.",
            "B": "Statement I is correct, but Statement II is incorrect in this context.",
            "C": "Statement I is incorrect, but Statement II is correct in this context.",
            "D": "Both Statement I and Statement II are incorrect in this context.",
        }
        return options, truth_pattern

    if question_format == "Multi-Statement":
        options = {
            "A": "Only statements I and II are correct for this NEET-level analysis.",
            "B": "Only statements II and III are correct for this NEET-level analysis.",
            "C": "Only statements I and III are correct for this NEET-level analysis.",
            "D": "Statements I, II and III are all correct for this NEET-level analysis.",
        }
        return options, truth_pattern

    return {}, ""


def _fallback_single_correct(subject: str, topic: str, difficulty: str, syllabus_unit: str) -> GeneratedQuestion:
    if subject == "Physics":
        a = random.randint(3, 9)
        t = random.randint(3, 7)
        v = a * t
        options = [
            f"The final speed should be {v} m/s because velocity increases linearly with time under constant acceleration.",
            f"The final speed should be {v+2} m/s because acceleration adds an extra fixed offset each second.",
            f"The final speed should be {v-1} m/s because one unit is always lost in practical motion conditions.",
            f"The final speed should be {v+4} m/s because displacement must be converted into velocity directly.",
        ]
        return GeneratedQuestion(
            subject=subject,
            topic=topic,
            questionText=(
                f"A particle starts from rest and moves with a constant acceleration of {a} m/s^2 for {t} seconds in a straight line.\n"
                "Using standard kinematic relations from the NEET syllabus, determine the correct final speed and choose the best justified option."
            ),
            options={"A": options[0], "B": options[1], "C": options[2], "D": options[3]},
            correctOption="A",
            explanation=f"Apply v = u + at with u = 0, so v = {a} x {t} = {v} m/s; therefore option A is correct.",
            probabilityScore=0.82,
            conceptTag="Kinematics velocity update",
            sourceType="Numerical",
            questionFormat="Single Correct",
            syllabusUnit=syllabus_unit,
            difficulty=difficulty,
        )

    if subject == "Chemistry":
        m = random.choice([22, 44, 66, 88])
        mm = random.choice([22, 44])
        mol = round(m / mm, 2)
        options = [
            f"The number of moles is {mol} because moles are calculated by dividing given mass by molar mass.",
            f"The number of moles is {round(mol + 0.5, 2)} because gases always show half-mole positive correction.",
            f"The number of moles is {round(max(0, mol - 0.25), 2)} because molecular weight cancels partially in ideal conditions.",
            f"The number of moles is {round(mol + 1, 2)} because molar relation doubles when value is rounded.",
        ]
        return GeneratedQuestion(
            subject=subject,
            topic=topic,
            questionText=(
                f"A sample contains {m} g of a substance with molar mass {mm} g mol^-1 under standard laboratory interpretation.\n"
                "Calculate the amount of substance and identify the option that matches the proper mole concept used in NEET-level chemistry."
            ),
            options={"A": options[0], "B": options[1], "C": options[2], "D": options[3]},
            correctOption="A",
            explanation=f"Moles = mass/molar mass = {m}/{mm} = {mol} mol; this matches option A exactly.",
            probabilityScore=0.81,
            conceptTag="Mole concept computation",
            sourceType="Numerical",
            questionFormat="Single Correct",
            syllabusUnit=syllabus_unit,
            difficulty=difficulty,
        )

    options = {
        "A": "The process is unrelated to accepted NCERT biological mechanisms and therefore should be treated as incorrect.",
        "B": "The process aligns with validated NCERT biological principles and accepted exam-level conceptual interpretation.",
        "C": "The process contradicts all known molecular and physiological evidence presented in standard textbook biology.",
        "D": "The process can only be explained through assumptions that are excluded from NCERT-based NEET preparation.",
    }
    return GeneratedQuestion(
        subject=subject,
        topic=topic,
        questionText=(
            f"In the context of '{topic}', consider the standard NCERT framework used in NEET preparation and question solving.\n"
            "Select the option that best preserves biological accuracy while remaining consistent with textbook-supported mechanisms."
        ),
        options=options,
        correctOption="B",
        explanation="Option B is consistent with NCERT-grounded biological principles, while the other options use overgeneralised or inaccurate claims.",
        probabilityScore=0.8,
        conceptTag="NCERT conceptual verification",
        sourceType="Conceptual",
        questionFormat="Single Correct",
        syllabusUnit=syllabus_unit,
        difficulty=difficulty,
    )


def _fallback_structured_format(subject: str, topic: str, difficulty: str, syllabus_unit: str, question_format: str) -> GeneratedQuestion:
    if question_format == "Assertion-Reason":
        options, correct = _format_specific_options("Assertion-Reason", "B")
        return GeneratedQuestion(
            subject=subject,
            topic=topic,
            questionText=(
                f"Assertion (A): The key principle in '{topic}' is applied directly while solving NEET-level problems under {syllabus_unit}.\n"
                "Reason (R): The same principle can be valid, but it may not always act as the direct explanation for every related statement in this case."
            ),
            options=options,
            correctOption=correct,
            explanation="Both statements are generally valid in this framing, but Reason does not strictly explain Assertion for all forms of the statement.",
            probabilityScore=0.79,
            conceptTag="Assertion reason reasoning",
            sourceType="Application",
            questionFormat="Assertion-Reason",
            syllabusUnit=syllabus_unit,
            difficulty=difficulty,
        )

    if question_format == "Statement I-II":
        options, correct = _format_specific_options("Statement I-II", "A")
        return GeneratedQuestion(
            subject=subject,
            topic=topic,
            questionText=(
                f"Statement I: In '{topic}', the core mechanism is interpreted according to accepted NEET syllabus constraints of {syllabus_unit}.\n"
                "Statement II: Under standard textbook conditions, the same mechanism remains consistent with the canonical concept definition."
            ),
            options=options,
            correctOption=correct,
            explanation="Both statements are aligned with the textbook framing and do not violate standard assumptions, so option A is correct.",
            probabilityScore=0.8,
            conceptTag="Dual statement analysis",
            sourceType="Conceptual",
            questionFormat="Statement I-II",
            syllabusUnit=syllabus_unit,
            difficulty=difficulty,
        )

    if question_format == "Multi-Statement":
        options, correct = _format_specific_options("Multi-Statement", "C")
        return GeneratedQuestion(
            subject=subject,
            topic=topic,
            questionText=(
                f"Consider the following statements regarding '{topic}' as represented in {syllabus_unit}:\n"
                "I. The first statement follows the standard rule set. II. The second statement introduces a boundary case. III. The third statement remains valid under restricted assumptions."
            ),
            options=options,
            correctOption=correct,
            explanation="Statements I and III hold under the specified assumptions, while Statement II introduces an invalid generalisation.",
            probabilityScore=0.78,
            conceptTag="Multi-statement elimination",
            sourceType="Application",
            questionFormat="Multi-Statement",
            syllabusUnit=syllabus_unit,
            difficulty=difficulty,
        )

    if question_format == "Case-Based":
        return GeneratedQuestion(
            subject=subject,
            topic=topic,
            questionText=(
                f"Case: A student applies the central concept of '{topic}' in a practical context linked with {syllabus_unit} and records a specific trend.\n"
                "Based on this case, select the option that provides the most scientifically consistent interpretation under NEET exam assumptions."
            ),
            options={
                "A": "The trend should be ignored because the concept is never used outside direct memory-based examples.",
                "B": "The trend is consistent only if core assumptions are applied correctly and boundary conditions are respected.",
                "C": "The trend proves that all textbook exceptions are invalid across every possible scenario.",
                "D": "The trend confirms that practical interpretation is unnecessary once the term is memorised once.",
            },
            correctOption="B",
            explanation="Case-based questions require concept application with assumptions; option B preserves this requirement without overgeneralisation.",
            probabilityScore=0.8,
            conceptTag="Case interpretation",
            sourceType="Application",
            questionFormat="Case-Based",
            syllabusUnit=syllabus_unit,
            difficulty=difficulty,
        )

    return _fallback_single_correct(subject, topic, difficulty, syllabus_unit)


def _fallback_question(request: GenerateQuestionRequest, topic: str, syllabus_unit: str) -> GeneratedQuestion:
    if request.questionFormat in QUESTION_FORMATS and request.questionFormat != "Single Correct":
        return _fallback_structured_format(request.subject, topic, request.difficulty, syllabus_unit, request.questionFormat)
    return _fallback_single_correct(request.subject, topic, request.difficulty, syllabus_unit)


def _validate_numerical(question: GeneratedQuestion) -> None:
    correct_text = getattr(question.options, question.correctOption)
    correct_nums = _extract_numbers(correct_text)
    if not correct_nums:
        raise ValueError("Numerical question must have numeric correct option")

    explanation_nums = _extract_numbers(question.explanation)
    if not explanation_nums:
        raise ValueError("Numerical question explanation must include calculation result")

    if not any(abs(a - b) <= 0.02 for a in correct_nums for b in explanation_nums):
        raise ValueError("Numerical answer not aligned with explanation")

    if _unit_pattern.search(question.questionText) and not _unit_pattern.search(correct_text):
        raise ValueError("Units expected in correct option")


def _validate_question(question: GeneratedQuestion, request: GenerateQuestionRequest, topic: str, syllabus_unit: str) -> None:
    assert_topic_allowed(request.subject, question.topic)
    if question.subject != request.subject:
        raise ValueError("Subject mismatch")
    if question.topic != topic:
        raise ValueError("Topic mismatch")
    if question.difficulty != request.difficulty:
        raise ValueError("Difficulty mismatch")

    if question.questionFormat != request.questionFormat:
        raise ValueError("Question format mismatch")

    allowed_units = set(NEET_2026_SYLLABUS_UNITS[request.subject])
    if question.syllabusUnit not in allowed_units:
        raise ValueError("Syllabus unit not in NEET 2026 official unit list")
    if request.syllabusUnits and question.syllabusUnit not in set(request.syllabusUnits):
        raise ValueError("Syllabus unit not allowed for this topic")
    if question.syllabusUnit != syllabus_unit:
        raise ValueError("Syllabus unit mismatch")

    option_values = [question.options.A.strip(), question.options.B.strip(), question.options.C.strip(), question.options.D.strip()]
    if len(set([value.lower() for value in option_values])) != 4:
        raise ValueError("Duplicate options")

    if question.correctOption not in {"A", "B", "C", "D"}:
        raise ValueError("Correct option invalid")

    lines = [line.strip() for line in question.questionText.split("\n") if line.strip()]
    if len(lines) < 2:
        raise ValueError("Question must be at least two lines")
    if _word_count(question.questionText) < 22:
        raise ValueError("Question text too short for NEET-style depth")

    for option in option_values:
        if _word_count(option) < 5 and not _extract_numbers(option):
            raise ValueError("Option text too short")

    for pattern in _uncertain_patterns + _contradiction_patterns:
        if pattern.search(question.questionText):
            raise ValueError("Ambiguous or contradictory wording")

    if question.subject == "Biology" and re.search(r"outside\s+ncert|non-ncert", question.explanation, re.IGNORECASE):
        raise ValueError("Biology explanation not NCERT-safe")

    if question.questionFormat == "Assertion-Reason":
        if "Assertion" not in question.questionText or "Reason" not in question.questionText:
            raise ValueError("Assertion-Reason format missing required structure")
    elif question.questionFormat == "Statement I-II":
        if "Statement I" not in question.questionText or "Statement II" not in question.questionText:
            raise ValueError("Statement I-II format missing required structure")
    elif question.questionFormat == "Multi-Statement":
        if "Consider the following statements" not in question.questionText:
            raise ValueError("Multi-Statement format missing required structure")
    elif question.questionFormat == "Case-Based":
        if not question.questionText.strip().startswith("Case:"):
            raise ValueError("Case-Based format missing case stem")

    if question.sourceType == "Numerical":
        _validate_numerical(question)


def generate_question(
    request: GenerateQuestionRequest,
) -> tuple[GeneratedQuestion, str, float, str, Literal["Verified", "Estimated", "Regenerated"]]:
    if not request.topics:
        raise ValueError("At least one topic is required")

    for topic in request.topics:
        assert_topic_allowed(request.subject, topic)

    hash_exclude = set(request.excludeHashes)

    for attempt in range(12):
        topic = pick_weighted_topic(request)
        assert_topic_allowed(request.subject, topic)
        syllabus_unit = _pick_syllabus_unit(request)

        source = "fallback"
        try:
            question = _from_openai(request, topic, syllabus_unit)
            source = "openai"
        except Exception:
            question = _fallback_question(request, topic, syllabus_unit)
            source = "fallback"

        _validate_question(question, request, topic, syllabus_unit)
        signature = hash_signature(question)
        confidence = _confidence(question)

        if signature in hash_exclude:
            continue
        if _is_uncertain(question):
            continue

        verification_flag = _verification_flag(confidence, regenerated=attempt > 0)
        return question, signature, confidence, source, verification_flag

    raise RuntimeError("Unable to generate high-confidence unique NEET-style question")
