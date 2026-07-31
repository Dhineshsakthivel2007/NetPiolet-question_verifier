"""Level model — organizational hierarchy for topics and questions."""

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Level(TimestampMixin, Base):
    __tablename__ = "levels"

    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    order: Mapped[int] = mapped_column(Integer, default=0)

    topics = relationship("Topic", back_populates="level", cascade="all, delete-orphan")
