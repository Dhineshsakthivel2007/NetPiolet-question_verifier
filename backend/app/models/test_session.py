"""Test Session model — tracks student test attempts with time limits."""

from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TestSession(TimestampMixin, Base):
    __tablename__ = "test_sessions"

    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts_used: Mapped[int] = mapped_column(Integer, default=0)
    best_score: Mapped[float] = mapped_column(Float, default=0.0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)

    question = relationship("Question")
