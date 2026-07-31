"""Question model."""

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Question(TimestampMixin, Base):
    __tablename__ = "questions"

    level_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("levels.id"), nullable=True, index=True)
    topic_id: Mapped[str] = mapped_column(String(36), ForeignKey("topics.id"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    question_text: Mapped[str] = mapped_column(Text)
    week_number: Mapped[int] = mapped_column(Integer, default=1)
    semester: Mapped[str] = mapped_column(String(50), default="")
    academic_year: Mapped[str] = mapped_column(String(20), default="")
    evaluation_plan: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    starter_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    time_limit_minutes: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)

    topic = relationship("Topic", back_populates="questions")
    evaluations = relationship("Evaluation", back_populates="question", cascade="all, delete-orphan")
