"""Report model."""

from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Report(TimestampMixin, Base):
    __tablename__ = "reports"

    evaluation_id: Mapped[str] = mapped_column(String(36), ForeignKey("evaluations.id"), unique=True)
    pdf_path: Mapped[str] = mapped_column(String(500), default="")
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    evaluation = relationship("Evaluation", back_populates="report")
