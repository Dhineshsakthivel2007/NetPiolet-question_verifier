"""PDF report generation using ReportLab."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.config import settings


def generate_pdf_report(
    student_name: str,
    student_id: str,
    question_title: str,
    question_text: str,
    results: dict,
    overall_score: float,
    passed: bool,
) -> str:
    """Generate a professional PDF evaluation report.

    Returns the path to the generated PDF file.
    """
    reports_dir = settings.reports_dir
    reports_dir.mkdir(parents=True, exist_ok=True)
    filename = f"report_{uuid.uuid4().hex[:8]}.pdf"
    pdf_path = reports_dir / filename

    doc = SimpleDocTemplate(
        str(pdf_path), pagesize=A4,
        topMargin=20 * mm, bottomMargin=20 * mm,
        leftMargin=20 * mm, rightMargin=20 * mm,
    )
    styles = getSampleStyleSheet()
    elements = []

    # Title style
    title_style = ParagraphStyle("CustomTitle", parent=styles["Title"], fontSize=20, spaceAfter=12, textColor=colors.HexColor("#1a237e"))
    subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"], fontSize=12, textColor=colors.HexColor("#455a64"), spaceAfter=6)
    heading_style = ParagraphStyle("Heading", parent=styles["Heading2"], fontSize=14, textColor=colors.HexColor("#1a237e"), spaceBefore=16, spaceAfter=8)

    # Header
    elements.append(Paragraph("Packet Tracer Lab Evaluation Report", title_style))
    elements.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", subtitle_style))
    elements.append(Spacer(1, 12))

    # Student info
    info_data = [
        ["Student Name", student_name or "N/A"],
        ["Student ID", student_id or "N/A"],
        ["Overall Score", f"{overall_score:.1f} / {results.get('max_score', 100)}"],
        ["Result", "PASS ✓" if passed else "FAIL ✗"],
    ]
    info_table = Table(info_data, colWidths=[120, 350])
    result_color = colors.HexColor("#2e7d32") if passed else colors.HexColor("#c62828")
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e8eaf6")),
        ("TEXTCOLOR", (1, 3), (1, 3), result_color),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 3), (1, 3), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#bdbdbd")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 16))

    # Question section
    elements.append(Paragraph("Lab Question", heading_style))
    elements.append(Paragraph(f"<b>{question_title}</b>", styles["Normal"]))
    elements.append(Spacer(1, 4))
    for line in question_text.split("\n"):
        if line.strip():
            elements.append(Paragraph(line.strip(), styles["Normal"]))
    elements.append(Spacer(1, 12))

    # Results table
    elements.append(Paragraph("Evaluation Details", heading_style))
    check_results = results.get("check_results", [])
    if check_results:
        header = ["#", "Check", "Status", "Score", "Details"]
        table_data = [header]
        for i, cr in enumerate(check_results, 1):
            status = "✓ PASS" if cr.get("passed") else "✗ FAIL"
            desc = cr.get("check_description", cr.get("check_type", ""))[:50]
            msg = cr.get("message", "")[:60]
            score = f"{cr.get('score', 0):.0%}"
            table_data.append([str(i), desc, status, score, msg])

        col_widths = [30, 160, 60, 50, 200]
        results_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        style_commands = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a237e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#bdbdbd")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ]
        # Color rows based on pass/fail
        for i, cr in enumerate(check_results, 1):
            if cr.get("passed"):
                style_commands.append(("TEXTCOLOR", (2, i), (2, i), colors.HexColor("#2e7d32")))
            else:
                style_commands.append(("TEXTCOLOR", (2, i), (2, i), colors.HexColor("#c62828")))
            if i % 2 == 0:
                style_commands.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f5f5f5")))

        results_table.setStyle(TableStyle(style_commands))
        elements.append(results_table)

    # Summary
    elements.append(Spacer(1, 16))
    summary = results.get("summary", "")
    elements.append(Paragraph(f"<b>Summary:</b> {summary}", styles["Normal"]))

    doc.build(elements)
    return str(pdf_path)
