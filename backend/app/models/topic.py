"""Topic model."""

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Topic(TimestampMixin, Base):
    __tablename__ = "topics"
    __table_args__ = (
        UniqueConstraint("level_id", "name", name="uq_topic_level_name"),
    )

    level_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("levels.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    slug: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str] = mapped_column(Text, default="")

    level = relationship("Level", back_populates="topics")
    questions = relationship("Question", back_populates="topic", cascade="all, delete-orphan")
