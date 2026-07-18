"""
AI Requirement Extractor — Uses Google Gemini to generate evaluation plans.

Converts professor's natural-language question text into a structured
EvaluationPlan JSON by querying the Gemini API with the full validator catalog.
"""

from __future__ import annotations

import json
import logging
import re

from app.config import settings
from app.core.plan_schema import EvaluationPlan
from app.validators.registry import get_catalog_as_text

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3


def _build_system_prompt(topic: str) -> str:
    """Build the system prompt containing the validator catalog."""
    catalog = get_catalog_as_text()

    # Build explicit list of valid type keys
    from app.validators.base import get_registry
    valid_keys = sorted(get_registry().keys())
    valid_keys_str = ", ".join(valid_keys)

    return f"""You are an expert Cisco networking instructor and automated lab grading assistant.

Your job is to analyze a lab question and produce a structured JSON evaluation plan.

## TASK
Given a lab question about the topic "{topic}", generate a JSON object matching this EXACT schema:

{{
  "topic": "{topic}",
  "description": "Brief summary of what the evaluation checks",
  "checks": [
    {{
      "type": "<validator_type_key>",
      "params": {{ <parameters for that validator> }},
      "description": "Human-readable description of this check",
      "weight": 1.0,
      "required": true
    }}
  ],
  "total_points": 100,
  "pass_threshold": 0.7
}}

## AVAILABLE VALIDATORS
Below is the complete list of validator types you can use.
Each validator lists its parameters — provide ALL required parameters.

{catalog}

## VALID TYPE KEYS (USE ONLY THESE — DO NOT INVENT NEW ONES)
{valid_keys_str}

## DEVICE NAMING — DYNAMIC ROLE RESOLUTION
The system uses DYNAMIC DEVICE ROLE RESOLUTION. This means you should use logical
device names that will be automatically resolved to actual Packet Tracer device names.

The evaluation engine automatically resolves device names using these mappings:
- "R1" → 1st Router in topology (Router0, Router1, etc.)
- "R2" → 2nd Router
- "SW1" or "S1" → 1st Switch (Switch0, Switch1, etc.)
- "SW2" or "S2" → 2nd Switch
- Any hostname set via "hostname" command is also resolved

So when the question says "Configure Router R1" or "Router0", you can use EITHER
name in the "device" parameter. The system will find the right device.

Guidelines:
- If the question specifies names like "R1", "R2", "S1", use those names
- If the question says "the router" or "main router", use "R1" for first router
- If the question says "the switch" or "core switch", use "SW1" for first switch
- The system handles name resolution, so don't worry about actual Packet Tracer names

## CRITICAL RULES
1. ONLY output valid JSON. No markdown, no explanation, no code fences.
2. **ONLY use type keys from the VALID TYPE KEYS list above.** NEVER invent new type keys like "ip_configuration", "end_to_end_connectivity", "no_auto_summary", "static_default_route", etc. If a check cannot be expressed with existing validators, SKIP it.
3. The "device" param must NEVER be empty string. Always specify a device name like "R1", "R2", "SW1", "SW2".
4. Break complex requirements into individual atomic checks using EXISTING validators only.
5. Set "required": true for core requirements and false for bonus/verification checks.
6. Assign appropriate weights (higher for important checks).
7. Distribute total_points as 100.
8. For RIP "no auto-summary", use type "rip_no_auto_summary" (NOT "no_auto_summary").
9. For static default routes, use type "default_route" (NOT "static_default_route").
10. For IP address checks, use type "ip_address" (NOT "ip_configuration").
"""


def _extract_json(text: str) -> dict:
    """Extract JSON from AI response, handling markdown fences."""
    # Try direct parse first
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Remove markdown code fences
    patterns = [
        r"```json\s*\n?(.*?)\n?```",
        r"```\s*\n?(.*?)\n?```",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                continue

    # Try finding JSON object boundaries
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from AI response: {text[:200]}...")


def generate_evaluation_plan(question_text: str, topic: str) -> EvaluationPlan:
    """Generate an evaluation plan from a professor's question using Gemini AI.

    Args:
        question_text: The professor's lab question in natural language.
        topic: The primary networking topic (e.g., "OSPF", "VLAN").

    Returns:
        EvaluationPlan ready for execution by the evaluation engine.

    Raises:
        ValueError: If the AI response cannot be parsed into a valid plan.
        RuntimeError: If all retry attempts fail.
    """
    from google import genai

    if not settings.gemini_api_key:
        raise RuntimeError(
            "Gemini API key not configured. Set GEMINI_API_KEY in environment."
        )

    client = genai.Client(api_key=settings.gemini_api_key)
    system_prompt = _build_system_prompt(topic)
    user_prompt = f"Generate an evaluation plan for this lab question:\n\n{question_text}"

    last_error: Exception | None = None

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.info("Gemini API attempt %d/%d", attempt, _MAX_RETRIES)

            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=f"{system_prompt}\n\n---\n\n{user_prompt}",
            )

            response_text = response.text
            if not response_text:
                raise ValueError("Empty response from Gemini API")

            plan_dict = _extract_json(response_text)

            # Strip checks with invalid validator types or empty device params
            from app.validators.base import get_registry
            valid_types = set(get_registry().keys())
            if "checks" in plan_dict:
                original_count = len(plan_dict["checks"])
                plan_dict["checks"] = [
                    c for c in plan_dict["checks"]
                    if c.get("type") in valid_types
                    and c.get("params", {}).get("device", "X") != ""
                ]
                stripped = original_count - len(plan_dict["checks"])
                if stripped:
                    logger.warning("Stripped %d invalid checks from AI plan", stripped)

            plan = EvaluationPlan.model_validate(plan_dict)

            logger.info(
                "Successfully generated plan with %d checks for topic '%s'",
                len(plan.checks),
                plan.topic,
            )
            return plan

        except Exception as e:
            last_error = e
            logger.warning(
                "Attempt %d failed: %s",
                attempt,
                str(e),
            )

    raise RuntimeError(
        f"Failed to generate evaluation plan after {_MAX_RETRIES} attempts. "
        f"Last error: {last_error}"
    )
