"""Evaluation service — orchestrates the full evaluation pipeline."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path


from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.core import converter, evaluation_engine, xml_parser
from app.core.plan_schema import EvaluationPlan
from app.models.evaluation import Evaluation
from app.models.question import Question


def run_evaluation(
    db: Session,
    question_id: str,
    pkt_file: UploadFile,
    student_name: str = "",
    student_id: str = "",
    created_by: str | None = None,
    attempt_number: int = 1,
) -> Evaluation:
    """Execute the full evaluation pipeline.

    1. Save uploaded .pkt file
    2. Convert to XML via pka2xml
    3. Parse XML into ParsedNetwork
    4. Load evaluation plan from question
    5. Run evaluation engine
    6. Save results to database
    """
    # Load question and its plan
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise ValueError(f"Question {question_id} not found")
    if not question.evaluation_plan:
        raise ValueError("Question has no evaluation plan. Generate one first.")

    # Save .pkt file
    pkt_dir = settings.upload_dir / "pkt"
    pkt_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex[:8]}_{pkt_file.filename}"
    pkt_path = pkt_dir / filename
    with open(pkt_path, "wb") as f:
        shutil.copyfileobj(pkt_file.file, f)

    # Convert to XML
    try:
        xml_path = converter.convert_pkt_to_xml(pkt_path)
    except Exception as e:
        # If conversion fails, try treating uploaded file as XML directly
        if pkt_file.filename and pkt_file.filename.endswith(".xml"):
            xml_path = pkt_path
        else:
            raise ValueError(f"PKT to XML conversion failed: {e}") from e

    # Parse XML
    network = xml_parser.parse_xml_file(xml_path)

    # Load evaluation plan
    try:
        plan = EvaluationPlan.model_validate(question.evaluation_plan)
    except Exception as e:
        raise ValueError(
            f"Invalid evaluation plan format on this question. "
            f"Please re-generate or fix the plan. Error: {e}"
        ) from e

    # Run evaluation
    result = evaluation_engine.evaluate(network, plan)

    # Save evaluation record
    evaluation = Evaluation(
        question_id=question_id,
        student_name=student_name,
        student_id=student_id,
        pkt_file_path=str(pkt_path),
        xml_file_path=str(xml_path),
        evaluation_plan=question.evaluation_plan,
        results=result.model_dump(),
        overall_score=result.total_score,
        passed=result.passed,
        created_by=created_by,
        attempt_number=attempt_number,
    )
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)

    return evaluation


def get_evaluations(
    db: Session,
    question_id: str | None = None,
    student_id: str | None = None,
    passed: bool | None = None,
    created_by: str | None = None,
    latest_only: bool = False,
) -> list[Evaluation]:
    query = db.query(Evaluation)
    if question_id:
        query = query.filter(Evaluation.question_id == question_id)
    if student_id:
        query = query.filter(Evaluation.student_id == student_id)
    if created_by:
        query = query.filter(Evaluation.created_by == created_by)

    # Filter passed in SQL only if not deduplicating, else filter post-deduplication
    if not latest_only and passed is not None:
        query = query.filter(Evaluation.passed == passed)

    from app.models.user import User
    evals = query.order_by(Evaluation.created_at.desc()).all()

    for ev in evals:
        if not getattr(ev, 'roll_number', None) or not getattr(ev, 'session_slot', None):
            usr = db.query(User).filter(User.id == ev.student_id).first()
            if usr:
                if not getattr(ev, 'roll_number', None):
                    ev.roll_number = usr.roll_number
                if not getattr(ev, 'session_slot', None):
                    ev.session_slot = usr.session_slot

    if latest_only:
        seen = set()
        deduped = []
        for ev in evals:
            slot_key = getattr(ev, 'session_slot', None) or "no_slot"
            key = (ev.student_id or ev.student_name or ev.created_by or "anon", ev.question_id, slot_key)
            if key not in seen:
                seen.add(key)
                deduped.append(ev)
        if passed is not None:
            deduped = [ev for ev in deduped if ev.passed == passed]
        return deduped

    return evals


def get_evaluation(db: Session, evaluation_id: str) -> Evaluation | None:
    return db.query(Evaluation).filter(Evaluation.id == evaluation_id).first()
