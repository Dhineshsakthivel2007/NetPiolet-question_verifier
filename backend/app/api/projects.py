from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.project import Project
from app.models.question import Question
from app.models.evaluation import Evaluation
from app.core import simulation_engine, evaluation_engine
from app.core.plan_schema import EvaluationPlan

router = APIRouter(prefix="/projects", tags=["Projects"])


class CreateProjectRequest(BaseModel):
    question_id: str


def _project_to_dict(project):
    return {
        "id": project.id,
        "question_id": project.question_id,
        "student_id": project.student_id,
        "state": project.state,
        "status": project.status,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


@router.post("")
def create_project(data: CreateProjectRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    question = db.query(Question).filter(Question.id == data.question_id).first()
    if not question:
        raise HTTPException(404, "Question not found")

    existing = db.query(Project).filter(
        Project.question_id == data.question_id,
        Project.student_id == user.id,
    ).order_by(Project.created_at.desc()).first()

    if existing:
        return _project_to_dict(existing)

    project = Project(
        question_id=data.question_id,
        student_id=user.id,
        state=question.starter_state or {"nodes": [], "edges": []}
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_to_dict(project)

@router.get("")
def list_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    projects = db.query(Project).filter(Project.student_id == user.id).all()
    return [_project_to_dict(p) for p in projects]

@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    return _project_to_dict(project)


class SaveProjectRequest(BaseModel):
    state: dict


@router.patch("/{project_id}")
def update_project(project_id: str, data: SaveProjectRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.student_id == user.id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    project.state = data.state
    db.commit()
    db.refresh(project)
    return _project_to_dict(project)

def _upsert_evaluation_and_sync_session(db: Session, project: Project, user: User, plan: EvaluationPlan, eval_result):
    """Helper to upsert Evaluation record and update TestSession so Results & Session Management are instantly synced."""
    from datetime import datetime
    from app.models.test_session import TestSession
    now = datetime.now()

    # Find existing evaluation or create new
    existing_eval = db.query(Evaluation).filter(
        (Evaluation.project_id == project.id) |
        ((Evaluation.student_id == user.id) & (Evaluation.question_id == project.question_id))
    ).order_by(Evaluation.created_at.desc()).first()

    if existing_eval:
        existing_eval.evaluation_plan = plan.model_dump()
        existing_eval.results = eval_result.model_dump()
        existing_eval.overall_score = eval_result.total_score
        existing_eval.max_score = plan.total_points
        existing_eval.passed = eval_result.passed
        existing_eval.evaluated_at = now
        existing_eval.roll_number = getattr(user, 'roll_number', None)
        existing_eval.session_slot = getattr(user, 'session_slot', None)
        evaluation = existing_eval
    else:
        evaluation = Evaluation(
            question_id=project.question_id,
            student_name=user.username,
            student_id=user.id,
            roll_number=getattr(user, 'roll_number', None),
            session_slot=getattr(user, 'session_slot', None),
            project_id=project.id,
            evaluation_plan=plan.model_dump(),
            results=eval_result.model_dump(),
            overall_score=eval_result.total_score,
            max_score=plan.total_points,
            passed=eval_result.passed,
            created_by=user.id,
            evaluated_at=now,
        )
        db.add(evaluation)

    # Sync TestSession for live Session Management monitoring
    session = db.query(TestSession).filter(
        TestSession.student_id == user.id,
        TestSession.question_id == project.question_id
    ).first()

    if session:
        session.attempts_used = (session.attempts_used or 0) + 1
        current_best = session.best_score or 0.0
        session.best_score = max(current_best, eval_result.total_score)
        if eval_result.passed:
            session.passed = True

    return evaluation, session


@router.post("/{project_id}/evaluate")
@router.post("/{project_id}/submit")
def evaluate_project(project_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Evaluate project state and save Evaluation record so score appears in Results & Session Management."""
    project = db.query(Project).filter(Project.id == project_id, Project.student_id == user.id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    question = db.query(Question).filter(Question.id == project.question_id).first()
    if not question or not question.evaluation_plan:
        raise HTTPException(400, "Question has no evaluation plan")

    network = simulation_engine.build_network(project.state or {})
    plan = EvaluationPlan(**question.evaluation_plan)
    eval_result = evaluation_engine.evaluate(network, plan)

    evaluation, _ = _upsert_evaluation_and_sync_session(db, project, user, plan, eval_result)
    db.commit()
    db.refresh(evaluation)

    return {
        "project": _project_to_dict(project),
        "evaluation": {
            "id": evaluation.id,
            "overall_score": evaluation.overall_score,
            "max_score": evaluation.max_score,
            "passed": evaluation.passed,
            "results": evaluation.results,
            "evaluated_at": evaluation.evaluated_at.isoformat() if evaluation.evaluated_at else None,
        }
    }


@router.post("/{project_id}/finish")
def finish_project(project_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Finalize test submission: Evaluate project state, complete session, and automatically deactivate student account."""
    project = db.query(Project).filter(Project.id == project_id, Project.student_id == user.id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    project.status = "submitted"

    question = db.query(Question).filter(Question.id == project.question_id).first()
    if not question or not question.evaluation_plan:
        raise HTTPException(400, "Question has no evaluation plan")

    network = simulation_engine.build_network(project.state or {})
    plan = EvaluationPlan(**question.evaluation_plan)
    eval_result = evaluation_engine.evaluate(network, plan)

    evaluation, session = _upsert_evaluation_and_sync_session(db, project, user, plan, eval_result)

    if session:
        session.is_completed = True
        session.best_score = max(session.best_score or 0.0, eval_result.total_score)
        if eval_result.passed:
            session.passed = True

    # Automatically deactivate non-admin student user account after finishing test
    student_user = db.query(User).filter(User.id == user.id).first()
    if student_user and "admin" not in str(student_user.role).lower():
        student_user.is_active = False
        student_user.attendance = "Absent"

    db.commit()
    db.refresh(evaluation)

    return {
        "project": _project_to_dict(project),
        "evaluation": {
            "id": evaluation.id,
            "overall_score": evaluation.overall_score,
            "max_score": evaluation.max_score,
            "passed": evaluation.passed,
            "results": evaluation.results,
            "evaluated_at": evaluation.evaluated_at.isoformat() if evaluation.evaluated_at else None,
        },
        "deactivated": user.role == UserRole.student
    }

