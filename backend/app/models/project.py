import enum
from sqlalchemy import Enum, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

class ProjectStatus(enum.Enum):
    draft = "draft"
    submitted = "submitted"

class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id"), index=True)
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    
    question = relationship("Question")
    student = relationship("User")
