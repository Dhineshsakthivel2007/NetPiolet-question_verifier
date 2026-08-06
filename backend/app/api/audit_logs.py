"""Audit log API endpoints."""

from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies import require_admin_or_professor
from app.models.user import User
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
