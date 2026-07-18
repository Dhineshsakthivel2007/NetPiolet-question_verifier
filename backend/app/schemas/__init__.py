"""Pydantic schemas for all API request/response models."""

from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field

# --- User ---
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6)
    role: str = "student"

class UserLogin(BaseModel):
    username: str
    password: str

class GoogleLoginRequest(BaseModel):
    id_token: str

class UserResponse(BaseModel):
    id: str; username: str; email: str; role: str; is_active: bool
    avatar_url: str = ""; created_at: datetime
    model_config = {"from_attributes": True}

class TokenResponse(BaseModel):
    access_token: str; token_type: str = "bearer"
    role: str = ""; username: str = ""

class UserApproveRequest(BaseModel):
    is_active: bool

class UserRoleRequest(BaseModel):
    role: str

# --- Topic ---
class TopicCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""

class TopicUpdate(BaseModel):
    name: str | None = None; description: str | None = None

class TopicResponse(BaseModel):
    id: str; name: str; slug: str; description: str; created_at: datetime
    model_config = {"from_attributes": True}

# --- Question ---
class QuestionCreate(BaseModel):
    topic_id: str
    title: str = Field(..., min_length=1, max_length=500)
    question_text: str = Field(..., min_length=1)
    week_number: int = 1
    semester: str = ""
    academic_year: str = ""
    time_limit_minutes: int = 0
    max_attempts: int = 3

class QuestionUpdate(BaseModel):
    title: str | None = None; question_text: str | None = None
    week_number: int | None = None; semester: str | None = None
    academic_year: str | None = None; is_active: bool | None = None
    time_limit_minutes: int | None = None; max_attempts: int | None = None

class QuestionResponse(BaseModel):
    id: str; topic_id: str; title: str; question_text: str
    week_number: int; semester: str; academic_year: str
    evaluation_plan: dict | None = None; is_active: bool
    created_by: str | None = None
    time_limit_minutes: int = 0; max_attempts: int = 3
    created_at: datetime
    model_config = {"from_attributes": True}

class GeneratePlanRequest(BaseModel):
    topic: str = ""

class PlanUpdateRequest(BaseModel):
    evaluation_plan: dict

# --- Evaluation ---
class EvaluationResponse(BaseModel):
    id: str; question_id: str; student_name: str; student_id: str
    pkt_file_path: str; xml_file_path: str
    evaluation_plan: dict | None = None; results: dict | None = None
    overall_score: float; passed: bool; evaluated_at: datetime
    created_by: str | None = None; attempt_number: int = 1
    created_at: datetime
    model_config = {"from_attributes": True}

class EvaluationListResponse(BaseModel):
    items: list[EvaluationResponse]; total: int

# --- Report ---
class ReportResponse(BaseModel):
    id: str; evaluation_id: str; pdf_path: str; generated_at: datetime
    model_config = {"from_attributes": True}

# --- Student Portal ---
class StudentQuestionResponse(BaseModel):
    """Question view for students — hides evaluation_plan (hidden test cases)."""
    id: str; title: str; question_text: str
    topic_name: str = ""; time_limit_minutes: int = 0
    max_attempts: int = 3; week_number: int = 1

class TestSessionResponse(BaseModel):
    id: str; student_id: str; question_id: str
    started_at: datetime; expires_at: datetime | None = None
    is_completed: bool; attempts_used: int
    best_score: float; passed: bool; created_at: datetime
    model_config = {"from_attributes": True}

class StudentTestResultResponse(BaseModel):
    """Result view for students — hides detailed check info."""
    passed: bool; score: float; max_score: float
    check_count: int; passed_count: int
    can_retry: bool; attempts_remaining: int
    message: str = ""
