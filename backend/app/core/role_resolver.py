"""
Dynamic Device Role Resolver — maps logical roles to actual device names.

Instead of hardcoding device names like "R1" or "Switch0", evaluation plans
use logical roles like "router_1", "edge_router", "main_switch", etc.
This module resolves those roles to actual device names from the parsed network.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.core.network_models import Device, ParsedNetwork

logger = logging.getLogger(__name__)


@dataclass
class DeviceRoleMap:
    """Bidirectional mapping between roles and device names."""

    role_to_device: dict[str, str] = field(default_factory=dict)
    device_to_roles: dict[str, list[str]] = field(default_factory=dict)

    def add(self, role: str, device_name: str) -> None:
        self.role_to_device[role] = device_name
        self.device_to_roles.setdefault(device_name, []).append(role)

    def resolve(self, role_or_name: str) -> str | None:
        """Resolve a role to device name. If it's already a device name, return it."""
        # Try as role first
        if role_or_name in self.role_to_device:
            return self.role_to_device[role_or_name]
        return None

    def to_dict(self) -> dict[str, str]:
        return dict(self.role_to_device)


def _has_default_route(device: Device) -> bool:
    """Check if device has a default route configured."""
    rc = device.running_config
    for cmd in rc.find_global_commands("ip route"):
        if "0.0.0.0" in cmd:
            return True
    return rc.has_global_command("ip route 0.0.0.0")


def _has_nat(device: Device) -> bool:
    """Check if device has NAT configured."""
    rc = device.running_config
    for iface in rc.interfaces:
        if iface.has_command("ip nat inside") or iface.has_command("ip nat outside"):
            return True
    return False


def _has_routing_protocol(device: Device, protocol: str = "") -> bool:
    """Check if device runs a routing protocol."""
    rc = device.running_config
    if protocol:
        return bool(rc.get_all_sections(f"router {protocol}"))
    for p in ("ospf", "rip", "eigrp", "bgp"):
        if rc.get_all_sections(f"router {p}"):
            return True
    return False


def _has_trunk(device: Device) -> bool:
    """Check if device has any trunk ports."""
    for iface in device.running_config.interfaces:
        if iface.has_command("switchport mode trunk"):
            return True
    return False


def _has_only_access_ports(device: Device) -> bool:
    """Check if device has only access ports (no trunks)."""
    has_any = False
    for iface in device.running_config.interfaces:
        if iface.has_command("switchport mode trunk"):
            return False
        if iface.has_command("switchport mode access"):
            has_any = True
    return has_any


def _count_links(network: ParsedNetwork, device: Device) -> int:
    return len(network.get_links_for_device(device))


