from __future__ import annotations

import json
import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _load_biology_topics() -> list[str]:
    raw = os.getenv("BIOLOGY_TOPICS_JSON", "[]")
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(item).strip() for item in data if str(item).strip()]
    except json.JSONDecodeError:
        pass
    return []


@dataclass(frozen=True)
class Settings:
    app_host: str = os.getenv("APP_HOST", "0.0.0.0")
    app_port: int = int(os.getenv("PORT") or os.getenv("APP_PORT", "8000"))
    app_env: str = os.getenv("APP_ENV", "development")
    service_api_key: str = os.getenv("SERVICE_API_KEY", "")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    confidence_threshold: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.75"))
    biology_topics: list[str] = None

    def __post_init__(self) -> None:
        if not self.service_api_key:
            raise ValueError("SERVICE_API_KEY is required")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required")
        object.__setattr__(self, "biology_topics", _load_biology_topics())


settings = Settings()
