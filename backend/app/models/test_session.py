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
    proctor_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    warning_count: Mapped[int] = mapped_column(Integer, default=0)
    dual_login_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    completion_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_violation: Mapped[str | None] = mapped_column(String(255), nullable=True)

    question = relationship("Question")
