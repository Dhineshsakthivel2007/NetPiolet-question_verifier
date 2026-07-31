"""Topic service — CRUD operations for topics."""

from __future__ import annotations
import re

from sqlalchemy.orm import Session
from app.models.topic import Topic
from app.models.question import Question
from app.schemas import TopicCreate, TopicUpdate
from app.services import question_service


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"[-\s]+", "-", text)


def create_topic(db: Session, data: TopicCreate) -> Topic:
    query = db.query(Topic).filter(Topic.name == data.name)
    if data.level_id:
        query = query.filter(Topic.level_id == data.level_id)
    existing = query.first()
    if existing:
        return existing
    topic = Topic(
        name=data.name,
        slug=_slugify(data.name),
        description=data.description,
        level_id=data.level_id,
    )
    db.add(topic); db.commit(); db.refresh(topic)
    return topic


def get_topics(db: Session, level_id: str | None = None) -> list[Topic]:
    query = db.query(Topic)
    if level_id:
        query = query.filter(Topic.level_id == level_id)
    return query.order_by(Topic.name).all()


def get_topic(db: Session, topic_id: str) -> Topic | None:
    return db.query(Topic).filter(Topic.id == topic_id).first()


def update_topic(db: Session, topic_id: str, data: TopicUpdate) -> Topic | None:
    topic = get_topic(db, topic_id)
    if not topic:
        return None
    if data.name is not None:
        topic.name = data.name; topic.slug = _slugify(data.name)
    if data.description is not None:
        topic.description = data.description
    if data.level_id is not None:
        topic.level_id = data.level_id
    db.commit(); db.refresh(topic)
    return topic


def delete_topic(db: Session, topic_id: str) -> bool:
    topic = get_topic(db, topic_id)
    if not topic:
        return False

    # Delete all associated questions and their dependent records using question_service
    questions = db.query(Question).filter(Question.topic_id == topic_id).all()
    for q in questions:
        question_service.delete_question(db, q.id)

    db.delete(topic)
    db.commit()
    return True
