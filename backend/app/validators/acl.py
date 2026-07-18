"""ACL validators — check ACL existence, rules, and application to interfaces."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("acl_exists", description="Check that an ACL exists on a device", topic="ACL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "acl_id_or_name", "type": "string", "required": True, "description": "ACL number or name", "example": "100"},
    ])
def check_acl_exists(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    acl_id = params.get("acl_id_or_name", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    # Check numbered ACL
    if device.running_config.has_global_command(f"access-list {acl_id}"):
        return ValidatorResult(passed=True, message=f"ACL {acl_id} exists on {device_name}", score=1.0)
    # Check named ACL
    if device.running_config.has_global_command(f"ip access-list") and any(
        acl_id.lower() in cmd.lower() for cmd in device.running_config.find_global_commands("ip access-list")
    ):
        return ValidatorResult(passed=True, message=f"ACL '{acl_id}' exists on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"ACL {acl_id} not found on {device_name}", score=0.0)


@register_validator("acl_rule", description="Check that a specific ACL rule exists", topic="ACL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "acl_id_or_name", "type": "string", "required": True, "description": "ACL number or name", "example": "100"},
        {"name": "action", "type": "string", "required": True, "description": "permit or deny", "example": "permit"},
        {"name": "protocol", "type": "string", "required": False, "description": "Protocol (ip, tcp, udp, icmp)", "example": "ip"},
        {"name": "source", "type": "string", "required": False, "description": "Source address or 'any'", "example": "192.168.1.0 0.0.0.255"},
        {"name": "destination", "type": "string", "required": False, "description": "Destination address or 'any'", "example": "any"},
    ])
def check_acl_rule(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    acl_id = params.get("acl_id_or_name", "")
    action = params.get("action", "")
    protocol = params.get("protocol", "")
    source = params.get("source", "")
    destination = params.get("destination", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    # Build search fragments
    fragments = [action]
    if protocol:
        fragments.append(protocol)
    if source:
        fragments.append(source)
    if destination:
        fragments.append(destination)

    # Search numbered ACL lines
    for cmd in device.running_config.find_global_commands(f"access-list {acl_id}"):
        if all(f.lower() in cmd.lower() for f in fragments):
            return ValidatorResult(passed=True, message=f"ACL rule found: {cmd}", score=1.0)

    # Search named ACL section
    sections = device.running_config.get_all_sections(f"ip access-list")
    for section in sections:
        if section and acl_id.lower() in section[0].lower():
            for line in section[1:]:
                if all(f.lower() in line.lower() for f in fragments):
                    return ValidatorResult(passed=True, message=f"ACL rule found: {line}", score=1.0)

    return ValidatorResult(passed=False, message=f"ACL rule not found in ACL {acl_id} on {device_name}", score=0.0, details={"expected_fragments": fragments})


@register_validator("acl_applied", description="Check that an ACL is applied to an interface", topic="ACL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
        {"name": "direction", "type": "string", "required": True, "description": "Direction: in or out", "example": "in"},
        {"name": "acl_id_or_name", "type": "string", "required": True, "description": "ACL number or name", "example": "100"},
    ])
def check_acl_applied(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    direction = params.get("direction", "in")
    acl_id = params.get("acl_id_or_name", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command(f"ip access-group {acl_id} {direction}"):
        return ValidatorResult(passed=True, message=f"ACL {acl_id} applied {direction} on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"ACL {acl_id} not applied {direction} on {interface}", score=0.0)
