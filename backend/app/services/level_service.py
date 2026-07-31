"""Level service — CRUD operations for levels."""

from __future__ import annotations
import re

from sqlalchemy.orm import Session
from app.models.level import Level
from app.models.topic import Topic
from app.models.question import Question
from app.schemas import LevelCreate, LevelUpdate
from app.services import topic_service, question_service


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"[-\s]+", "-", text)


def create_level(db: Session, data: LevelCreate) -> Level:
    existing = db.query(Level).filter(Level.name == data.name).first()
    if existing:
        return existing
    level = Level(
        name=data.name,
        slug=_slugify(data.name),
        description=data.description,
        order=data.order,
    )
    db.add(level); db.commit(); db.refresh(level)
    return level


def get_levels(db: Session) -> list[Level]:
    return db.query(Level).order_by(Level.order, Level.name).all()


def get_level(db: Session, level_id: str) -> Level | None:
    return db.query(Level).filter(Level.id == level_id).first()


def update_level(db: Session, level_id: str, data: LevelUpdate) -> Level | None:
    level = get_level(db, level_id)
    if not level:
        return None
    if data.name is not None:
        level.name = data.name; level.slug = _slugify(data.name)
    if data.description is not None:
        level.description = data.description
    if data.order is not None:
        level.order = data.order
    db.commit(); db.refresh(level)
    return level


def delete_level(db: Session, level_id: str) -> bool:
    level = get_level(db, level_id)
    if not level:
        return False

    # Delete all topics under this level (which deletes their questions & dependent records)
    topics = db.query(Topic).filter(Topic.level_id == level_id).all()
    for t in topics:
        topic_service.delete_topic(db, t.id)

    # Also delete any standalone questions linked to this level
    questions = db.query(Question).filter(Question.level_id == level_id).all()
    for q in questions:
        question_service.delete_question(db, q.id)

    db.delete(level)
    db.commit()
    return True
