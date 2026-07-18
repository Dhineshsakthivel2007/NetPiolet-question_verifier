"""Trunk validators — check trunk mode, allowed VLANs, native VLAN, encapsulation."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator(
    "trunk_mode",
    description="Check that an interface is configured as a trunk",
    topic="TRUNK",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "FastEthernet0/24"},
    ],
)
def check_trunk_mode(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command("switchport mode trunk"):
        return ValidatorResult(passed=True, message=f"{interface} is configured as trunk on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"{interface} is not configured as trunk", score=0.0)


@register_validator(
    "trunk_allowed_vlans",
    description="Check that a trunk allows specific VLANs",
    topic="TRUNK",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "FastEthernet0/24"},
        {"name": "vlans", "type": "list[integer]", "required": True, "description": "List of VLAN IDs that should be allowed", "example": [10, 20, 30]},
    ],
)
def check_trunk_allowed_vlans(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    expected_vlans = [int(v) for v in params.get("vlans", [])]
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)

    allowed_cmd = iface.get_command_value("switchport trunk allowed vlan")
    if allowed_cmd is None:
        # No explicit allowed list means all VLANs are allowed (default)
        return ValidatorResult(passed=True, message=f"All VLANs allowed on {interface} (default)", score=1.0, details={"note": "No explicit allowed list — all VLANs permitted"})

    # Parse the VLAN list (can be comma-separated, ranges like 10-20)
    allowed_set: set[int] = set()
    for part in allowed_cmd.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-", 1)
            for v in range(int(start.strip()), int(end.strip()) + 1):
                allowed_set.add(v)
        elif part.isdigit():
            allowed_set.add(int(part))

    missing = [v for v in expected_vlans if v not in allowed_set]
    if not missing:
        return ValidatorResult(passed=True, message=f"All expected VLANs are allowed on {interface}", score=1.0, details={"allowed": sorted(allowed_set)})
    return ValidatorResult(passed=False, message=f"VLANs {missing} not allowed on trunk {interface}", score=0.0, details={"expected": expected_vlans, "allowed": sorted(allowed_set), "missing": missing})


@register_validator(
    "trunk_native_vlan",
    description="Check the native VLAN on a trunk interface",
    topic="TRUNK",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "FastEthernet0/24"},
        {"name": "vlan_id", "type": "integer", "required": True, "description": "Expected native VLAN ID", "example": 99},
    ],
)
def check_trunk_native_vlan(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    vlan_id = int(params.get("vlan_id", 0))
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command(f"switchport trunk native vlan {vlan_id}"):
        return ValidatorResult(passed=True, message=f"Native VLAN {vlan_id} configured on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"Native VLAN {vlan_id} not set on {interface}", score=0.0)


@register_validator(
    "trunk_encapsulation",
    description="Check trunk encapsulation type on an interface",
    topic="TRUNK",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "FastEthernet0/24"},
        {"name": "encapsulation", "type": "string", "required": True, "description": "Expected encapsulation (dot1q, isl, negotiate)", "example": "dot1q"},
    ],
)
def check_trunk_encapsulation(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    encap = params.get("encapsulation", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command(f"switchport trunk encapsulation {encap}"):
        return ValidatorResult(passed=True, message=f"Trunk encapsulation '{encap}' set on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"Trunk encapsulation '{encap}' not found on {interface}", score=0.0)
