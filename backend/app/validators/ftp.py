"""FTP validators — check FTP client configuration, source interface, credentials, and services."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator(
    "ftp_client_credentials",
    description="Check FTP client credentials configured on Cisco device (ip ftp username/password)",
    topic="FTP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "username", "type": "string", "required": True, "description": "FTP username", "example": "admin"},
        {"name": "password", "type": "string", "required": False, "description": "FTP password", "example": "cisco123"},
    ],
)
def check_ftp_client_credentials(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    username = params.get("username", "")
    password = params.get("password", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    user_found = device.running_config.has_global_command(f"ip ftp username {username}")
    pass_found = True
    if password:
        pass_found = device.running_config.has_global_command(f"ip ftp password {password}")

    if user_found and pass_found:
        return ValidatorResult(passed=True, message=f"FTP credentials (user: {username}) configured on {device_name}", score=1.0)

    return ValidatorResult(passed=False, message=f"FTP credentials (user: {username}) missing or invalid on {device_name}", score=0.0)


@register_validator(
    "ftp_source_interface",
    description="Check FTP source interface configured on Cisco device (ip ftp source-interface)",
    topic="FTP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Source interface name", "example": "GigabitEthernet0/0"},
    ],
)
def check_ftp_source_interface(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    if device.running_config.has_global_command(f"ip ftp source-interface {interface}"):
        return ValidatorResult(passed=True, message=f"FTP source-interface {interface} configured on {device_name}", score=1.0)

    return ValidatorResult(passed=False, message=f"FTP source-interface {interface} not configured on {device_name}", score=0.0)
