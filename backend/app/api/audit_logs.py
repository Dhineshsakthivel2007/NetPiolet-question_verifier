"""Audit log API endpoints & Resume Analytics Exporter."""

from __future__ import annotations
import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import get_db
from app.dependencies import require_admin_or_professor
from app.models.user import User, UserRole
from app.models.evaluation import Evaluation
from app.models.question import Question
from app.models.topic import Topic
from app.models.test_session import TestSession
from app.services import audit_service

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

@router.get("")
def list_audit_logs(
    limit: int = Query(100, ge=1, le=1000),
    action: str | None = None,
    username: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_professor),
):
    """Retrieve audit activity logs (Admin / Professor only)."""
    logs = audit_service.get_audit_logs(db, limit=limit, action=action, username=username)
    return [
        {
            "id": log.id,
            "username": log.username,
            "role": log.role,
            "action": log.action,
            "details": log.details,
            "ip_address": log.ip_address,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]

@router.get("/export-csv")
def export_system_analytics_csv(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_professor),
):
    """Export complete System Performance & User Activity CSV report for resume/portfolio metrics."""
    total_users = db.query(User).count()
    student_count = db.query(User).filter(User.role == UserRole.student).count()
    prof_count = db.query(User).filter(User.role == UserRole.professor).count()
    admin_count = db.query(User).filter(User.role == UserRole.admin).count()
    
    total_evals = db.query(Evaluation).count()
    passed_evals = db.query(Evaluation).filter(Evaluation.passed == True).count()
    pass_rate = round((passed_evals / total_evals * 100), 1) if total_evals > 0 else 0.0
    avg_score = db.query(func.avg(Evaluation.overall_score)).scalar() or 0.0
    
    total_topics = db.query(Topic).count()
    total_questions = db.query(Question).count()
    total_sessions = db.query(TestSession).count()

    output = io.StringIO()
    writer = csv.writer(output)

    # 1. System Metrics Summary Header
    writer.writerow(["=========================================================================="])
    writer.writerow(["NetPiolet — AI Lab Evaluation & Exam Proctoring Platform Analytics Report"])
    writer.writerow([f"Report Generated At: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}"])
    writer.writerow(["=========================================================================="])
    writer.writerow([])

    writer.writerow(["METRIC CATEGORY", "METRIC NAME", "VALUE", "DESCRIPTION"])
    writer.writerow(["User Management", "Total Registered Users", total_users, "All accounts registered in NetPiolet"])
    writer.writerow(["User Management", "Student Accounts", student_count, "Active candidate test-takers"])
    writer.writerow(["User Management", "Professors / Instructors", prof_count, "Lab administrators"])
    writer.writerow(["User Management", "System Admins", admin_count, "Platform superusers"])
    writer.writerow(["Lab Evaluations", "Total Evaluations Executed", total_evals, "Automated Cisco lab grading sessions"])
    writer.writerow(["Lab Evaluations", "Candidate Pass Rate (%)", f"{pass_rate}%", "Percentage of labs meeting pass threshold"])
    writer.writerow(["Lab Evaluations", "Average Lab Score (%)", f"{avg_score:.1f}%", "Overall mean candidate evaluation score"])
    writer.writerow(["Test Proctoring", "Total Exam Sessions Tracked", total_sessions, "Monitored exam attempts"])
    writer.writerow(["Curriculum", "Active Networking Topics", total_topics, "Configured topic modules"])
    writer.writerow(["Curriculum", "Lab Questions", total_questions, "Automated assessment questions"])
    writer.writerow([])
    writer.writerow([])

    # 2. Detailed Audit Log History
    writer.writerow(["=========================================================================="])
    writer.writerow(["AUDIT LOGS & USER ACTIVITY HISTORY"])
    writer.writerow(["=========================================================================="])
    writer.writerow(["LOG ID", "TIMESTAMP", "USERNAME", "ROLE", "ACTION EVENT", "DETAILS / ACTIVITY DESCRIPTION", "IP ADDRESS"])

    logs = audit_service.get_audit_logs(db, limit=1000)
    for log in logs:
        writer.writerow([
            log.id,
            log.created_at.strftime('%Y-%m-%d %H:%M:%S') if log.created_at else "",
            log.username,
            log.role,
            log.action,
            log.details or "",
            log.ip_address or "127.0.0.1"
        ])

    output.seek(0)
    filename = f"NetPiolet_System_Analytics_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8')),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
