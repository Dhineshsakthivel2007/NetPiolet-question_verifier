"""DNS validators — check DNS server, domain lookup, static host entries, and DNS services."""

from __future__ import annotations

from app.core.network_models import ParsedNetwork
from app.validators.base import ValidatorResult, register_validator


@register_validator(
    "dns_server_configured",
    description="Check that a DNS server IP is configured on a device",
    topic="DNS",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "dns_ip", "type": "string", "required": True, "description": "DNS server IP address", "example": "192.168.1.10"},
    ],
)
def check_dns_server_configured(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    dns_ip = params.get("dns_ip", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    # 1. Check Cisco IOS 'ip name-server <ip>' command
    if device.running_config.has_global_command(f"ip name-server {dns_ip}") or any(
        f"ip name-server" in line.lower() and dns_ip in line for line in device.running_config.lines
    ):
        return ValidatorResult(passed=True, message=f"DNS server {dns_ip} configured on {device_name}", score=1.0)

    # 2. Check host device ports / DNS server IP setting
    for port in device.ports:
        if getattr(port, "dns_server", None) == dns_ip or getattr(port, "dns_ip", None) == dns_ip:
            return ValidatorResult(passed=True, message=f"DNS server {dns_ip} configured on port {port.name} of {device_name}", score=1.0)

    return ValidatorResult(passed=False, message=f"DNS server {dns_ip} not configured on {device_name}", score=0.0)


@register_validator(
    "dns_domain_lookup",
    description="Check that IP domain lookup is enabled on a Cisco device",
    topic="DNS",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
    ],
)
def check_dns_domain_lookup(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    if device.running_config.has_global_command("ip domain lookup") or device.running_config.has_global_command("ip domain-lookup"):
        return ValidatorResult(passed=True, message=f"Domain lookup is enabled on {device_name}", score=1.0)

    if device.running_config.has_global_command("no ip domain lookup") or device.running_config.has_global_command("no ip domain-lookup"):
        return ValidatorResult(passed=False, message=f"Domain lookup is explicitly disabled on {device_name}", score=0.0)

    # Default in Cisco IOS is domain lookup enabled unless explicitly disabled
    return ValidatorResult(passed=True, message=f"Domain lookup enabled by default on {device_name}", score=1.0)


@register_validator(
    "dns_host_entry",
    description="Check static DNS host mapping (ip host <hostname> <ip>)",
    topic="DNS",
    param_schema=[
        {"name": "device", "type": "string", "required": True, "description": "Device hostname", "example": "Router0"},
        {"name": "hostname", "type": "string", "required": True, "description": "Domain/Host name", "example": "server.cisco.com"},
        {"name": "ip", "type": "string", "required": True, "description": "Mapped IP address", "example": "192.168.1.100"},
    ],
)
def check_dns_host_entry(network: ParsedNetwork, **params) -> ValidatorResult:
    device_name = params.get("device", "")
    host_name = params.get("hostname", "")
    ip_addr = params.get("ip", "")
    device = network.get_device_by_name(device_name)
    if not device:
        return ValidatorResult(passed=False, message=f"Device '{device_name}' not found", score=0.0)

    expected = f"ip host {host_name} {ip_addr}".lower()
    for line in device.running_config.lines:
        clean_line = " ".join(line.lower().split())
        if expected in clean_line:
            return ValidatorResult(passed=True, message=f"Static DNS host entry '{host_name} -> {ip_addr}' found on {device_name}", score=1.0)

    return ValidatorResult(passed=False, message=f"DNS host entry '{host_name} -> {ip_addr}' not found on {device_name}", score=0.0)
