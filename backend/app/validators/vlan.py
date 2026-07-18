"""VLAN validators — check VLAN existence, naming, and port assignment."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator(
    "vlan_exists",
    description="Check that a specific VLAN exists on a device",
    topic="VLAN",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "vlan_id", "type": "integer", "required": True, "description": "VLAN ID to check", "example": 10},
    ],
)
def check_vlan_exists(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    vlan_id = int(params.get("vlan_id", 0))
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    vlan = device.get_vlan(vlan_id)
    if vlan:
        return ValidatorResult(passed=True, message=f"VLAN {vlan_id} exists on {device_name}", score=1.0, details={"vlan_name": vlan.name})
    available = [v.number for v in device.vlans if v.number < 1002]
    return ValidatorResult(passed=False, message=f"VLAN {vlan_id} not found on {device_name}", score=0.0, details={"available_vlans": available})


@register_validator(
    "vlan_name",
    description="Check that a VLAN has the expected name",
    topic="VLAN",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "vlan_id", "type": "integer", "required": True, "description": "VLAN ID", "example": 10},
        {"name": "expected_name", "type": "string", "required": True, "description": "Expected VLAN name", "example": "SALES"},
    ],
)
def check_vlan_name(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    vlan_id = int(params.get("vlan_id", 0))
    expected_name = params.get("expected_name", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    vlan = device.get_vlan(vlan_id)
    if not vlan:
        return ValidatorResult(passed=False, message=f"VLAN {vlan_id} not found on {device_name}", score=0.0)
    if vlan.name.lower() == expected_name.lower():
        return ValidatorResult(passed=True, message=f"VLAN {vlan_id} has correct name '{vlan.name}'", score=1.0)
    return ValidatorResult(passed=False, message=f"VLAN {vlan_id} name mismatch", score=0.0, details={"expected": expected_name, "found": vlan.name})


@register_validator(
    "vlan_assignment",
    description="Check that an interface is assigned to a specific access VLAN",
    topic="VLAN",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "FastEthernet0/1"},
        {"name": "vlan_id", "type": "integer", "required": True, "description": "Expected access VLAN ID", "example": 10},
    ],
)
def check_vlan_assignment(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    vlan_id = int(params.get("vlan_id", 0))
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command(f"switchport access vlan {vlan_id}"):
        return ValidatorResult(passed=True, message=f"{interface} is assigned to VLAN {vlan_id}", score=1.0)
    found = None
    for cmd in iface.commands:
        if "switchport access vlan" in cmd.lower():
            found = cmd.strip()
    return ValidatorResult(passed=False, message=f"{interface} is not assigned to VLAN {vlan_id}", score=0.0, details={"expected_vlan": vlan_id, "found_command": found})
