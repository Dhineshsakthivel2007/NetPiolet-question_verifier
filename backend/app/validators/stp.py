"""STP validators — check spanning-tree mode, root bridge, priority, portfast, bpduguard."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator(
    "stp_mode",
    description="Check the spanning-tree mode configured on a device",
    topic="STP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "expected_mode", "type": "string", "required": True, "description": "Expected STP mode (pvst, rapid-pvst, mst)", "example": "rapid-pvst"},
    ],
)
def check_stp_mode(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    expected_mode = params.get("expected_mode", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    if device.running_config.has_global_command(f"spanning-tree mode {expected_mode}"):
        return ValidatorResult(passed=True, message=f"STP mode is '{expected_mode}' on {device_name}", score=1.0)
    found = None
    for cmd in device.running_config.find_global_commands("spanning-tree mode"):
        found = cmd
    return ValidatorResult(passed=False, message=f"STP mode '{expected_mode}' not found on {device_name}", score=0.0, details={"expected": expected_mode, "found": found})


@register_validator(
    "stp_root_bridge",
    description="Check that a device is configured as the root bridge for a VLAN",
    topic="STP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "vlan_id", "type": "integer", "required": True, "description": "VLAN ID for root bridge", "example": 1},
    ],
)
def check_stp_root_bridge(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    vlan_id = int(params.get("vlan_id", 1))
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    # Check for 'spanning-tree vlan X root primary' or 'spanning-tree vlan X priority 0/4096/8192/...'
    if device.running_config.has_global_command(f"spanning-tree vlan {vlan_id} root primary"):
        return ValidatorResult(passed=True, message=f"{device_name} is root bridge for VLAN {vlan_id}", score=1.0)
    # Also check for very low priority (0, 4096, 8192, 12288, 16384)
    for cmd in device.running_config.find_global_commands(f"spanning-tree vlan {vlan_id} priority"):
        parts = cmd.split()
        if len(parts) >= 4:
            try:
                priority = int(parts[-1])
                if priority <= 24576:
                    return ValidatorResult(passed=True, message=f"{device_name} has low STP priority {priority} for VLAN {vlan_id}", score=1.0, details={"priority": priority})
            except ValueError:
                pass
    return ValidatorResult(passed=False, message=f"{device_name} is not configured as root bridge for VLAN {vlan_id}", score=0.0)


@register_validator(
    "stp_priority",
    description="Check the STP priority for a specific VLAN on a device",
    topic="STP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "vlan_id", "type": "integer", "required": True, "description": "VLAN ID", "example": 1},
        {"name": "priority", "type": "integer", "required": True, "description": "Expected bridge priority", "example": 4096},
    ],
)
def check_stp_priority(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    vlan_id = int(params.get("vlan_id", 1))
    expected_priority = int(params.get("priority", 32768))
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    if device.running_config.has_global_command(f"spanning-tree vlan {vlan_id} priority {expected_priority}"):
        return ValidatorResult(passed=True, message=f"STP priority {expected_priority} set for VLAN {vlan_id} on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"STP priority {expected_priority} not found for VLAN {vlan_id} on {device_name}", score=0.0)


@register_validator(
    "stp_portfast",
    description="Check that PortFast is enabled on an interface",
    topic="STP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "FastEthernet0/1"},
    ],
)
def check_stp_portfast(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command("spanning-tree portfast"):
        return ValidatorResult(passed=True, message=f"PortFast enabled on {interface}", score=1.0)
    # Also check global portfast default
    if device.running_config.has_global_command("spanning-tree portfast default"):
        return ValidatorResult(passed=True, message=f"PortFast enabled globally (portfast default)", score=1.0)
    return ValidatorResult(passed=False, message=f"PortFast not enabled on {interface}", score=0.0)


@register_validator(
    "stp_bpduguard",
    description="Check that BPDU Guard is enabled on an interface",
    topic="STP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Switch0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "FastEthernet0/1"},
    ],
)
def check_stp_bpduguard(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command("spanning-tree bpduguard enable"):
        return ValidatorResult(passed=True, message=f"BPDU Guard enabled on {interface}", score=1.0)
    if device.running_config.has_global_command("spanning-tree portfast bpduguard default"):
        return ValidatorResult(passed=True, message=f"BPDU Guard enabled globally", score=1.0)
    return ValidatorResult(passed=False, message=f"BPDU Guard not enabled on {interface}", score=0.0)
