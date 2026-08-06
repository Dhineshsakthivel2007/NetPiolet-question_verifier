"""Audit log model for recording all system activities and user actions."""

from __future__ import annotations
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"

    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    username: Mapped[str] = mapped_column(String(100), default="System", index=True)
    role: Mapped[str] = mapped_column(String(50), default="student")
    action: Mapped[str] = mapped_column(String(100), index=True)  # e.g. USER_LOGIN, QUESTION_DELETED, LAB_SUBMITTED
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    user = relationship("User")
