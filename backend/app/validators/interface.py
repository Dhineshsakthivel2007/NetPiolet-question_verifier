"""Interface validators — check IP address, status, description, clock rate, encapsulation."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("ip_address", description="Check that an interface has a specific IP address", topic="INTERFACE",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
        {"name": "ip", "type": "string", "required": True, "description": "Expected IP address", "example": "192.168.1.1"},
        {"name": "mask", "type": "string", "required": True, "description": "Expected subnet mask", "example": "255.255.255.0"},
    ])
def check_ip_address(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    expected_ip = params.get("ip", "")
    expected_mask = params.get("mask", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    expected = f"ip address {expected_ip} {expected_mask}"
    if iface.has_command(expected):
        return ValidatorResult(passed=True, message=f"{interface} has IP {expected_ip} {expected_mask}", score=1.0)
    found = iface.get_command_value("ip address")
    return ValidatorResult(passed=False, message=f"IP address mismatch on {interface}", score=0.0, details={"expected": f"{expected_ip} {expected_mask}", "found": found})


@register_validator("interface_up", description="Check that an interface is not shutdown", topic="INTERFACE",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
    ])
def check_interface_up(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command("shutdown"):
        return ValidatorResult(passed=False, message=f"{interface} is shutdown on {device_name}", score=0.0)
    return ValidatorResult(passed=True, message=f"{interface} is up (no shutdown) on {device_name}", score=1.0)


@register_validator("interface_description", description="Check that an interface has a specific description", topic="INTERFACE",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
        {"name": "description", "type": "string", "required": True, "description": "Expected description text", "example": "Link to Switch"},
    ])
def check_interface_description(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    expected_desc = params.get("description", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    found = iface.get_command_value("description")
    if found and expected_desc.lower() in found.lower():
        return ValidatorResult(passed=True, message=f"Description matches on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"Description mismatch on {interface}", score=0.0, details={"expected": expected_desc, "found": found})


@register_validator("clock_rate", description="Check clock rate on a serial interface", topic="INTERFACE",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "Serial0/0"},
        {"name": "rate", "type": "integer", "required": True, "description": "Expected clock rate", "example": 64000},
    ])
def check_clock_rate(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    rate = int(params.get("rate", 0))
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command(f"clock rate {rate}"):
        return ValidatorResult(passed=True, message=f"Clock rate {rate} set on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"Clock rate {rate} not found on {interface}", score=0.0)


@register_validator("encapsulation", description="Check sub-interface encapsulation", topic="INTERFACE",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Sub-interface name", "example": "GigabitEthernet0/0.10"},
        {"name": "type", "type": "string", "required": True, "description": "Encapsulation type", "example": "dot1Q"},
        {"name": "vlan_id", "type": "integer", "required": False, "description": "VLAN ID for dot1Q", "example": 10},
    ])
def check_encapsulation(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    enc_type = params.get("type", "")
    vlan_id = params.get("vlan_id")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if vlan_id:
        expected = f"encapsulation {enc_type} {vlan_id}"
    else:
        expected = f"encapsulation {enc_type}"
    if iface.has_command(expected):
        return ValidatorResult(passed=True, message=f"Encapsulation '{expected}' on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"Encapsulation '{expected}' not found on {interface}", score=0.0)
