"""Main API router — includes all sub-routers."""

from fastapi import APIRouter

from app.api import auth, levels, topics, questions, evaluations, reports, student, projects, audit_logs

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(levels.router)
api_router.include_router(topics.router)
api_router.include_router(questions.router)
api_router.include_router(evaluations.router)
api_router.include_router(reports.router)
api_router.include_router(student.router)
api_router.include_router(projects.router)
api_router.include_router(audit_logs.router)
