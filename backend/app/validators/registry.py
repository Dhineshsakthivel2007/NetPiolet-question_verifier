"""
Validator auto-discovery registry.

On startup, imports every module in the validators package so that
@register_validator decorators fire and populate the global registry.
New validator files are auto-discovered — no manual registration needed.
"""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path

from app.core.plan_schema import ValidatorCatalogEntry, ValidatorParamSchema
from app.validators.base import BaseValidator, get_registry


def discover_validators() -> dict[str, BaseValidator]:
    """Import all modules in the validators package to trigger registration.

    This should be called once at application startup.
    """
    package_dir = Path(__file__).parent

    for module_info in pkgutil.iter_modules([str(package_dir)]):
        if module_info.name in ("base", "registry", "__init__"):
            continue
        importlib.import_module(f"app.validators.{module_info.name}")

    return get_registry()


def get_validator_catalog() -> list[ValidatorCatalogEntry]:
    """Generate the complete validator catalog for the AI extractor.

    Returns a list of catalog entries describing every registered
    validator, its parameters, and usage examples. This is injected
    into the AI's system prompt so it knows what checks are available.
    """
    registry = get_registry()
    catalog: list[ValidatorCatalogEntry] = []

    for type_key, validator in sorted(registry.items()):
        params = [
            ValidatorParamSchema(
                name=p.get("name", ""),
                type=p.get("type", "string"),
                required=p.get("required", True),
                description=p.get("description", ""),
                example=p.get("example"),
            )
            for p in validator.param_schema
        ]

        entry = ValidatorCatalogEntry(
            type_key=type_key,
            description=validator.description,
            topic=validator.topic,
            params=params,
            examples=getattr(validator, "examples", []),
        )
        catalog.append(entry)

    return catalog


def get_catalog_as_text() -> str:
    """Generate a human-readable text version of the validator catalog.

    Used as part of the AI extractor's system prompt.
    """
    catalog = get_validator_catalog()
    lines: list[str] = []

    for entry in catalog:
        lines.append(f"## {entry.type_key}")
        lines.append(f"Topic: {entry.topic}")
        lines.append(f"Description: {entry.description}")

        if entry.params:
            lines.append("Parameters:")
            for p in entry.params:
                req = "required" if p.required else "optional"
                example = f" (example: {p.example})" if p.example is not None else ""
                lines.append(f"  - {p.name} ({p.type}, {req}): {p.description}{example}")

        lines.append("")

    return "\n".join(lines)
