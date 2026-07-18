"""Question API routes."""


from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas import QuestionCreate, QuestionUpdate, QuestionResponse, GeneratePlanRequest, PlanUpdateRequest
from app.services import question_service

router = APIRouter(prefix="/questions", tags=["Questions"])


@router.get("", response_model=list[QuestionResponse])
def list_questions(
    topic_id: str | None = None, week: int | None = None,
    semester: str | None = None, is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    return question_service.get_questions(db, topic_id, week, semester, is_active)


@router.post("", response_model=QuestionResponse, status_code=201)
def create_question(data: QuestionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return question_service.create_question(db, data)


@router.get("/{question_id}", response_model=QuestionResponse)
def get_question(question_id: str, db: Session = Depends(get_db)):
    q = question_service.get_question(db, question_id)
    if not q: raise HTTPException(404, "Question not found")
    return q


@router.put("/{question_id}", response_model=QuestionResponse)
def update_question(question_id: str, data: QuestionUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = question_service.update_question(db, question_id, data)
    if not q: raise HTTPException(404, "Question not found")
    return q


@router.post("/{question_id}/generate-plan", response_model=QuestionResponse)
def generate_plan(question_id: str, body: GeneratePlanRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Use AI to generate an evaluation plan from the question text."""
    from app.core.ai_extractor import generate_evaluation_plan

    q = question_service.get_question(db, question_id)
    if not q: raise HTTPException(404, "Question not found")

    topic = body.topic or (q.topic.name if q.topic else "General")
    try:
        plan = generate_evaluation_plan(q.question_text, topic)
    except Exception as e:
        raise HTTPException(500, f"AI plan generation failed: {str(e)}")

    q = question_service.save_evaluation_plan(db, question_id, plan.model_dump())
    return q


@router.put("/{question_id}/plan", response_model=QuestionResponse)
def update_plan(question_id: str, body: PlanUpdateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Professor manually edits the evaluation plan."""
    # Validate plan structure before saving
    from app.core.plan_schema import EvaluationPlan
    try:
        EvaluationPlan.model_validate(body.evaluation_plan)
    except Exception as e:
        raise HTTPException(400, f"Invalid plan format: {e}")

    q = question_service.save_evaluation_plan(db, question_id, body.evaluation_plan)
    if not q: raise HTTPException(404, "Question not found")
    return q


@router.delete("/{question_id}", status_code=204)
def delete_question(question_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not question_service.delete_question(db, question_id): raise HTTPException(404, "Question not found")
