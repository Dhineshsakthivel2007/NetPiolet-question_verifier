"""Student Portal API — timed tests, hidden test cases, file upload/re-upload."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.evaluation import Evaluation
from app.models.question import Question
from app.models.test_session import TestSession
from app.models.topic import Topic
from app.models.user import User, UserRole
from app.schemas import StudentQuestionResponse, StudentTestResultResponse, TestSessionResponse
from app.services import evaluation_service

router = APIRouter(prefix="/student", tags=["Student Portal"])


def _require_student(user: User = Depends(get_current_user)) -> User:
    """Allow students (and admins for testing)."""
    if user.role not in (UserRole.student, UserRole.admin):
        raise HTTPException(status_code=403, detail="Student access required")
    return user


@router.get("/questions", response_model=list[StudentQuestionResponse])
def get_student_questions(db: Session = Depends(get_db), user: User = Depends(_require_student)):
    """Get active questions in deterministic order (by week and creation time). Evaluation plans are hidden."""
    questions = db.query(Question).filter(Question.is_active == True).order_by(Question.week_number.asc(), Question.created_at.asc()).all()
    if not questions:
        questions = db.query(Question).all()

    result = []
    for q in questions:
        topic = db.query(Topic).filter(Topic.id == q.topic_id).first()
        result.append(StudentQuestionResponse(
            id=q.id,
            title=q.title,
            question_text=q.question_text,
            topic_name=topic.name if topic else "General",
            time_limit_minutes=q.time_limit_minutes,
            max_attempts=q.max_attempts,
            week_number=q.week_number,
        ))
    return result


@router.post("/test/{question_id}/start", response_model=TestSessionResponse)
def start_test(question_id: str, db: Session = Depends(get_db), user: User = Depends(_require_student)):
    """Start a new test session for a question."""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Check for existing active session
    existing = db.query(TestSession).filter(
        TestSession.student_id == user.id,
        TestSession.question_id == question_id,
        TestSession.is_completed == False,
    ).first()

    if existing:
        # Check if expired
        if existing.expires_at and datetime.now(timezone.utc) > existing.expires_at.replace(tzinfo=timezone.utc):
            existing.is_completed = True
            db.commit()
        else:
            return existing

    now = datetime.now(timezone.utc)
    expires = None
    if question.time_limit_minutes > 0:
        expires = now + timedelta(minutes=question.time_limit_minutes)

    session = TestSession(
        student_id=user.id,
        question_id=question_id,
        started_at=now,
        expires_at=expires,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/test/{session_id}/submit", response_model=StudentTestResultResponse)
def submit_test(
    session_id: str,
    pkt_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(_require_student),
):
    """Submit a .pkt file for evaluation. Returns pass/fail without detailed check info."""
    session = db.query(TestSession).filter(TestSession.id == session_id, TestSession.student_id == user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    if session.is_completed:
        raise HTTPException(status_code=400, detail="This test session is already completed")

    # Check time limit
    if session.expires_at:
        now = datetime.now(timezone.utc)
        exp = session.expires_at.replace(tzinfo=timezone.utc) if session.expires_at.tzinfo is None else session.expires_at
        if now > exp:
            session.is_completed = True
            db.commit()
            raise HTTPException(status_code=400, detail="Time is up! This test session has expired.")

    question = db.query(Question).filter(Question.id == session.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Check attempts
    if session.attempts_used >= question.max_attempts:
        session.is_completed = True
        db.commit()
        raise HTTPException(status_code=400, detail=f"Maximum attempts ({question.max_attempts}) reached")

    # Run evaluation
    session.attempts_used += 1
    attempt = session.attempts_used

    try:
        evaluation = evaluation_service.run_evaluation(
            db=db,
            question_id=session.question_id,
            pkt_file=pkt_file,
            student_name=user.username,
            student_id=user.id,
            created_by=user.id,
            attempt_number=attempt,
        )
    except Exception as e:
        db.commit()
        raise HTTPException(status_code=400, detail=f"Evaluation failed: {str(e)}")

    # Update session
    if evaluation.overall_score > session.best_score:
        session.best_score = evaluation.overall_score
    if evaluation.passed:
        session.passed = True
        session.is_completed = True

    db.commit()

    # Build hidden result (no detailed check info)
    results = evaluation.results or {}
    check_results = results.get("check_results", [])
    passed_count = sum(1 for c in check_results if c.get("passed"))
    attempts_remaining = question.max_attempts - session.attempts_used
    can_retry = not session.is_completed and attempts_remaining > 0

    msg = "🎉 All test cases passed!" if evaluation.passed else f"❌ {len(check_results) - passed_count} test case(s) failed. "
    if can_retry and not evaluation.passed:
        msg += f"You have {attempts_remaining} attempt(s) remaining."

    return StudentTestResultResponse(
        passed=evaluation.passed,
        score=evaluation.overall_score,
        max_score=results.get("max_score", 100),
        check_count=len(check_results),
        passed_count=passed_count,
        can_retry=can_retry,
        attempts_remaining=attempts_remaining,
        message=msg,
    )


@router.post("/test/{session_id}/clear")
def clear_submission(session_id: str, db: Session = Depends(get_db), user: User = Depends(_require_student)):
    """Clear current submission to allow re-upload."""
    session = db.query(TestSession).filter(TestSession.id == session_id, TestSession.student_id == user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    if session.is_completed:
        raise HTTPException(status_code=400, detail="Cannot clear a completed test")
    return {"message": "Ready for new upload", "attempts_used": session.attempts_used}


@router.get("/test/{session_id}", response_model=TestSessionResponse)
def get_session(session_id: str, db: Session = Depends(get_db), user: User = Depends(_require_student)):
    """Get test session status."""
    session = db.query(TestSession).filter(TestSession.id == session_id, TestSession.student_id == user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")

    # Auto-expire
    if session.expires_at and not session.is_completed:
        now = datetime.now(timezone.utc)
        exp = session.expires_at.replace(tzinfo=timezone.utc) if session.expires_at.tzinfo is None else session.expires_at
        if now > exp:
            session.is_completed = True
            db.commit()

    return session


@router.get("/results")
def get_student_results(db: Session = Depends(get_db), user: User = Depends(_require_student)):
    """Get student's own test results."""
    sessions = db.query(TestSession).filter(TestSession.student_id == user.id).order_by(TestSession.created_at.desc()).all()
    results = []
    for s in sessions:
        q = db.query(Question).filter(Question.id == s.question_id).first()
        results.append({
            "session_id": s.id,
            "question_title": q.title if q else "Unknown",
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "is_completed": s.is_completed,
            "attempts_used": s.attempts_used,
            "best_score": s.best_score,
            "passed": s.passed,
            "proctor_locked": s.proctor_locked,
            "warning_count": s.warning_count,
        })
    return results


