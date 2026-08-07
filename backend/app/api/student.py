"""Student Portal API — timed tests, hidden test cases, file upload/re-upload."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.evaluation import Evaluation
from app.models.level import Level  # noqa: F401 — needed for student.level relationship
from app.models.question import Question
from app.models.test_session import TestSession
from app.models.topic import Topic
from app.models.user import User, UserRole
from app.schemas import StudentQuestionResponse, StudentTestResultResponse, TestSessionResponse, UnlockSessionRequest
from app.services import evaluation_service

router = APIRouter(prefix="/student", tags=["Student Portal"])


def _parse_slot_times(slot_str: str, base_date: datetime) -> tuple[datetime | None, datetime | None]:
    """Parse slot string into start & end datetimes, supporting 12h AM/PM and 24h formats."""
    if not slot_str or not slot_str.strip():
        return None, None

    clean = slot_str.strip().lower()

    # Check for explicit date in slot string
    date_match = re.search(r'(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})', clean)
    target_date = base_date.date()
    if date_match:
        try:
            raw_d = date_match.group(1).replace('/', '-')
            parts = raw_d.split('-')
            if len(parts[0]) == 4:
                target_date = datetime(int(parts[0]), int(parts[1]), int(parts[2])).date()
            else:
                target_date = datetime(int(parts[2]), int(parts[1]), int(parts[0])).date()
        except Exception:
            pass

    match = re.search(r'(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*[-–—to]+\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?', clean)
    if not match:
        return None, None

    try:
        h1 = int(match.group(1))
        m1 = int(match.group(2) or 0)
        p1 = match.group(3)

        h2 = int(match.group(4))
        m2 = int(match.group(5) or 0)
        p2 = match.group(6)

        if p1 == 'pm' and h1 < 12:
            h1 += 12
        if p1 == 'am' and h1 == 12:
            h1 = 0

        if p2 == 'pm' and h2 < 12:
            h2 += 12
        if p2 == 'am' and h2 == 12:
            h2 = 0

        if p2 and not p1:
            if p2 == 'pm' and h1 < 12 and h1 < h2:
                h1 += 12
            if p2 == 'am' and h1 == 12:
                h1 = 0

        if h2 < h1 and h2 < 12:
            h2 += 12

        start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=h1, minute=m1, tzinfo=timezone.utc)
        end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=h2, minute=m2, tzinfo=timezone.utc)

        if end_dt <= start_dt:
            end_dt += timedelta(days=1)

        return start_dt, end_dt
    except Exception:
        return None, None


def _calculate_session_expiry(user: User | None, question: Question, now: datetime) -> datetime:
    """Calculate expiration time.
    If student has an assigned slot (e.g. '09:00 AM - 11:00 AM'), the session expires at the slot's end time.
    If student joins late, the wasted minutes are subtracted automatically!
    """
    if user and getattr(user, 'session_slot', None) and user.session_slot.strip():
        start_dt, end_dt = _parse_slot_times(user.session_slot, now)
        if end_dt:
            if end_dt > now:
                q_mins = question.time_limit_minutes if (question.time_limit_minutes and question.time_limit_minutes > 0) else 0
                if q_mins > 0:
                    q_expiry = now + timedelta(minutes=q_mins)
                    return min(q_expiry, end_dt)
                return end_dt
            else:
                return now

    q_mins = question.time_limit_minutes if (question.time_limit_minutes and question.time_limit_minutes > 0) else 60
    return now + timedelta(minutes=q_mins)


def _require_student(user: User = Depends(get_current_user)) -> User:
    """Allow students (and admins for testing)."""
    if user.role not in (UserRole.student, UserRole.admin):
        raise HTTPException(status_code=403, detail="Student access required")
    return user


def _make_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("/questions", response_model=list[StudentQuestionResponse])
def get_student_questions(db: Session = Depends(get_db), user: User = Depends(_require_student)):
    """Get active questions for student (filtered by assigned level if student, with fallback)."""
    query = db.query(Question).filter(Question.is_active == True)
    questions = []
    if user.role == UserRole.student and user.level_id:
        questions = query.filter(Question.level_id == user.level_id).order_by(Question.week_number.asc(), Question.created_at.asc()).all()
    if not questions:
        questions = query.order_by(Question.week_number.asc(), Question.created_at.asc()).all()

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
def start_test(question_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Start a new test session for a question."""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Return existing session if student already started this question
    existing = db.query(TestSession).filter(
        TestSession.student_id == user.id,
        TestSession.question_id == question_id,
    ).order_by(TestSession.created_at.desc()).first()

    now = datetime.now(timezone.utc)

    if existing:
        # Return existing session; preserve admin time extensions
        if not existing.is_completed:
            exp = _make_utc(existing.expires_at)
            if exp and now > exp:
                existing.is_completed = True
                db.commit()
                db.refresh(existing)
        return existing

    now = datetime.now(timezone.utc)
    expires = _calculate_session_expiry(user, question, now)

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
        exp = _make_utc(session.expires_at)
        if exp and now > exp:
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
    """Get test session status (with live slot timing sync)."""
    session = db.query(TestSession).filter(TestSession.id == session_id, TestSession.student_id == user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")

    # Dynamic slot timing sync & auto-expire check
    if not session.is_completed:
        now = datetime.now(timezone.utc)
        question = db.query(Question).filter(Question.id == session.question_id).first()
        if question:
            start_base = _make_utc(session.started_at) or now
            new_expiry = _calculate_session_expiry(user, question, start_base)
            if session.expires_at != new_expiry:
                session.expires_at = new_expiry
                db.commit()
                db.refresh(session)

        exp = _make_utc(session.expires_at)
        if exp and now > exp:
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
        if not question:
            raise HTTPException(404, "Question not found")
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
    session.last_violation = req.reason
    if req.warning_count >= 3:
        session.proctor_locked = True
        session.is_completed = True

    db.commit()
    db.refresh(session)

    from app.services.audit_service import log_activity
    log_activity(
        db,
        action="PROCTOR_VIOLATION",
        username=user.username,
        role=str(user.role.value if hasattr(user.role, 'value') else user.role),
        details=f"Violation: {req.reason} (Warning {req.warning_count}/3)"
    )

    return {
        "status": "ok",
        "warning_count": session.warning_count,
        "proctor_locked": session.proctor_locked,
        "last_violation": session.last_violation,
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
def unlock_test_session(
    session_id: str,
    payload: UnlockSessionRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Admin / Professor endpoint to unlock a student's locked test session.
    If extend_minutes > 0, time is extended. If extend_minutes == 0, session is unlocked with existing time preserved.
    """
    if user.role not in (UserRole.admin, UserRole.professor):
        raise HTTPException(status_code=403, detail="Admin or Professor access required")
    session = db.query(TestSession).filter(TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")

    extra_mins = payload.extend_minutes if payload else 0

    # Reset proctor warning & unlock
    session.proctor_locked = False
    session.warning_count = 0
    session.is_completed = False

    # Extend expiration time ONLY if extra_mins > 0
    if extra_mins > 0:
        now = datetime.now(timezone.utc)
        exp = _make_utc(session.expires_at)
        base_time = exp if (exp and exp > now) else now
        session.expires_at = base_time + timedelta(minutes=extra_mins)
    elif session.expires_at:
        now = datetime.now(timezone.utc)
        exp = _make_utc(session.expires_at)
        if exp and exp <= now:
            session.expires_at = now + timedelta(minutes=15)

    # Re-activate student account if deactivated
    student = db.query(User).filter(User.id == session.student_id).first()
    if student:
        student.is_active = True

    db.commit()
    db.refresh(session)
    return session


@router.post("/test/{session_id}/force-finish", response_model=TestSessionResponse)
def force_finish_test_session(session_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Admin / Professor endpoint to force finish and lock a student's test session."""
    from app.models.project import Project
    from app.models.evaluation import Evaluation
    from app.core import simulation_engine, evaluation_engine
    from app.core.plan_schema import EvaluationPlan

    if user.role not in (UserRole.admin, UserRole.professor):
        raise HTTPException(status_code=403, detail="Admin or Professor access required")
    session = db.query(TestSession).filter(TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")

    session.proctor_locked = True
    session.is_completed = True

    # If student has a project, evaluate it and save evaluation
    project = db.query(Project).filter(Project.student_id == session.student_id, Project.question_id == session.question_id).first()
    if project and project.state:
        question = db.query(Question).filter(Question.id == session.question_id).first()
        student = db.query(User).filter(User.id == session.student_id).first()
        if question and question.evaluation_plan and student:
            try:
                network = simulation_engine.build_network(project.state or {})
                plan = EvaluationPlan(**question.evaluation_plan)
                eval_result = evaluation_engine.evaluate(network, plan)
                now = datetime.now()

                existing_eval = db.query(Evaluation).filter(Evaluation.project_id == project.id).first()
                if existing_eval:
                    existing_eval.evaluation_plan = plan.model_dump()
                    existing_eval.results = eval_result.model_dump()
                    existing_eval.overall_score = eval_result.total_score
                    existing_eval.max_score = plan.total_points
                    existing_eval.passed = eval_result.passed
                    existing_eval.evaluated_at = now
                    existing_eval.roll_number = getattr(student, 'roll_number', None)
                    existing_eval.session_slot = getattr(student, 'session_slot', None)
                else:
                    evaluation = Evaluation(
                        question_id=project.question_id,
                        student_name=student.username,
                        student_id=student.id,
                        roll_number=getattr(student, 'roll_number', None),
                        session_slot=getattr(student, 'session_slot', None),
                        project_id=project.id,
                        evaluation_plan=plan.model_dump(),
                        results=eval_result.model_dump(),
                        overall_score=eval_result.total_score,
                        max_score=plan.total_points,
                        passed=eval_result.passed,
                        created_by=student.id,
                        evaluated_at=now,
                    )
                    db.add(evaluation)

                session.best_score = eval_result.total_score
                session.passed = eval_result.passed
                project.status = "submitted"
            except Exception as e:
                print("Error force evaluating project:", e)

    student = db.query(User).filter(User.id == session.student_id).first()
    sname = student.username if student else session.student_id
    if student and student.role == UserRole.student:
        student.is_active = False
        student.attendance = "Absent"
    db.commit()
    db.refresh(session)

    from app.services.audit_service import log_activity
    log_activity(db, "FORCE_FINISH", user.username, role=str(user.role.value if hasattr(user.role, 'value') else user.role), details=f"Force finished & locked test for {sname}")

    return session


@router.delete("/test/{session_id}", status_code=204)
def delete_test_session(session_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Admin / Professor endpoint to delete a student test session."""
    if user.role not in (UserRole.admin, UserRole.professor):
        raise HTTPException(status_code=403, detail="Admin or Professor access required")
    session = db.query(TestSession).filter(TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    student = db.query(User).filter(User.id == session.student_id).first()
    sname = student.username if student else session.student_id

    db.delete(session)
    db.commit()

    from app.services.audit_service import log_activity
    log_activity(db, "SESSION_DELETED", user.username, role=str(user.role.value if hasattr(user.role, 'value') else user.role), details=f"Deleted test session record for student {sname}")

    return None


class ExtendTestSessionRequest(BaseModel):
    extra_minutes: int = 15


@router.post("/test/{session_id}/extend-time", response_model=TestSessionResponse)
def extend_test_session_time(
    session_id: str,
    payload: ExtendTestSessionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Admin / Professor endpoint to extend a student's active or expired test time."""
    if user.role not in (UserRole.admin, UserRole.professor):
        raise HTTPException(status_code=403, detail="Admin or Professor access required")
    session = db.query(TestSession).filter(TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found")

    extra = payload.extra_minutes if payload.extra_minutes > 0 else 15

    # Re-enable session if completed or locked
    session.is_completed = False
    session.proctor_locked = False
    session.warning_count = 0

    now = datetime.now(timezone.utc)
    exp = _make_utc(session.expires_at)
    base_time = exp if (exp and exp > now) else now
    session.expires_at = base_time + timedelta(minutes=extra)

    # Re-activate student account if deactivated
    student = db.query(User).filter(User.id == session.student_id).first()
    sname = student.username if student else session.student_id
    if student and student.role == UserRole.student:
        student.is_active = True
        student.attendance = "Present"

    db.commit()
    db.refresh(session)

    from app.services.audit_service import log_activity
    log_activity(db, "EXTEND_TIME", user.username, role=str(user.role.value if hasattr(user.role, 'value') else user.role), details=f"Extended test time by {extra} mins for {sname}")

    return session


@router.get("/all-sessions")
def get_all_test_sessions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Admin / Professor list of all student test sessions including locked status."""
    from app.models.evaluation import Evaluation
    if user.role not in (UserRole.admin, UserRole.professor):
        raise HTTPException(status_code=403, detail="Admin or Professor access required")
    sessions = db.query(TestSession).order_by(TestSession.created_at.desc()).all()
    out = []
    now = datetime.now(timezone.utc)

    for s in sessions:
        student = db.query(User).filter(User.id == s.student_id).first()
        question = db.query(Question).filter(Question.id == s.question_id).first()

        # Check for expired test session and deactivate user + reset attendance
        if s.expires_at:
            exp = _make_utc(s.expires_at)
            if exp and exp <= now:
                s.is_completed = True
                if student and student.role == UserRole.student:
                    student.is_active = False
                    student.attendance = "Absent"
                db.commit()

        level_name = "All Levels"
        if student and student.level:
            level_name = student.level.name

        # Check Evaluation record as fallback/source of truth
        best_score = s.best_score
        passed = s.passed

        eval_rec = db.query(Evaluation).filter(
            Evaluation.student_id == s.student_id,
            Evaluation.question_id == s.question_id
        ).order_by(Evaluation.created_at.desc()).first()

        if eval_rec:
            best_score = eval_rec.overall_score
            passed = eval_rec.passed
            if s.best_score != best_score or s.passed != passed:
                s.best_score = best_score
                s.passed = passed
                db.commit()

        out.append({
            "id": s.id,
            "student_id": s.student_id,
            "roll_number": student.roll_number if (student and student.roll_number) else "—",
            "student_name": student.username if student else "Unknown",
            "student_email": student.email if student else "",
            "session_slot": student.session_slot if (student and student.session_slot) else "—",
            "level_name": level_name,
            "student_active": student.is_active if student else False,
            "question_id": s.question_id,
            "question_title": question.title if question else "Unknown",
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "is_completed": s.is_completed,
            "proctor_locked": s.proctor_locked,
            "warning_count": s.warning_count,
            "dual_login_flag": getattr(s, 'dual_login_flag', False) or False,
            "completion_reason": getattr(s, 'completion_reason', "") or "",
            "last_violation": getattr(s, 'last_violation', "") or "",
            "best_score": best_score,
            "passed": passed,
            "has_evaluation": eval_rec is not None or s.is_completed or s.best_score is not None,
        })
    return out
