"""ACL validators — check ACL existence, Standard ACL (1-99), Extended ACL (100-199), and interface bindings."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator(
    "acl_exists",
    description="Check that an ACL exists on a device",
    topic="ACL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "acl_id_or_name", "type": "string", "required": True, "description": "ACL number or name", "example": "100"},
    ],
)
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
    if device.running_config.has_global_command("ip access-list") and any(
        acl_id.lower() in cmd.lower() for cmd in device.running_config.find_global_commands("ip access-list")
    ):
        return ValidatorResult(passed=True, message=f"ACL '{acl_id}' exists on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"ACL {acl_id} not found on {device_name}", score=0.0)


@register_validator(
    "acl_standard_rule",
    description="Check a Standard ACL (1-99 / 1300-1999 or ip access-list standard) rule",
    topic="ACL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "acl_id_or_name", "type": "string", "required": True, "description": "ACL number (1-99) or name", "example": "10"},
        {"name": "action", "type": "string", "required": True, "description": "permit or deny", "example": "permit"},
        {"name": "source", "type": "string", "required": True, "description": "Source IP / host / wildcard or 'any'", "example": "192.168.1.0 0.0.0.255"},
    ],
)
def check_acl_standard_rule(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    acl_id = str(params.get("acl_id_or_name", ""))
    action = params.get("action", "permit").lower()
    source = params.get("source", "").lower()

    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    fragments = [action]
    if source:
        fragments.extend(source.split())

    # Check numbered access-list lines
    for cmd in device.running_config.find_global_commands(f"access-list {acl_id}"):
        cmd_lower = " ".join(cmd.lower().split())
        if all(f in cmd_lower for f in fragments):
            return ValidatorResult(passed=True, message=f"Standard ACL rule found: '{cmd}'", score=1.0)

    # Check named standard ACL sections
    sections = device.running_config.get_all_sections("ip access-list")
    for section in sections:
        if section and ("standard" in section[0].lower() or acl_id.lower() in section[0].lower()):
            for line in section[1:]:
                line_lower = " ".join(line.lower().split())
                if all(f in line_lower for f in fragments):
                    return ValidatorResult(passed=True, message=f"Standard ACL rule found: '{line}'", score=1.0)

    return ValidatorResult(passed=False, message=f"Standard ACL rule ({action} {source}) not found in ACL {acl_id} on {device_name}", score=0.0)


@register_validator(
    "acl_extended_rule",
    description="Check an Extended ACL (100-199 / 2000-2699 or ip access-list extended) rule",
    topic="ACL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "acl_id_or_name", "type": "string", "required": True, "description": "ACL number (100-199) or name", "example": "101"},
        {"name": "action", "type": "string", "required": True, "description": "permit or deny", "example": "permit"},
        {"name": "protocol", "type": "string", "required": True, "description": "Protocol: ip, tcp, udp, icmp", "example": "tcp"},
        {"name": "source", "type": "string", "required": True, "description": "Source address/wildcard or 'any'", "example": "192.168.1.0 0.0.0.255"},
        {"name": "destination", "type": "string", "required": True, "description": "Destination address/wildcard or 'any'", "example": "host 10.0.0.5"},
        {"name": "port", "type": "string", "required": False, "description": "Optional port (eq 80, eq 21, eq 53, etc.)", "example": "eq 80"},
    ],
)
def check_acl_extended_rule(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    acl_id = str(params.get("acl_id_or_name", ""))
    action = params.get("action", "permit").lower()
    protocol = params.get("protocol", "ip").lower()
    source = params.get("source", "").lower()
    destination = params.get("destination", "").lower()
    port = params.get("port", "").lower()

    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    fragments = [action, protocol]
    if source:
        fragments.extend(source.split())
    if destination:
        fragments.extend(destination.split())
    if port:
        fragments.extend(port.split())

    # Check numbered access-list lines
    for cmd in device.running_config.find_global_commands(f"access-list {acl_id}"):
        cmd_lower = " ".join(cmd.lower().split())
        if all(f in cmd_lower for f in fragments):
            return ValidatorResult(passed=True, message=f"Extended ACL rule found: '{cmd}'", score=1.0)

    # Check named extended ACL sections
    sections = device.running_config.get_all_sections("ip access-list")
    for section in sections:
        if section and ("extended" in section[0].lower() or acl_id.lower() in section[0].lower()):
            for line in section[1:]:
                line_lower = " ".join(line.lower().split())
                if all(f in line_lower for f in fragments):
                    return ValidatorResult(passed=True, message=f"Extended ACL rule found: '{line}'", score=1.0)

    return ValidatorResult(
        passed=False,
        message=f"Extended ACL rule ({action} {protocol} {source} -> {destination} {port}) not found in ACL {acl_id} on {device_name}",
        score=0.0,
    )


@register_validator(
    "acl_rule",
    description="Generic ACL rule check (backward compatibility)",
    topic="ACL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "acl_id_or_name", "type": "string", "required": True, "description": "ACL number or name", "example": "100"},
        {"name": "action", "type": "string", "required": True, "description": "permit or deny", "example": "permit"},
        {"name": "protocol", "type": "string", "required": False, "description": "Protocol (ip, tcp, udp, icmp)", "example": "ip"},
        {"name": "source", "type": "string", "required": False, "description": "Source address or 'any'", "example": "192.168.1.0 0.0.0.255"},
        {"name": "destination", "type": "string", "required": False, "description": "Destination address or 'any'", "example": "any"},
    ],
)
def check_acl_rule(network: ParsedNetwork, **params) -> ValidatorResult:
    return check_acl_extended_rule(network, **params)


@register_validator(
    "acl_applied",
    description="Check that an ACL is applied to an interface",
    topic="ACL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
        {"name": "direction", "type": "string", "required": True, "description": "Direction: in or out", "example": "in"},
        {"name": "acl_id_or_name", "type": "string", "required": True, "description": "ACL number or name", "example": "100"},
    ],
)
def check_acl_applied(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    direction = params.get("direction", "in").lower()
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
