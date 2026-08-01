"""Evaluation model."""

from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Evaluation(TimestampMixin, Base):
    __tablename__ = "evaluations"

    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id"), index=True)
    student_name: Mapped[str] = mapped_column(String(255), default="")
    student_id: Mapped[str] = mapped_column(String(100), default="", index=True)
    pkt_file_path: Mapped[str] = mapped_column(String(500), default="")
    xml_file_path: Mapped[str] = mapped_column(String(500), default="")
    evaluation_plan: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    results: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    overall_score: Mapped[float] = mapped_column(Float, default=0.0)
    max_score: Mapped[float] = mapped_column(Float, default=100.0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    roll_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    session_slot: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)
    project_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True, index=True)

    question = relationship("Question", back_populates="evaluations")
    report = relationship("Report", back_populates="evaluation", uselist=False, cascade="all, delete-orphan")
    project = relationship("Project")
