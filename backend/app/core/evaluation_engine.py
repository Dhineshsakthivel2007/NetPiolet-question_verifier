"""
Evaluation Engine — Orchestrates validators against parsed network data.

Takes a ParsedNetwork and an EvaluationPlan, executes each check
via the validator registry, computes scores, and returns results.

Now includes dynamic device role resolution so evaluation plans
don't need hardcoded device names.
"""

from __future__ import annotations

import logging
import traceback

from app.core.network_models import ParsedNetwork
from app.core.plan_schema import CheckItem, CheckResult, EvaluationPlan, EvaluationResult
from app.core.role_resolver import DeviceRoleMap, resolve_device_param, resolve_roles
from app.validators.base import get_validator

logger = logging.getLogger(__name__)


def _run_check(network: ParsedNetwork, check: CheckItem, role_map: DeviceRoleMap) -> CheckResult:
    """Execute a single check item against the network with device resolution."""
    validator = get_validator(check.type)

    if validator is None:
        return CheckResult(
            check_type=check.type,
            check_description=check.description,
            passed=False,
            message=f"Unknown validator type: '{check.type}'",
            score=0.0,
            weight=check.weight,
            required=check.required,
        )

    try:
        safe_params = dict(check.params)

        # Handle 'network' param collision
        network_param = safe_params.pop("network", None)
        if network_param is not None:
            safe_params["_network_addr"] = network_param

        # ── Dynamic device resolution ──
        # If params has 'device' or 'device_role', resolve to actual name
        if "device" in safe_params or "device_role" in safe_params:
            resolved_name, error = resolve_device_param(network, role_map, safe_params)
            if error:
                return CheckResult(
                    check_type=check.type,
                    check_description=check.description,
                    passed=False,
                    message=error,
                    score=0.0,
                    weight=check.weight,
                    required=check.required,
                )
            # Replace both device and device_role with the resolved name
            safe_params.pop("device_role", None)
            safe_params["device"] = resolved_name

        result = validator.validate(network, **safe_params)
        return CheckResult(
            check_type=check.type,
            check_description=check.description or validator.description,
            passed=result.passed,
            message=result.message,
            details=result.details,
            score=result.score,
            weight=check.weight,
            required=check.required,
        )
    except Exception as e:
        logger.error(
            "Validator '%s' raised exception: %s\n%s",
            check.type,
            str(e),
            traceback.format_exc(),
        )
        return CheckResult(
            check_type=check.type,
            check_description=check.description,
            passed=False,
            message=f"Validator error: {str(e)}",
            details={"exception": str(e), "traceback": traceback.format_exc()},
            score=0.0,
            weight=check.weight,
            required=check.required,
        )


def evaluate(network: ParsedNetwork, plan: EvaluationPlan) -> EvaluationResult:
    """Run all checks from the evaluation plan against the parsed network.

    Device names in the plan are dynamically resolved:
    - "device_role": "edge_router" → resolved via topology analysis
    - "device": "R1" → resolved via fuzzy matching (R1 → first Router)
    - "device": "Router0" → used directly if found

    Args:
        network: Parsed network topology from the student's .pkt file.
        plan: AI-generated (and professor-reviewed) evaluation plan.

    Returns:
        EvaluationResult with individual check results and overall score.
    """
    # Build device role map from the actual network topology
    role_map = resolve_roles(network)
    logger.info("Device role map: %s", role_map.to_dict())

    check_results: list[CheckResult] = []
    errors: list[str] = []

    for check in plan.checks:
        result = _run_check(network, check, role_map)
        check_results.append(result)

        if not result.passed and result.required:
            errors.append(f"Required check failed: {result.check_description} — {result.message}")

    # Compute weighted score
    total_weight = sum(r.weight for r in check_results)
    if total_weight > 0:
        weighted_score = sum(r.score * r.weight for r in check_results) / total_weight
    else:
        weighted_score = 0.0

    total_score = weighted_score * plan.total_points
    max_score = plan.total_points
    percentage = weighted_score

    # Check pass conditions
    all_required_passed = all(
        r.passed for r in check_results if r.required
    )
    threshold_met = percentage >= plan.pass_threshold
    passed = all_required_passed and threshold_met

    # Build summary
    passed_count = sum(1 for r in check_results if r.passed)
    total_count = len(check_results)

    if passed:
        summary = (
            f"PASSED — Score: {total_score:.1f}/{max_score:.1f} "
            f"({percentage:.0%}) — {passed_count}/{total_count} checks passed."
        )
    else:
        fail_reasons = []
        if not all_required_passed:
            fail_reasons.append("required checks failed")
        if not threshold_met:
            fail_reasons.append(
                f"score {percentage:.0%} below threshold {plan.pass_threshold:.0%}"
            )
        summary = (
            f"FAILED — Score: {total_score:.1f}/{max_score:.1f} "
            f"({percentage:.0%}) — {passed_count}/{total_count} checks passed. "
            f"Reason: {', '.join(fail_reasons)}."
        )

    return EvaluationResult(
        plan=plan,
        check_results=check_results,
        total_score=round(total_score, 2),
        max_score=max_score,
        percentage=round(percentage, 4),
        passed=passed,
        summary=summary,
        errors=errors,
    )