def resolve_roles(network: ParsedNetwork) -> DeviceRoleMap:
    """Analyze a parsed network and assign logical roles to all devices.

    Role naming convention:
    - Positional: router_1, router_2, switch_1, switch_2, pc_1, etc.
    - Functional: edge_router, branch_router, core_switch, access_switch, etc.
    - Hostname-based: the actual running-config hostname as a role too.

    Returns:
        DeviceRoleMap with all resolved roles.
    """
    role_map = DeviceRoleMap()

    routers = network.routers
    switches = network.switches
    pcs = network.pcs
    servers = network.get_devices_by_type("Server")

    # --- Positional roles (always assigned) ---
    for i, r in enumerate(routers, 1):
        role_map.add(f"router_{i}", r.name)
        # Also add hostname from running config as a role
        hostname = r.running_config.hostname
        if hostname and hostname.lower() != r.name.lower():
            role_map.add(hostname.lower(), r.name)
        # Add the actual name as a role too (for backward compat)
        role_map.add(r.name.lower(), r.name)

    for i, s in enumerate(switches, 1):
        role_map.add(f"switch_{i}", s.name)
        hostname = s.running_config.hostname
        if hostname and hostname.lower() != s.name.lower():
            role_map.add(hostname.lower(), s.name)
        role_map.add(s.name.lower(), s.name)

    for i, p in enumerate(pcs, 1):
        role_map.add(f"pc_{i}", p.name)
        role_map.add(p.name.lower(), p.name)

    for i, s in enumerate(servers, 1):
        role_map.add(f"server_{i}", s.name)
        role_map.add(s.name.lower(), s.name)

    # --- Functional roles for routers ---
    edge_assigned = False
    for r in routers:
        if (_has_default_route(r) or _has_nat(r)) and not edge_assigned:
            role_map.add("edge_router", r.name)
            role_map.add("gateway_router", r.name)
            edge_assigned = True
        elif _has_routing_protocol(r):
            # Could be branch or internal router
            if not role_map.resolve("branch_router"):
                role_map.add("branch_router", r.name)
            elif not role_map.resolve("internal_router"):
                role_map.add("internal_router", r.name)

    # If no edge router found, first router is main_router
    if not edge_assigned and routers:
        role_map.add("main_router", routers[0].name)

    # --- Functional roles for switches ---
    core_assigned = False
    for s in switches:
        if _has_trunk(s) and not core_assigned:
            role_map.add("core_switch", s.name)
            role_map.add("main_switch", s.name)
            role_map.add("distribution_switch", s.name)
            core_assigned = True
        elif _has_only_access_ports(s):
            if not role_map.resolve("access_switch"):
                role_map.add("access_switch", s.name)

    # If no core switch found, first switch is main
    if not core_assigned and switches:
        role_map.add("main_switch", switches[0].name)

    # --- Common aliases ---
    # R1, R2, R3... aliases
    for i, r in enumerate(routers, 1):
        role_map.add(f"r{i}", r.name)

    # SW1, SW2, SW3... aliases
    for i, s in enumerate(switches, 1):
        role_map.add(f"sw{i}", s.name)
        role_map.add(f"s{i}", s.name)

    logger.info("Resolved %d device roles: %s", len(role_map.role_to_device), role_map.to_dict())
    return role_map


def resolve_device_param(
    network: ParsedNetwork,
    role_map: DeviceRoleMap,
    params: dict,
) -> tuple[str | None, str | None]:
    """Resolve 'device' or 'device_role' param to actual device name.

    Priority:
    1. If 'device_role' exists → resolve via role_map
    2. If 'device' exists and is found in network → use directly
    3. If 'device' exists but NOT found → try as a role in role_map
    4. If 'device' exists but NOT found → try fuzzy match by type (R1→Router)

    Returns:
        (resolved_device_name, error_message)
    """
    device_role = params.get("device_role")
    device_name = params.get("device")

    # Case 1: device_role specified
    if device_role:
        resolved = role_map.resolve(device_role.lower())
        if resolved:
            return resolved, None
        return None, f"Unable to resolve device role '{device_role}'. Available roles: {', '.join(sorted(role_map.role_to_device.keys())[:10])}"

    # Case 2: device name specified
    if device_name:
        # Direct match
        if network.get_device_by_name(device_name):
            return device_name, None

        # Try as a role
        resolved = role_map.resolve(device_name.lower())
        if resolved:
            return resolved, None

        # Fuzzy: "R1" → first router, "SW1" → first switch
        name_lower = device_name.lower().strip()
        if name_lower.startswith("r") and name_lower[1:].isdigit():
            idx = int(name_lower[1:])
            routers = network.routers
            if 0 < idx <= len(routers):
                return routers[idx - 1].name, None
        if name_lower.startswith(("sw", "s")) and any(c.isdigit() for c in name_lower):
            digits = "".join(c for c in name_lower if c.isdigit())
            if digits:
                idx = int(digits)
                switches = network.switches
                if 0 < idx <= len(switches):
                    return switches[idx - 1].name, None

        # List available devices
        available = [d.name for d in network.devices]
        return None, f"Device '{device_name}' not found. Available devices: {', '.join(available)}"

    # No device specified at all
    return None, "No 'device' or 'device_role' specified in check params"
