from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field, field_validator


Subject = Literal["Physics", "Chemistry", "Biology"]
OptionKey = Literal["A", "B", "C", "D"]
Difficulty = Literal["easy", "moderate", "hard"]
SourceType = Literal["Conceptual", "Numerical", "Application"]
VerificationFlag = Literal["Verified", "Estimated", "Regenerated"]
QuestionFormat = Literal["Single Correct", "Assertion-Reason", "Statement I-II", "Multi-Statement", "Case-Based"]


class WeightedTopic(BaseModel):
    topic: str
    weight: float = Field(gt=0)


class GenerateQuestionRequest(BaseModel):
    subject: Subject
    topics: list[str] = Field(min_length=1)
    topicWeights: list[WeightedTopic] = Field(min_length=1)
    difficulty: Difficulty = "moderate"
    questionFormat: QuestionFormat = "Single Correct"
    syllabusUnits: list[str] = Field(default_factory=list)
    excludeHashes: list[str] = Field(default_factory=list)

    @field_validator("topics")
    @classmethod
    def ensure_unique_topics(cls, topics: list[str]) -> list[str]:
        return list(dict.fromkeys([topic.strip() for topic in topics if topic.strip()]))


class QuestionOptions(BaseModel):
    A: str
    B: str
    C: str
    D: str


class GeneratedQuestion(BaseModel):
    subject: Subject
    topic: str
    questionText: str
    options: QuestionOptions
    correctOption: OptionKey
    explanation: str
    probabilityScore: float = Field(ge=0, le=1)
    conceptTag: str = Field(min_length=2)
    sourceType: SourceType
    questionFormat: QuestionFormat
    syllabusUnit: str = Field(min_length=3)
    difficulty: Difficulty


class GenerateQuestionResponse(BaseModel):
    question: GeneratedQuestion
    hashSignature: str
    confidence: float = Field(ge=0, le=1)
    verificationFlag: VerificationFlag
    source: Literal["openai", "fallback"]
