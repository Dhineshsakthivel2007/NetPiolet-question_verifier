"""Connectivity validators — check subnets, topology links, gateways."""

from __future__ import annotations

import ipaddress

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("same_subnet", description="Check that two interfaces are on the same subnet", topic="CONNECTIVITY",
    param_schema=[
        {"name": "device1", "type": "string", "required": True, "description": "First device hostname", "example": "Router0"},
        {"name": "interface1", "type": "string", "required": True, "description": "First interface", "example": "GigabitEthernet0/0"},
        {"name": "device2", "type": "string", "required": True, "description": "Second device hostname", "example": "Router1"},
        {"name": "interface2", "type": "string", "required": True, "description": "Second interface", "example": "GigabitEthernet0/0"},
    ])
def check_same_subnet(network: ParsedNetwork, **params) -> ValidatorResult:
    d1_name = params.get("device1", "")
    i1_name = params.get("interface1", "")
    d2_name = params.get("device2", "")
    i2_name = params.get("interface2", "")

    d1 = network.get_device_by_name(d1_name)
    d2 = network.get_device_by_name(d2_name)
    if not d1:
        return ValidatorResult(passed=False, message=f"Device '{d1_name}' not found", score=0.0)
    if not d2:
        return ValidatorResult(passed=False, message=f"Device '{d2_name}' not found", score=0.0)

    i1 = d1.running_config.get_interface(i1_name)
    i2 = d2.running_config.get_interface(i2_name)
    if not i1:
        return ValidatorResult(passed=False, message=f"Interface '{i1_name}' not found on {d1_name}", score=0.0)
    if not i2:
        return ValidatorResult(passed=False, message=f"Interface '{i2_name}' not found on {d2_name}", score=0.0)

    ip1_str = i1.get_command_value("ip address")
    ip2_str = i2.get_command_value("ip address")
    if not ip1_str or not ip2_str:
        return ValidatorResult(passed=False, message="Could not determine IP addresses", score=0.0, details={"ip1": ip1_str, "ip2": ip2_str})

    try:
        parts1 = ip1_str.split()
        parts2 = ip2_str.split()
        net1 = ipaddress.IPv4Network(f"{parts1[0]}/{parts1[1]}", strict=False)
        net2 = ipaddress.IPv4Network(f"{parts2[0]}/{parts2[1]}", strict=False)
        if net1.network_address == net2.network_address and net1.prefixlen == net2.prefixlen:
            return ValidatorResult(passed=True, message=f"Both interfaces are on subnet {net1}", score=1.0, details={"subnet": str(net1)})
        return ValidatorResult(passed=False, message="Interfaces are on different subnets", score=0.0, details={"subnet1": str(net1), "subnet2": str(net2)})
    except (ValueError, IndexError) as e:
        return ValidatorResult(passed=False, message=f"Error parsing IPs: {e}", score=0.0)


@register_validator("topology_link_exists", description="Check that a physical link exists between two devices", topic="CONNECTIVITY",
    param_schema=[
        {"name": "device1", "type": "string", "required": True, "description": "First device hostname", "example": "Switch0"},
        {"name": "port1", "type": "string", "required": True, "description": "Port on first device", "example": "FastEthernet0/24"},
        {"name": "device2", "type": "string", "required": True, "description": "Second device hostname", "example": "Switch1"},
        {"name": "port2", "type": "string", "required": True, "description": "Port on second device", "example": "FastEthernet0/24"},
    ])
def check_topology_link_exists(network: ParsedNetwork, **params) -> ValidatorResult:
    d1_name = params.get("device1", "")
    p1 = params.get("port1", "")
    d2_name = params.get("device2", "")
    p2 = params.get("port2", "")

    d1 = network.get_device_by_name(d1_name)
    d2 = network.get_device_by_name(d2_name)
    if not d1:
        return ValidatorResult(passed=False, message=f"Device '{d1_name}' not found", score=0.0)
    if not d2:
        return ValidatorResult(passed=False, message=f"Device '{d2_name}' not found", score=0.0)

    for link in network.links:
        fwd = (link.from_device_ref == d1.save_ref_id and link.to_device_ref == d2.save_ref_id and
               link.from_port.lower() == p1.lower() and link.to_port.lower() == p2.lower())
        rev = (link.from_device_ref == d2.save_ref_id and link.to_device_ref == d1.save_ref_id and
               link.from_port.lower() == p2.lower() and link.to_port.lower() == p1.lower())
        if fwd or rev:
            return ValidatorResult(passed=True, message=f"Link exists: {d1_name}:{p1} <-> {d2_name}:{p2}", score=1.0)

    return ValidatorResult(passed=False, message=f"No link between {d1_name}:{p1} and {d2_name}:{p2}", score=0.0)


@register_validator("gateway_configured", description="Check that a device has a default gateway configured", topic="CONNECTIVITY",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "PC0"},
        {"name": "gateway_ip", "type": "string", "required": True, "description": "Expected gateway IP", "example": "192.168.1.1"},
    ])
def check_gateway_configured(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    gateway_ip = params.get("gateway_ip", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    if device.gateway == gateway_ip:
        return ValidatorResult(passed=True, message=f"Gateway {gateway_ip} configured on {device_name}", score=1.0)
    # Check port-level gateway
    for port in device.ports:
        if port.gateway == gateway_ip:
            return ValidatorResult(passed=True, message=f"Gateway {gateway_ip} on port {port.name}", score=1.0)
    return ValidatorResult(passed=False, message=f"Gateway {gateway_ip} not found on {device_name}", score=0.0, details={"device_gateway": device.gateway})
