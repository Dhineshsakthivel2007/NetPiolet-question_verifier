"""Routing validators — check static routes and default routes."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("static_route", description="Check that a static route is configured", topic="ROUTING",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "destination", "type": "string", "required": True, "description": "Destination network", "example": "10.0.0.0"},
        {"name": "mask", "type": "string", "required": True, "description": "Subnet mask", "example": "255.255.255.0"},
        {"name": "next_hop_or_exit", "type": "string", "required": True, "description": "Next-hop IP or exit interface", "example": "192.168.1.2"},
    ])
def check_static_route(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    destination = params.get("destination", "")
    mask = params.get("mask", "")
    next_hop = params.get("next_hop_or_exit", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    expected = f"ip route {destination} {mask} {next_hop}"
    if device.running_config.has_global_command(expected):
        return ValidatorResult(passed=True, message=f"Static route found: {expected}", score=1.0)
    found = device.running_config.find_global_commands("ip route")
    return ValidatorResult(passed=False, message=f"Static route not found: {expected}", score=0.0, details={"expected": expected, "found_routes": found[:5]})


@register_validator("default_route", description="Check that a default route is configured", topic="ROUTING",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "next_hop_or_exit", "type": "string", "required": True, "description": "Next-hop IP or exit interface", "example": "192.168.1.1"},
    ])
def check_default_route(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    next_hop = params.get("next_hop_or_exit", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    expected = f"ip route 0.0.0.0 0.0.0.0 {next_hop}"
    if device.running_config.has_global_command(expected):
        return ValidatorResult(passed=True, message=f"Default route to {next_hop} configured", score=1.0)
    # Check for any default route
    for cmd in device.running_config.find_global_commands("ip route 0.0.0.0 0.0.0.0"):
        return ValidatorResult(passed=False, message=f"Default route exists but next-hop differs", score=0.0, details={"expected_next_hop": next_hop, "found": cmd})
    return ValidatorResult(passed=False, message=f"No default route found on {device_name}", score=0.0)
