from __future__ import annotations

import logging
from fastapi import Depends, FastAPI, Header, HTTPException

from app.config import settings
from app.generator import generate_question
from app.schemas import GenerateQuestionRequest, GenerateQuestionResponse
from app.topics import BIOLOGY_TOPICS

app = FastAPI(title="NEET AI Generator", version="1.0.0")
logger = logging.getLogger("ai-service")


def verify_api_key(x_api_key: str = Header(default="")) -> None:
    if not settings.service_api_key:
        raise HTTPException(status_code=500, detail="SERVICE_API_KEY is not configured")
    if x_api_key != settings.service_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "ok": True,
        "service": "ai-service",
        "openai_enabled": bool(settings.openai_api_key),
        "biology_topics_loaded": bool(BIOLOGY_TOPICS),
    }


@app.post("/generate-question", response_model=GenerateQuestionResponse, dependencies=[Depends(verify_api_key)])
def generate_question_endpoint(payload: GenerateQuestionRequest) -> GenerateQuestionResponse:
    try:
        question, signature, confidence, source, verification_flag = generate_question(payload)
        return GenerateQuestionResponse(
            question=question,
            hashSignature=signature,
            confidence=confidence,
            verificationFlag=verification_flag,
            source=source,
        )
    except ValueError as exc:
        logger.warning("Validation failed for generated question: %s", str(exc))
        raise HTTPException(status_code=400, detail="Invalid generation request") from exc
    except RuntimeError as exc:
        logger.error("Generation runtime error: %s", str(exc))
        raise HTTPException(status_code=422, detail="Question generation failed") from exc
    except Exception as exc:
        logger.exception("Unexpected generation error")
        raise HTTPException(status_code=500, detail="Internal server error") from exc
