"""OSPF validators — check process, networks, areas, passive interfaces, default originate, router-id, authentication."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


def _get_ospf_section(network: ParsedNetwork, device_name: str, process_id: int | None = None):
    """Helper to get OSPF config section from a device."""
    device = network.get_device_by_name(device_name)
    if not device:
        return None, None, f"Device '{device_name}' not found"
    keyword = f"router ospf {process_id}" if process_id else "router ospf"
    sections = device.running_config.get_all_sections(keyword)
    if not sections:
        sections = device.running_config.get_all_sections("router ospf")
    return device, sections, None


@register_validator(
    "ospf_process",
    description="Check that an OSPF process is configured on a device",
    topic="OSPF",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "process_id", "type": "integer", "required": False, "description": "OSPF process ID (optional)", "example": 1},
    ],
)
def check_ospf_process(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    process_id = params.get("process_id")
    device, sections, err = _get_ospf_section(network, device_name, int(process_id) if process_id else None)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    if sections:
        return ValidatorResult(passed=True, message=f"OSPF is configured on {device_name}", score=1.0, details={"config_lines": sections[0][:5]})
    return ValidatorResult(passed=False, message=f"OSPF is not configured on {device_name}", score=0.0)


@register_validator(
    "ospf_network",
    description="Check that a specific network statement exists in OSPF configuration",
    topic="OSPF",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "network", "type": "string", "required": True, "description": "Network address", "example": "192.168.1.0"},
        {"name": "wildcard", "type": "string", "required": True, "description": "Wildcard mask", "example": "0.0.0.255"},
        {"name": "area", "type": "integer", "required": True, "description": "OSPF area number", "example": 0},
    ],
)
def check_ospf_network(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    net = params.get("network") or params.get("network_address") or params.get("_network_addr") or ""
    wildcard = params.get("wildcard", "")
    area = int(params.get("area", 0))
    device, sections, err = _get_ospf_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)

    # Build match patterns
    expected_full = f"network {net} {wildcard} area {area}".strip() if wildcard else f"network {net}"
    for section in (sections or []):
        for line in section:
            clean_line = " ".join(line.lower().split())
            if net in clean_line and f"area {area}" in clean_line:
                return ValidatorResult(passed=True, message=f"OSPF network statement found for {net} area {area}", score=1.0)
            if expected_full.lower() in clean_line:
                return ValidatorResult(passed=True, message=f"OSPF network statement found: {expected_full}", score=1.0)
    return ValidatorResult(passed=False, message=f"OSPF network statement for {net} not found on {device_name}", score=0.0, details={"expected": expected_full})


@register_validator(
    "ospf_area",
    description="Check that a specific OSPF area is referenced in the device configuration",
    topic="OSPF",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "area", "type": "integer", "required": True, "description": "OSPF area number", "example": 0},
    ],
)
def check_ospf_area(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    area = int(params.get("area", 0))
    device, sections, err = _get_ospf_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    for section in (sections or []):
        for line in section:
            if f"area {area}" in line.lower():
                return ValidatorResult(passed=True, message=f"OSPF area {area} configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"OSPF area {area} not found on {device_name}", score=0.0)


@register_validator(
    "ospf_passive_interface",
    description="Check that a passive interface is configured in OSPF",
    topic="OSPF",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
    ],
)
def check_ospf_passive_interface(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device, sections, err = _get_ospf_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    for section in (sections or []):
        for line in section:
            if f"passive-interface {interface}".lower() in line.lower():
                return ValidatorResult(passed=True, message=f"Passive interface {interface} configured in OSPF", score=1.0)
    return ValidatorResult(passed=False, message=f"Passive interface {interface} not found in OSPF config", score=0.0)


@register_validator(
    "ospf_default_info_originate",
    description="Check that 'default-information originate' is configured in OSPF",
    topic="OSPF",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
    ],
)
def check_ospf_default_info_originate(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device, sections, err = _get_ospf_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    for section in (sections or []):
        for line in section:
            if "default-information originate" in line.lower():
                return ValidatorResult(passed=True, message=f"'default-information originate' configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"'default-information originate' not found in OSPF on {device_name}", score=0.0)


@register_validator(
    "ospf_router_id",
    description="Check that a specific router-id is set in OSPF",
    topic="OSPF",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "router_id", "type": "string", "required": True, "description": "Expected OSPF router ID", "example": "1.1.1.1"},
    ],
)
def check_ospf_router_id(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    router_id = params.get("router_id", "")
    device, sections, err = _get_ospf_section(network, device_name)
    if err:
        return ValidatorResult(passed=False, message=err, score=0.0)
    for section in (sections or []):
        for line in section:
            if f"router-id {router_id}" in line.lower():
                return ValidatorResult(passed=True, message=f"OSPF router-id {router_id} configured on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"OSPF router-id {router_id} not found on {device_name}", score=0.0)


@register_validator(
    "ospf_authentication",
    description="Check OSPF authentication on an interface",
    topic="OSPF",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
        {"name": "auth_type", "type": "string", "required": False, "description": "Authentication type (message-digest, null)", "example": "message-digest"},
    ],
)
def check_ospf_authentication(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    auth_type = params.get("auth_type", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if auth_type:
        if iface.has_command(f"ip ospf authentication {auth_type}"):
            return ValidatorResult(passed=True, message=f"OSPF {auth_type} authentication on {interface}", score=1.0)
    else:
        if iface.has_command("ip ospf authentication"):
            return ValidatorResult(passed=True, message=f"OSPF authentication configured on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"OSPF authentication not found on {interface}", score=0.0)
