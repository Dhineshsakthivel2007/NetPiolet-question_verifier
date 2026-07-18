"""DHCP validators — check pools, networks, default-router, DNS, excluded addresses, relay."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator("dhcp_pool", description="Check that a DHCP pool is configured on a device", topic="DHCP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "pool_name", "type": "string", "required": True, "description": "DHCP pool name", "example": "LAN_POOL"},
    ])
def check_dhcp_pool(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    pool_name = params.get("pool_name", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    section = device.running_config.get_section(f"ip dhcp pool {pool_name}")
    if section:
        return ValidatorResult(passed=True, message=f"DHCP pool '{pool_name}' configured on {device_name}", score=1.0)
    # Case-insensitive retry
    sections = device.running_config.get_all_sections("ip dhcp pool")
    for s in sections:
        if s and pool_name.lower() in s[0].lower():
            return ValidatorResult(passed=True, message=f"DHCP pool '{pool_name}' found on {device_name}", score=1.0)
    return ValidatorResult(passed=False, message=f"DHCP pool '{pool_name}' not found on {device_name}", score=0.0)


@register_validator("dhcp_network", description="Check the network statement in a DHCP pool", topic="DHCP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "pool_name", "type": "string", "required": True, "description": "DHCP pool name", "example": "LAN_POOL"},
        {"name": "network", "type": "string", "required": True, "description": "Network address", "example": "192.168.1.0"},
        {"name": "mask", "type": "string", "required": True, "description": "Subnet mask", "example": "255.255.255.0"},
    ])
def check_dhcp_network(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    pool_name = params.get("pool_name", "")
    net = params.get("_network_addr", "")
    mask = params.get("mask", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    section = device.running_config.get_section(f"ip dhcp pool {pool_name}")
    expected = f"network {net} {mask}"
    for line in (section or []):
        if expected.lower() in line.lower():
            return ValidatorResult(passed=True, message=f"DHCP pool network {net} {mask} configured", score=1.0)
    return ValidatorResult(passed=False, message=f"Network {net} {mask} not found in DHCP pool '{pool_name}'", score=0.0)


@register_validator("dhcp_default_router", description="Check the default-router in a DHCP pool", topic="DHCP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "pool_name", "type": "string", "required": True, "description": "DHCP pool name", "example": "LAN_POOL"},
        {"name": "gateway", "type": "string", "required": True, "description": "Default gateway IP", "example": "192.168.1.1"},
    ])
def check_dhcp_default_router(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    pool_name = params.get("pool_name", "")
    gateway = params.get("gateway", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    section = device.running_config.get_section(f"ip dhcp pool {pool_name}")
    for line in (section or []):
        if f"default-router {gateway}".lower() in line.lower():
            return ValidatorResult(passed=True, message=f"Default-router {gateway} configured in pool '{pool_name}'", score=1.0)
    return ValidatorResult(passed=False, message=f"Default-router {gateway} not found in pool '{pool_name}'", score=0.0)


@register_validator("dhcp_dns_server", description="Check the DNS server in a DHCP pool", topic="DHCP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "pool_name", "type": "string", "required": True, "description": "DHCP pool name", "example": "LAN_POOL"},
        {"name": "dns_ip", "type": "string", "required": True, "description": "DNS server IP", "example": "8.8.8.8"},
    ])
def check_dhcp_dns_server(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    pool_name = params.get("pool_name", "")
    dns_ip = params.get("dns_ip", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    section = device.running_config.get_section(f"ip dhcp pool {pool_name}")
    for line in (section or []):
        if f"dns-server {dns_ip}".lower() in line.lower():
            return ValidatorResult(passed=True, message=f"DNS server {dns_ip} configured in pool '{pool_name}'", score=1.0)
    return ValidatorResult(passed=False, message=f"DNS server {dns_ip} not found in pool '{pool_name}'", score=0.0)


@register_validator("dhcp_excluded", description="Check that DHCP excluded addresses are configured", topic="DHCP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "start_ip", "type": "string", "required": True, "description": "Start of excluded range", "example": "192.168.1.1"},
        {"name": "end_ip", "type": "string", "required": False, "description": "End of excluded range (optional for single IP)", "example": "192.168.1.10"},
    ])
def check_dhcp_excluded(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    start_ip = params.get("start_ip", "")
    end_ip = params.get("end_ip", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    if end_ip:
        expected = f"ip dhcp excluded-address {start_ip} {end_ip}"
    else:
        expected = f"ip dhcp excluded-address {start_ip}"
    if device.running_config.has_global_command(expected):
        return ValidatorResult(passed=True, message=f"DHCP excluded: {expected}", score=1.0)
    return ValidatorResult(passed=False, message=f"DHCP excluded address not found: {expected}", score=0.0)


@register_validator("dhcp_relay", description="Check DHCP relay (ip helper-address) on an interface", topic="DHCP",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "interface", "type": "string", "required": True, "description": "Interface name", "example": "GigabitEthernet0/0"},
        {"name": "server_ip", "type": "string", "required": True, "description": "DHCP server IP", "example": "10.0.0.1"},
    ])
def check_dhcp_relay(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    interface = params.get("interface", "")
    server_ip = params.get("server_ip", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)
    iface = device.running_config.get_interface(interface)
    if not iface:
        return ValidatorResult(passed=False, message=f"Interface '{interface}' not found on {device_name}", score=0.0)
    if iface.has_command(f"ip helper-address {server_ip}"):
        return ValidatorResult(passed=True, message=f"DHCP relay to {server_ip} on {interface}", score=1.0)
    return ValidatorResult(passed=False, message=f"DHCP relay to {server_ip} not found on {interface}", score=0.0)
