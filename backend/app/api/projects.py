from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
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

@router.post("/{project_id}/evaluate")
@router.post("/{project_id}/submit")
def evaluate_project(project_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Evaluate project state for grading preview WITHOUT saving an Evaluation record to DB."""
    project = db.query(Project).filter(Project.id == project_id, Project.student_id == user.id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    question = db.query(Question).filter(Question.id == project.question_id).first()
    if not question or not question.evaluation_plan:
        raise HTTPException(400, "Question has no evaluation plan")

    network = simulation_engine.build_network(project.state or {})
    plan = EvaluationPlan(**question.evaluation_plan)
    eval_result = evaluation_engine.evaluate(network, plan)

    return {
        "project": _project_to_dict(project),
        "evaluation": {
            "id": "preview",
            "overall_score": eval_result.total_score,
            "max_score": plan.total_points,
            "passed": eval_result.passed,
            "results": eval_result.model_dump(),
            "evaluated_at": None,
        }
    }


@router.post("/{project_id}/finish")
def finish_project(project_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Finalize test submission: Evaluate project state and save/update a single Evaluation record in DB."""
    from datetime import datetime
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

    now = datetime.now()

    # Upsert single evaluation record per project
    existing_eval = db.query(Evaluation).filter(Evaluation.project_id == project.id).first()

    if existing_eval:
        existing_eval.evaluation_plan = plan.model_dump()
        existing_eval.results = eval_result.model_dump()
        existing_eval.overall_score = eval_result.total_score
        existing_eval.max_score = plan.total_points
        existing_eval.passed = eval_result.passed
        existing_eval.evaluated_at = now
        evaluation = existing_eval
    else:
        evaluation = Evaluation(
            question_id=project.question_id,
            student_name=user.username,
            student_id=user.id,
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

