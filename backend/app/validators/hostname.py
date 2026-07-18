"""Hostname validator — check device hostname."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("hostname_check", description="Check that a device has a specific hostname", topic="GENERAL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device name to search for", "example": "Router0"},
        {"name": "expected_hostname", "type": "string", "required": True, "description": "Expected hostname", "example": "R1"},
    ])
def check_hostname(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    expected = params.get("expected_hostname", "")
    device = network.get_device_by_name(device_name)
    if not device:
        # Try finding by expected hostname instead
        device = network.get_device_by_name(expected)
        if device:
            return ValidatorResult(passed=True, message=f"Device with hostname '{expected}' found", score=1.0)
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    if device.running_config.hostname.lower() == expected.lower():
        return ValidatorResult(passed=True, message=f"Hostname is '{expected}'", score=1.0)
    return ValidatorResult(passed=False, message=f"Hostname mismatch", score=0.0, details={"expected": expected, "found": device.running_config.hostname})
