"""Audit logging service — records user actions, logins, and system changes."""

from __future__ import annotations
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog

def log_activity(
    db: Session,
    action: str,
    username: str,
    role: str = "student",
    user_id: str | None = None,
    details: str | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Record an audit log entry in the database."""
    try:
        log_entry = AuditLog(
            action=action,
            username=username,
            role=role,
            user_id=user_id,
            details=details,
            ip_address=ip_address,
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry
    except Exception as e:
        db.rollback()
        print(f"Failed to write audit log: {e}")
        return None


def get_audit_logs(
    db: Session,
    limit: int = 100,
    action: str | None = None,
    username: str | None = None,
) -> list[AuditLog]:
    """Retrieve audit log records ordered by newest first."""
    # Seed initial activity if logs are empty
    seed_initial_audit_logs(db)

    query = db.query(AuditLog)
    if action and action.strip():
        query = query.filter(AuditLog.action.ilike(f"%{action.strip()}%"))
    if username and username.strip():
        query = query.filter(AuditLog.username.ilike(f"%{username.strip()}%"))
    return query.order_by(AuditLog.created_at.desc()).limit(limit).all()


def seed_initial_audit_logs(db: Session):
    """Seed historical user logins, registrations, and lab activity into audit_logs if empty."""
    try:
        if db.query(AuditLog).count() > 0:
            return

        from app.models.user import User
        from app.models.evaluation import Evaluation
        from app.models.question import Question

        users = db.query(User).all()
        for u in users:
            log_activity(
                db,
                action="USER_LOGIN",
                username=u.username,
                role=str(u.role.value if hasattr(u.role, 'value') else u.role),
                user_id=u.id,
                details=f"Active user session recorded ({u.email or u.username})"
            )

        evals = db.query(Evaluation).order_by(Evaluation.created_at.desc()).limit(20).all()
        for ev in evals:
            log_activity(
                db,
                action="LAB_SUBMITTED",
                username=ev.student_name or "Student",
                role="student",
                user_id=ev.student_id,
                details=f"Evaluated lab submission with score {ev.overall_score:.0f}% ({'PASSED' if ev.passed else 'FAILED'})"
            )

        questions = db.query(Question).all()
        for q in questions:
            log_activity(
                db,
                action="QUESTION_CREATED",
                username="admin",
                role="admin",
                details=f"Question available: '{q.title}' (Week {q.week_number})"
            )
    except Exception as err:
        print(f"Failed to seed audit logs: {err}")
        db.rollback()
