"""Question service — CRUD and evaluation plan management."""

from __future__ import annotations

from sqlalchemy.orm import Session
from app.models.question import Question
from app.schemas import QuestionCreate, QuestionUpdate


def create_question(db: Session, data: QuestionCreate) -> Question:
    q = Question(**data.model_dump())
    db.add(q); db.commit(); db.refresh(q)
    return q


def get_questions(db: Session, topic_id: str | None = None, week: int | None = None,
                  semester: str | None = None, is_active: bool | None = None) -> list[Question]:
    query = db.query(Question)
    if topic_id: query = query.filter(Question.topic_id == topic_id)
    if week: query = query.filter(Question.week_number == week)
    if semester: query = query.filter(Question.semester == semester)
    if is_active is not None: query = query.filter(Question.is_active == is_active)
    return query.order_by(Question.created_at.desc()).all()


def get_question(db: Session, question_id: str) -> Question | None:
    return db.query(Question).filter(Question.id == question_id).first()


def update_question(db: Session, question_id: str, data: QuestionUpdate) -> Question | None:
    q = get_question(db, question_id)
    if not q: return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(q, field, value)
    db.commit(); db.refresh(q)
    return q


def save_evaluation_plan(db: Session, question_id: str, plan: dict) -> Question | None:
    q = get_question(db, question_id)
    if not q: return None
    q.evaluation_plan = plan
    db.commit(); db.refresh(q)
    return q


def delete_question(db: Session, question_id: str) -> bool:
    q = get_question(db, question_id)
    if not q: return False
    db.delete(q); db.commit()
    return True
