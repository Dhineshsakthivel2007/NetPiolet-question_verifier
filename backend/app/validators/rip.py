"""RIP validators — check RIP enabled, version, networks, auto-summary, default originate, passive interfaces."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


def _get_rip_section(network, device_name):
    device = network.get_device_by_name(device_name)
    if not device:
        return None, None, f"Device '{device_name}' not found"
    section = device.running_config.get_section("router rip")
    return device, section, None


@register_validator("rip_enabled", description="Check that RIP routing is configured on a device", topic="RIP",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_rip_enabled(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device, section, err = _get_rip_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    if section:
        return ValidatorResult(passed=True, message=f"RIP is configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"RIP is not configured on {device_name}", score=0.0)


@register_validator("rip_version", description="Check the RIP version configured on a device", topic="RIP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "version", "type": "integer", "required": True, "description": "Expected RIP version (1 or 2)", "example": 2},
    ])
def check_rip_version(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    version = int(params.get("version", 2))
    device, section, err = _get_rip_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    for line in (section or []):
        if f"version {version}" in line.lower():
            return ValidatorResult(passed=True, message=f"RIP version {version} configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"RIP version {version} not found on {device_name}", score=0.0)


@register_validator("rip_network", description="Check that a network is advertised in RIP", topic="RIP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "network", "type": "string", "required": True, "description": "Network address", "example": "192.168.1.0"},
    ])
def check_rip_network(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    net = params.get("network") or params.get("network_address") or params.get("_network_addr") or ""
    device, section, err = _get_rip_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    for line in (section or []):
        if net and f"network {net}" in " ".join(line.lower().split()):
            return ValidatorResult(passed=True, message=f"Network {net} advertised in RIP on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"Network {net} not found in RIP on {device_name}", score=0.0)


@register_validator("rip_no_auto_summary", description="Check that auto-summary is disabled in RIP", topic="RIP",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_rip_no_auto_summary(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device, section, err = _get_rip_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    for line in (section or []):
        if "no auto-summary" in line.lower():
            return ValidatorResult(passed=True, message=f"Auto-summary disabled in RIP on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"'no auto-summary' not found in RIP on {device_name}", score=0.0)


@register_validator("rip_default_info_originate", description="Check 'default-information originate' in RIP", topic="RIP",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_rip_default_info_originate(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device, section, err = _get_rip_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    for line in (section or []):
        if "default-information originate" in line.lower():
            return ValidatorResult(passed=True, message=f"Default-information originate in RIP on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"'default-information originate' not found in RIP on {device_name}", score=0.0)


@register_validator("rip_passive_interface", description="Check that a passive interface is configured in RIP", topic="RIP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
    ])
def check_rip_passive_interface(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device, section, err = _get_rip_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    for line in (section or []):
        if f"passive-interface {interface}".lower() in line.lower():
            return ValidatorResult(passed=True, message=f"Passive interface {interface} in RIP on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"Passive interface {interface} not found in RIP on {device_name}", score=0.0)
