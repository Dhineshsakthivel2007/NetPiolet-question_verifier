"""VTP validators — check VTP mode and domain."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("vtp_mode", description="Check VTP mode on a device", topic="VTP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "mode", "type": "string", "required": True, "description": "Expected VTP mode (server, client, transparent)", "example": "transparent"},
    ])
def check_vtp_mode(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    expected_mode = params.get("mode", "").lower()
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    # Check structured VTP data
    if device.vtp.mode_name == expected_mode:
        return ValidatorResult(passed=True, message=f"VTP mode is '{expected_mode}' on {device_name}", score=1.0)
    # Also check running config
    if device.running_config.has_global_command(f"vtp mode {expected_mode}"):
        return ValidatorResult(passed=True, message=f"VTP mode '{expected_mode}' in running-config", score=1.0)
    return ValidatorResult(passed=False, message=f"VTP mode '{expected_mode}' not found on {device_name}", score=0.0, details={"found": device.vtp.mode_name})


@register_validator("vtp_domain", description="Check VTP domain name on a device", topic="VTP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "domain_name", "type": "string", "required": True, "description": "Expected VTP domain name", "example": "CCNA"},
    ])
def check_vtp_domain(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    expected_domain = params.get("domain_name", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    if device.vtp.domain_name.lower() == expected_domain.lower():
        return ValidatorResult(passed=True, message=f"VTP domain is '{expected_domain}' on {device_name}", score=1.0)
    if device.running_config.has_global_command(f"vtp domain {expected_domain}"):
        return ValidatorResult(passed=True, message=f"VTP domain '{expected_domain}' in running-config", score=1.0)
    return ValidatorResult(passed=False, message=f"VTP domain '{expected_domain}' not found", score=0.0, details={"found": device.vtp.domain_name})
