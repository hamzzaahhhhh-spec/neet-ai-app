from __future__ import annotations

from app.config import settings

PHYSICS_TOPICS = [
    "Units & Dimensions",
    "Mechanics",
    "Gravitation",
    "Waves & SHM",
    "Thermodynamics",
    "Electromagnetism",
    "Optics",
    "Modern Physics",
]

CHEMISTRY_TOPICS = [
    "Mole concept",
    "Limiting reagent",
    "Gas laws",
    "pH",
    "Thermochemistry",
    "Equilibrium numericals",
    "Hybridization",
    "Bond order",
    "VBT",
    "CFT",
    "Periodic trends",
    "Thermal stability trends",
    "Resonance",
    "Hyperconjugation",
    "Aromaticity",
    "SN1",
    "SN2",
    "E1",
    "E2",
    "Lucas",
    "Tollens",
    "Fehling",
    "Aldol",
    "Cannizzaro",
]

BIOLOGY_TOPICS = settings.biology_topics

TOPICS_BY_SUBJECT = {
    "Physics": PHYSICS_TOPICS,
    "Chemistry": CHEMISTRY_TOPICS,
    "Biology": BIOLOGY_TOPICS,
}


def assert_topic_allowed(subject: str, topic: str) -> None:
    allowed = TOPICS_BY_SUBJECT.get(subject, [])
    if topic not in allowed:
        raise ValueError(f"Topic not allowed for {subject}: {topic}")