class WarningReportRequest(BaseModel):
    warning_count: int
    reason: str = "Exited full screen"


@router.post("/test/{question_id}/report-warning")
def report_warning(
    question_id: str,
    req: WarningReportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Report a proctoring warning for a student test session."""
    session = db.query(TestSession).filter(
        TestSession.student_id == user.id,
        TestSession.question_id == question_id,
        TestSession.is_completed == False,
    ).first()

    if not session:
        session = db.query(TestSession).filter(
            TestSession.student_id == user.id,
            TestSession.question_id == question_id,
        ).order_by(TestSession.created_at.desc()).first()

    if not session:
        now = datetime.now(timezone.utc)
        question = db.query(Question).filter(Question.id == question_id).first()
        time_limit = question.time_limit_minutes if question else 60
        expires = now + timedelta(minutes=time_limit) if time_limit > 0 else None
        session = TestSession(
            student_id=user.id,
            question_id=question_id,
            started_at=now,
            expires_at=expires,
        )
        db.add(session)

    session.warning_count = req.warning_count
    if req.warning_count >= 3:
        session.proctor_locked = True
        session.is_completed = True

    db.commit()
    db.refresh(session)
    return {
        "status": "ok",
        "warning_count": session.warning_count,
        "proctor_locked": session.proctor_locked,
        "session_id": session.id,
    }


@router.post("/test/{session_id}/lock", response_model=TestSessionResponse)
def lock_test_session(session_id: str, db: Session = Depends(get_db), user: User = Depends(_require_student)):
    """Lock a test session due to proctoring violation (3/3 warnings)."""
    session = db.query(TestSession).filter(TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    session.proctor_locked = True
    session.warning_count = 3
    db.commit()
    db.refresh(session)
    return session


@router.post("/test/{session_id}/unlock", response_model=TestSessionResponse)
def unlock_test_session(session_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Admin / Professor endpoint to unlock a proctor-terminated test session."""
    if user.role not in (UserRole.admin, UserRole.professor):
        raise HTTPException(status_code=403, detail="Admin or Professor access required")
    session = db.query(TestSession).filter(TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")

    question = db.query(Question).filter(Question.id == session.question_id).first()
    time_limit = question.time_limit_minutes if question else 60

    # Reset proctor warning & unlock
    session.proctor_locked = False
    session.warning_count = 0
    session.is_completed = False

    # Extend expiration time so student can complete lab in the same time frame
    now = datetime.now(timezone.utc)
    session.expires_at = now + timedelta(minutes=max(time_limit, 30))
    db.commit()
    db.refresh(session)
    return session


@router.get("/all-sessions")
def get_all_test_sessions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Admin / Professor list of all student test sessions including locked status."""
    if user.role not in (UserRole.admin, UserRole.professor):
        raise HTTPException(status_code=403, detail="Admin or Professor access required")
    sessions = db.query(TestSession).order_by(TestSession.created_at.desc()).all()
    out = []
    for s in sessions:
        student = db.query(User).filter(User.id == s.student_id).first()
        question = db.query(Question).filter(Question.id == s.question_id).first()
        out.append({
            "id": s.id,
            "student_id": s.student_id,
            "student_name": student.username if student else "Unknown",
            "student_email": student.email if student else "",
            "question_id": s.question_id,
            "question_title": question.title if question else "Unknown",
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "is_completed": s.is_completed,
            "proctor_locked": s.proctor_locked,
            "warning_count": s.warning_count,
            "best_score": s.best_score,
            "passed": s.passed,
        })
    return out
