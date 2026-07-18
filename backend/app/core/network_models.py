"""
Data classes representing a parsed Packet Tracer network topology.

These are the shared data structures used by the XML parser, evaluation engine,
and all validators. They are intentionally plain dataclasses (not ORM models)
to keep the core engine decoupled from the database.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PortInfo:
    """Physical port on a device."""

    name: str = ""
    port_type: str = ""  # eCopperFastEthernet, eCopperGigabitEthernet, eSerial, etc.
    mac_address: str = ""
    bia: str = ""  # Burned-in address
    ip: str = ""
    subnet: str = ""
    gateway: str = ""
    dns: str = ""
    dhcp_enabled: bool = False
    bandwidth: int = 0
    full_duplex: bool = False
    power: bool = False
    ipv6_enabled: bool = False
    ipv6_link_local: str = ""
    ipv6_addresses: list[str] = field(default_factory=list)
    clock_rate: int = 0
    channel: int = 0
    coverage_range: int = 0
    description: str = ""


@dataclass
class VlanInfo:
    """VLAN configured on a device."""

    number: int = 0
    name: str = ""
    rspan: int = 0


@dataclass
class VtpInfo:
    """VTP configuration."""

    domain_name: str = ""
    mode: int = 0  # 0=server, 1=client, 2=transparent
    version: int = 1
    password: str = ""
    config_revision: int = 0

    @property
    def mode_name(self) -> str:
        return {0: "server", 1: "client", 2: "transparent"}.get(self.mode, "unknown")


@dataclass
class SecurityInfo:
    """Device security settings."""

    key_name: str = ""
    rsa_key: str = ""
    enabled: bool = False
    modulus_bits: int = 0


@dataclass
class InterfaceConfig:
    """Parsed interface configuration block from running-config.

    Each interface section from the running-config is parsed into one of these.
    Contains the interface name and the list of commands under it.
    """

    name: str = ""  # e.g. "FastEthernet0/1", "GigabitEthernet0/0", "Vlan10"
    commands: list[str] = field(default_factory=list)

    def has_command(self, command: str) -> bool:
        """Check if a command (or substring) exists in this interface's config."""
        cmd_lower = command.strip().lower()
        return any(cmd_lower in line.strip().lower() for line in self.commands)

    def get_command_value(self, prefix: str) -> str | None:
        """Get the value portion of a command matching a prefix.

        Example: get_command_value("ip address") might return "192.168.1.1 255.255.255.0"
        """
        prefix_lower = prefix.strip().lower()
        for line in self.commands:
            stripped = line.strip().lower()
            if stripped.startswith(prefix_lower):
                return line.strip()[len(prefix):].strip()
        return None


@dataclass
class RunningConfig:
    """Parsed running configuration for a device.

    Provides both the raw lines and structured interface blocks,
    plus convenience methods for common lookups.
    """

    raw_lines: list[str] = field(default_factory=list)
    hostname: str = ""
    interfaces: list[InterfaceConfig] = field(default_factory=list)

    # Global config sections extracted from running-config
    global_commands: list[str] = field(default_factory=list)

    def get_interface(self, name: str) -> InterfaceConfig | None:
        """Find an interface config by name (case-insensitive)."""
        name_lower = name.strip().lower()
        for iface in self.interfaces:
            if iface.name.lower() == name_lower:
                return iface
        return None

    def has_global_command(self, command: str) -> bool:
        """Check if a global command exists in the config."""
        cmd_lower = command.strip().lower()
        return any(cmd_lower in line.strip().lower() for line in self.global_commands)

    def find_global_commands(self, prefix: str) -> list[str]:
        """Find all global commands matching a prefix."""
        prefix_lower = prefix.strip().lower()
        return [
            line.strip()
            for line in self.global_commands
            if line.strip().lower().startswith(prefix_lower)
        ]

    def get_section(self, start_keyword: str) -> list[str]:
        """Extract a config section (e.g., 'router ospf', 'router rip').

        Returns all lines from the start keyword until the next top-level command.
        """
        lines: list[str] = []
        in_section = False
        start_lower = start_keyword.strip().lower()

        for line in self.raw_lines:
            stripped = line.strip().lower()

            if stripped.startswith(start_lower):
                in_section = True
                lines.append(line.strip())
                continue

            if in_section:
                if line.startswith(" ") or line.startswith("\t"):
                    lines.append(line.strip())
                elif stripped == "!" or stripped == "":
                    continue
                else:
                    break

        return lines

    def get_all_sections(self, start_keyword: str) -> list[list[str]]:
        """Extract ALL config sections matching a keyword.

        Useful for protocols that may have multiple instances
        (e.g., multiple 'router ospf' processes).
        """
        sections: list[list[str]] = []
        current_section: list[str] = []
        in_section = False
        start_lower = start_keyword.strip().lower()

        for line in self.raw_lines:
            stripped = line.strip().lower()

            if stripped.startswith(start_lower):
                if in_section and current_section:
                    sections.append(current_section)
                in_section = True
                current_section = [line.strip()]
                continue

            if in_section:
                if line.startswith(" ") or line.startswith("\t"):
                    current_section.append(line.strip())
                elif stripped == "!" or stripped == "":
                    continue
                else:
                    if current_section:
                        sections.append(current_section)
                    current_section = []
                    in_section = False

        if in_section and current_section:
            sections.append(current_section)

        return sections


