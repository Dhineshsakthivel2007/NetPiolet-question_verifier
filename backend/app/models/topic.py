"""Topic model."""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Topic(TimestampMixin, Base):
    __tablename__ = "topics"

    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")

    questions = relationship("Question", back_populates="topic", cascade="all, delete-orphan")
