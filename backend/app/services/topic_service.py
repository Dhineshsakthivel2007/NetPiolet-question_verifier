"""Topic service — CRUD operations for topics."""

from __future__ import annotations
import re

from sqlalchemy.orm import Session
from app.models.topic import Topic
from app.schemas import TopicCreate, TopicUpdate


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"[-\s]+", "-", text)


def create_topic(db: Session, data: TopicCreate) -> Topic:
    existing = db.query(Topic).filter(Topic.name == data.name).first()
    if existing:
        return existing  # Return the existing topic instead of crashing
    topic = Topic(name=data.name, slug=_slugify(data.name), description=data.description)
    db.add(topic); db.commit(); db.refresh(topic)
    return topic


def get_topics(db: Session) -> list[Topic]:
    return db.query(Topic).order_by(Topic.name).all()


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
    db.commit(); db.refresh(topic)
    return topic


def delete_topic(db: Session, topic_id: str) -> bool:
    topic = get_topic(db, topic_id)
    if not topic:
        return False
    db.delete(topic); db.commit()
    return True