@dataclass
class Device:
    """A network device (router, switch, PC, etc.) from the topology."""

    name: str = ""
    device_type: str = ""  # Pc, Switch, Router, Server, Laptop, etc.
    model: str = ""  # e.g. "2960-24TT", "PC-PT"
    custom_model: str = ""
    save_ref_id: str = ""
    serial_number: str = ""
    power: bool = True
    gateway: str = ""

    # Parsed data
    ports: list[PortInfo] = field(default_factory=list)
    vlans: list[VlanInfo] = field(default_factory=list)
    vtp: VtpInfo = field(default_factory=VtpInfo)
    security: SecurityInfo = field(default_factory=SecurityInfo)
    running_config: RunningConfig = field(default_factory=RunningConfig)

    # Position (logical workspace)
    x: float = 0.0
    y: float = 0.0

    def get_port(self, name: str) -> PortInfo | None:
        """Find a port by name (case-insensitive)."""
        name_lower = name.strip().lower()
        for port in self.ports:
            if port.name.lower() == name_lower:
                return port
        return None

    def get_vlan(self, number: int) -> VlanInfo | None:
        """Find a VLAN by number."""
        for vlan in self.vlans:
            if vlan.number == number:
                return vlan
        return None

    @property
    def is_router(self) -> bool:
        return self.device_type.lower() in ("router",)

    @property
    def is_switch(self) -> bool:
        return self.device_type.lower() in ("switch",)

    @property
    def is_end_device(self) -> bool:
        return self.device_type.lower() in ("pc", "laptop", "server", "printer", "pda")


@dataclass
class Link:
    """A physical cable link between two devices."""

    link_type: str = ""  # eCopper, eFiber, etc.
    cable_type: str = ""  # eStraightThrough, eCrossOver, etc.
    length: float = 0.0
    functional: bool = True

    from_device_ref: str = ""  # SAVE_REF_ID
    from_port: str = ""
    to_device_ref: str = ""  # SAVE_REF_ID
    to_port: str = ""


@dataclass
class ParsedNetwork:
    """Complete parsed network topology from a Packet Tracer file.

    This is the top-level data structure passed to the evaluation engine
    and all validators.
    """

    version: str = ""
    devices: list[Device] = field(default_factory=list)
    links: list[Link] = field(default_factory=list)

    def get_device_by_name(self, name: str) -> Device | None:
        """Find a device by its hostname (case-insensitive)."""
        name_lower = name.strip().lower()
        for device in self.devices:
            if device.name.lower() == name_lower:
                return device
        return None

    def get_device_by_ref(self, ref_id: str) -> Device | None:
        """Find a device by its SAVE_REF_ID."""
        for device in self.devices:
            if device.save_ref_id == ref_id:
                return device
        return None

    def get_devices_by_type(self, device_type: str) -> list[Device]:
        """Find all devices of a given type."""
        type_lower = device_type.strip().lower()
        return [d for d in self.devices if d.device_type.lower() == type_lower]

    def get_links_for_device(self, device: Device) -> list[Link]:
        """Find all links connected to a device."""
        return [
            link
            for link in self.links
            if link.from_device_ref == device.save_ref_id
            or link.to_device_ref == device.save_ref_id
        ]

    @property
    def routers(self) -> list[Device]:
        return self.get_devices_by_type("Router")

    @property
    def switches(self) -> list[Device]:
        return self.get_devices_by_type("Switch")

    @property
    def pcs(self) -> list[Device]:
        return self.get_devices_by_type("Pc")
