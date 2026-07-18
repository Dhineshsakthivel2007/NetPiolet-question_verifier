"""Security validators — enable secret, console/VTY passwords, SSH, encryption, banner."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("enable_secret", description="Check that enable secret is configured", topic="SECURITY",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_enable_secret(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    if device.running_config.has_global_command("enable secret"):
        return ValidatorResult(passed=True, message=f"Enable secret configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"Enable secret not found on {device_name}", score=0.0)


@register_validator("console_password", description="Check that console line has a password", topic="SECURITY",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_console_password(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    section = device.running_config.get_section("line con 0")
    for line in (section or []):
        if "password" in line.lower():
            return ValidatorResult(passed=True, message=f"Console password configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"Console password not found on {device_name}", score=0.0)


@register_validator("vty_password", description="Check that VTY lines have a password", topic="SECURITY",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_vty_password(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    sections = device.running_config.get_all_sections("line vty")
    for section in sections:
        for line in section:
            if "password" in line.lower():
                return ValidatorResult(passed=True, message=f"VTY password configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"VTY password not found on {device_name}", score=0.0)


@register_validator("ssh_enabled", description="Check that SSH is enabled for VTY access", topic="SECURITY",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_ssh_enabled(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    sections = device.running_config.get_all_sections("line vty")
    for section in sections:
        for line in section:
            if "transport input ssh" in line.lower():
                return ValidatorResult(passed=True, message=f"SSH enabled for VTY on {device_name}", score=1.0)
            if "transport input all" in line.lower():
                return ValidatorResult(passed=True, message=f"All transports (incl. SSH) enabled for VTY", score=1.0)
    return ValidatorResult(passed=False, message=f"SSH not enabled for VTY on {device_name}", score=0.0)


@register_validator("service_password_encryption", description="Check service password-encryption", topic="SECURITY",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_service_password_encryption(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    if device.running_config.has_global_command("service password-encryption"):
        return ValidatorResult(passed=True, message=f"Service password-encryption on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"Service password-encryption not found on {device_name}", score=0.0)


@register_validator("banner_motd", description="Check that a MOTD banner is configured", topic="SECURITY",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_banner_motd(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    if device.running_config.has_global_command("banner motd"):
        return ValidatorResult(passed=True, message=f"Banner MOTD configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"Banner MOTD not found on {device_name}", score=0.0)
