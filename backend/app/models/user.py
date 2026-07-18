"""User model."""

import enum
from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UserRole(str, enum.Enum):
    admin = "admin"
    professor = "professor"
    student = "student"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), default="")
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.student)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    avatar_url: Mapped[str] = mapped_column(String(500), default="")
