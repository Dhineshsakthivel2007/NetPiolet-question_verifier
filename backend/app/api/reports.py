"""Report API routes."""


from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas import ReportResponse
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/{evaluation_id}", response_model=ReportResponse)
def get_report(evaluation_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get or generate a report for an evaluation."""
    try:
        report = report_service.generate_report(db, evaluation_id)
        return report
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/{evaluation_id}/pdf")
def download_pdf(evaluation_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Download the PDF report file."""
    report = report_service.get_report(db, evaluation_id)
    if not report:
        try:
            report = report_service.generate_report(db, evaluation_id)
        except ValueError as e:
            raise HTTPException(404, str(e))

    pdf_path = Path(report.pdf_path)
    if not pdf_path.exists():
        raise HTTPException(404, "PDF file not found on disk")

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"evaluation_{evaluation_id}.pdf",
    )
