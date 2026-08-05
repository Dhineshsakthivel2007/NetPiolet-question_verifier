"""User model."""

import enum
from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class UserRole(str, enum.Enum):
    admin = "admin"
    professor = "professor"
    student = "student"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(100), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), default="")
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.student)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    google_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str] = mapped_column(String(500), default="")
    
    # Student Slot, Level & Attendance details
    roll_number: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    session_slot: Mapped[str | None] = mapped_column(String(100), nullable=True)
    level_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("levels.id"), nullable=True, index=True)
    attendance: Mapped[str] = mapped_column(String(20), default="Absent")
    current_session_token: Mapped[str | None] = mapped_column(String(500), nullable=True)

    level = relationship("Level", foreign_keys=[level_id])
