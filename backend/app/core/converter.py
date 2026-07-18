"""
PKT to XML Converter — Wraps the pka2xml binary.

Calls the existing pka2xml tool to decrypt .pkt/.pka files into XML.
"""

from __future__ import annotations

import subprocess
import uuid
from pathlib import Path

from app.config import settings


class ConversionError(Exception):
    """Raised when pkt-to-xml conversion fails."""


def convert_pkt_to_xml(pkt_file_path: str | Path) -> Path:
    """Convert a .pkt/.pka file to XML using the pka2xml binary.

    Args:
        pkt_file_path: Path to the input .pkt or .pka file.

    Returns:
        Path to the generated XML file.

    Raises:
        FileNotFoundError: If the input file or pka2xml binary is not found.
        ConversionError: If the conversion process fails.
    """
    pkt_path = Path(pkt_file_path)
    if not pkt_path.exists():
        raise FileNotFoundError(f"PKT file not found: {pkt_path}")

    binary = Path(settings.pka2xml_binary_path)
    if not binary.exists():
        raise FileNotFoundError(
            f"pka2xml binary not found at: {binary}. "
            "Build it with 'make static-install' in the pka2xml directory."
        )

    # Generate output path
    xml_dir = settings.upload_dir / "xml"
    xml_dir.mkdir(parents=True, exist_ok=True)
    output_filename = f"{pkt_path.stem}_{uuid.uuid4().hex[:8]}.xml"
    output_path = xml_dir / output_filename

    try:
        result = subprocess.run(
            [str(binary), "-d", str(pkt_path), str(output_path)],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired as e:
        raise ConversionError(f"Conversion timed out after 60 seconds: {e}") from e
    except OSError as e:
        raise ConversionError(f"Failed to execute pka2xml: {e}") from e

    if result.returncode != 0:
        error_msg = result.stderr.strip() or result.stdout.strip() or "Unknown error"
        raise ConversionError(
            f"pka2xml conversion failed (exit code {result.returncode}): {error_msg}"
        )

    if not output_path.exists():
        raise ConversionError("Conversion completed but output XML file was not created")

    return output_path


def convert_pkt_to_xml_string(pkt_file_path: str | Path) -> str:
    """Convert a .pkt/.pka file and return the XML content as a string.

    Args:
        pkt_file_path: Path to the input .pkt or .pka file.

    Returns:
        XML content string.
    """
    xml_path = convert_pkt_to_xml(pkt_file_path)
    with open(xml_path, encoding="utf-8", errors="replace") as f:
        return f.read()
