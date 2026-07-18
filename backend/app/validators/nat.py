"""NAT validators — check inside/outside, static NAT, overload/PAT, NAT pools."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("nat_inside", description="Check that an interface is configured as NAT inside", topic="NAT",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
    ])
def check_nat_inside(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command("ip nat inside"):
        return ValidatorResult(passed=True, message=f"NAT inside configured on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"'ip nat inside' not found on {interface}", score=0.0)


@register_validator("nat_outside", description="Check that an interface is configured as NAT outside", topic="NAT",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "Serial0/0"},
    ])
def check_nat_outside(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command("ip nat outside"):
        return ValidatorResult(passed=True, message=f"NAT outside configured on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"'ip nat outside' not found on {interface}", score=0.0)


@register_validator("nat_static", description="Check static NAT translation", topic="NAT",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "inside_local", "type": "string", "required": True, "description": "Inside local IP", "example": "192.168.1.10"},
        {"name": "inside_global", "type": "string", "required": True, "description": "Inside global IP", "example": "203.0.113.10"},
    ])
def check_nat_static(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    inside_local = params.get("inside_local", "")
    inside_global = params.get("inside_global", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    expected = f"ip nat inside source static {inside_local} {inside_global}"
    if device.running_config.has_global_command(expected):
        return ValidatorResult(passed=True, message=f"Static NAT {inside_local} -> {inside_global} configured", score=1.0)
    return ValidatorResult(passed=False, message=f"Static NAT translation not found", score=0.0, details={"expected": expected})


@register_validator("nat_overload", description="Check NAT overload (PAT) configuration", topic="NAT",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "acl_or_source", "type": "string", "required": False, "description": "ACL number or source", "example": "1"},
        {"name": "interface_or_pool", "type": "string", "required": False, "description": "Interface or pool name", "example": "Serial0/0"},
    ])
def check_nat_overload(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    for cmd in device.running_config.find_global_commands("ip nat inside source"):
        if "overload" in cmd.lower():
            return ValidatorResult(passed=True, message=f"NAT overload configured: {cmd}", score=1.0)
    return ValidatorResult(passed=False, message=f"NAT overload (PAT) not found on {device_name}", score=0.0)


@register_validator("nat_pool", description="Check that a NAT pool is defined", topic="NAT",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "pool_name", "type": "string", "required": True, "description": "NAT pool name", "example": "MY_POOL"},
        {"name": "start_ip", "type": "string", "required": False, "description": "Pool start IP", "example": "203.0.113.1"},
        {"name": "end_ip", "type": "string", "required": False, "description": "Pool end IP", "example": "203.0.113.10"},
        {"name": "prefix_length", "type": "integer", "required": False, "description": "Prefix length", "example": 24},
    ])
def check_nat_pool(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    pool_name = params.get("pool_name", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    for cmd in device.running_config.find_global_commands("ip nat pool"):
        if pool_name.lower() in cmd.lower():
            return ValidatorResult(passed=True, message=f"NAT pool '{pool_name}' found: {cmd}", score=1.0)
    return ValidatorResult(passed=False, message=f"NAT pool '{pool_name}' not found on {device_name}", score=0.0)
