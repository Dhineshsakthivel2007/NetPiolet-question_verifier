"""EIGRP validators — check AS number, networks, auto-summary, passive interfaces."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("eigrp_as", description="Check that EIGRP is configured with a specific AS number", topic="EIGRP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "as_number", "type": "integer", "required": True, "description": "EIGRP AS number", "example": 100},
    ])
def check_eigrp_as(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    as_number = int(params.get("as_number", 0))
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    section = device.running_config.get_section(f"router eigrp {as_number}")
    if section:
        return ValidatorResult(passed=True, message=f"EIGRP AS {as_number} configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"EIGRP AS {as_number} not found on {device_name}", score=0.0)


@register_validator("eigrp_network", description="Check that a network is advertised in EIGRP", topic="EIGRP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "network", "type": "string", "required": True, "description": "Network address", "example": "192.168.1.0"},
        {"name": "wildcard", "type": "string", "required": False, "description": "Wildcard mask (optional)", "example": "0.0.0.255"},
    ])
def check_eigrp_network(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    net = params.get("_network_addr", "")
    wildcard = params.get("wildcard", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    sections = device.running_config.get_all_sections("router eigrp")
    for section in sections:
        for line in section:
            if wildcard:
                if f"network {net} {wildcard}".lower() in line.lower():
                    return ValidatorResult(passed=True, message=f"Network {net} {wildcard} in EIGRP on {device_name}", score=1.0)
            else:
                if f"network {net}".lower() in line.lower():
                    return ValidatorResult(passed=True, message=f"Network {net} in EIGRP on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"Network {net} not found in EIGRP on {device_name}", score=0.0)


@register_validator("eigrp_no_auto_summary", description="Check that auto-summary is disabled in EIGRP", topic="EIGRP",
    param_schema=[{"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"}])
def check_eigrp_no_auto_summary(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    sections = device.running_config.get_all_sections("router eigrp")
    for section in sections:
        for line in section:
            if "no auto-summary" in line.lower():
                return ValidatorResult(passed=True, message=f"Auto-summary disabled in EIGRP on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"'no auto-summary' not found in EIGRP on {device_name}", score=0.0)


@register_validator("eigrp_passive_interface", description="Check passive interface in EIGRP", topic="EIGRP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
    ])
def check_eigrp_passive_interface(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    sections = device.running_config.get_all_sections("router eigrp")
    for section in sections:
        for line in section:
            if f"passive-interface {interface}".lower() in line.lower():
                return ValidatorResult(passed=True, message=f"Passive interface {interface} in EIGRP on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"Passive interface {interface} not found in EIGRP on {device_name}", score=0.0)
