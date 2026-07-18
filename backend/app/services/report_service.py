"""Report service — manage and generate evaluation reports."""

from __future__ import annotations

from datetime import datetime, timezone


from sqlalchemy.orm import Session

from app.models.evaluation import Evaluation
from app.models.report import Report
from app.services import pdf_service


def get_report(db: Session, evaluation_id: str) -> Report | None:
    return db.query(Report).filter(Report.evaluation_id == evaluation_id).first()


def generate_report(db: Session, evaluation_id: str) -> Report:
    """Generate a PDF report for an evaluation."""
    evaluation = db.query(Evaluation).filter(Evaluation.id == evaluation_id).first()
    if not evaluation:
        raise ValueError(f"Evaluation {evaluation_id} not found")

    # Check if report already exists
    existing = get_report(db, evaluation_id)
    if existing:
        return existing

    # Get question info
    question = evaluation.question
    question_title = question.title if question else "Unknown"
    question_text = question.question_text if question else ""

    # Generate PDF
    pdf_path = pdf_service.generate_pdf_report(
        student_name=evaluation.student_name,
        student_id=evaluation.student_id,
        question_title=question_title,
        question_text=question_text,
        results=evaluation.results or {},
        overall_score=evaluation.overall_score,
        passed=evaluation.passed,
    )

    # Save report record
    report = Report(
        evaluation_id=evaluation_id,
        pdf_path=pdf_path,
        generated_at=datetime.now(timezone.utc),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
