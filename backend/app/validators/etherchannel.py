"""EtherChannel validators — check port-channel and protocol."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("port_channel", description="Check that interfaces are bundled into a port-channel", topic="ETHERCHANNEL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "channel_group", "type": "integer", "required": True, "description": "Channel group number", "example": 1},
        {"name": "interfaces", "type": "list[string]", "required": True, "description": "List of member interfaces", "example": ["FastEthernet0/1", "FastEthernet0/2"]},
    ])
def check_port_channel(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    channel_group = int(params.get("channel_group", 0))
    interfaces = params.get("interfaces", [])
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    missing = []
    for iface_name in interfaces:
        iface = device.running_config.get_interface(iface_name)
        if not iface:
            missing.append(f"{iface_name} (not found)")
            continue
        if not iface.has_command(f"channel-group {channel_group}"):
            missing.append(iface_name)
    if not missing:
        return ValidatorResult(passed=True, message=f"All interfaces in channel-group {channel_group}", score=1.0)
    return ValidatorResult(passed=False, message=f"Interfaces not in channel-group {channel_group}: {missing}", score=0.0, details={"missing": missing})


@register_validator("etherchannel_protocol", description="Check EtherChannel negotiation protocol", topic="ETHERCHANNEL",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "channel_group", "type": "integer", "required": True, "description": "Channel group number", "example": 1},
        {"name": "protocol", "type": "string", "required": True, "description": "Expected protocol (lacp, pagp)", "example": "lacp"},
    ])
def check_etherchannel_protocol(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    channel_group = int(params.get("channel_group", 0))
    protocol = params.get("protocol", "").lower()
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    mode_map = {"lacp": ["active", "passive"], "pagp": ["desirable", "auto"]}
    valid_modes = mode_map.get(protocol, [])
    for iface in device.running_config.interfaces:
        for cmd in iface.commands:
            if f"channel-group {channel_group} mode" in cmd.lower():
                for mode in valid_modes:
                    if mode in cmd.lower():
                        return ValidatorResult(passed=True, message=f"EtherChannel uses {protocol} ({mode}) on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"EtherChannel protocol '{protocol}' not found for group {channel_group}", score=0.0)
