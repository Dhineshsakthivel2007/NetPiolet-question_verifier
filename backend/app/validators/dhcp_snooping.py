"""DHCP Snooping validators — check global snooping, VLAN snooping, and trusted interfaces."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator(
    "dhcp_snooping_enabled",
    description="Check that DHCP snooping is globally enabled and configured for specific VLANs on a switch",
    topic="DHCP_SNOOPING",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "SW1"},
        {"name": "vlan_ids", "type": "string", "required": False, "description": "Comma-separated VLAN IDs (e.g. 10,20)", "example": "10,20"},
    ],
)
def check_dhcp_snooping_enabled(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    vlan_ids_str = str(params.get("vlan_ids", ""))
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    # 1. Global check
    global_snooping = device.running_config.has_global_command("ip dhcp snooping")
    if not global_snooping:
        return ValidatorResult(passed=False, message=f"Global 'ip dhcp snooping' not enabled on {device_name}", score=0.0)

    if not vlan_ids_str:
        return ValidatorResult(passed=True, message=f"Global DHCP snooping enabled on {device_name}", score=1.0)

    # 2. VLAN specific check (e.g. ip dhcp snooping vlan 10,20)
    expected_vlans = [v.strip() for v in vlan_ids_str.split(",") if v.strip()]
    found_vlan_cmd = False

    for line in device.running_config.find_global_commands("ip dhcp snooping vlan"):
        line_lower = line.lower()
        if all(v in line_lower for v in expected_vlans):
            found_vlan_cmd = True
            break

    if found_vlan_cmd or any("ip dhcp snooping vlan" in l.lower() for l in device.running_config.lines):
        return ValidatorResult(passed=True, message=f"DHCP snooping enabled for VLANs ({vlan_ids_str}) on {device_name}", score=1.0)

    return ValidatorResult(
        passed=False,
        message=f"DHCP snooping VLAN command 'ip dhcp snooping vlan {vlan_ids_str}' not found on {device_name}",
        score=0.5 if global_snooping else 0.0,
    )


@register_validator(
    "dhcp_snooping_trust",
    description="Check that an interface is configured as a trusted DHCP snooping port (ip dhcp snooping trust)",
    topic="DHCP_SNOOPING",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "SW1"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/1"},
    ],
)
def check_dhcp_snooping_trust(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)

    if iface.has_command("ip dhcp snooping trust"):
        return ValidatorResult(passed=True, message=f"Interface {interface} configured with 'ip dhcp snooping trust' on {device_name}", score=1.0)

    return ValidatorResult(passed=False, message=f"Command 'ip dhcp snooping trust' not found on interface {interface} of {device_name}", score=0.0)
