"""
XML Parser — Converts pka2xml output XML into ParsedNetwork objects.

Handles the Packet Tracer XML structure including devices, ports,
running-config, VLANs, VTP, links, and security settings.
"""

from __future__ import annotations

import re
import string
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from app.core.network_models import (
    Device,
    InterfaceConfig,
    Link,
    ParsedNetwork,
    PortInfo,
    RunningConfig,
    SecurityInfo,
    VlanInfo,
    VtpInfo,
)

# Device types considered "host" devices (simple port naming)
_HOST_TYPES = {"pc", "laptop", "server", "printer", "pda"}

# Device types considered "network" devices (slot-based port naming)
_NETWORK_TYPES = {"router", "switch", "accesspoint", "wirelessrouter", "dslmodem", "cloud", "sniffer"}

# Port type to interface name mapping
_HOST_PORT_MAP: dict[str, str] = {
    "eCopperEthernet": "Ethernet{}",
    "eCopperFastEthernet": "FastEthernet{}",
    "eCopperGigabitEthernet": "GigabitEthernet{}",
    "eSerial": "Serial{}",
    "eModem": "Modem{}",
}

_NETWORK_PORT_MAP: dict[str, str] = {
    "eCopperEthernet": "Ethernet0/{}",
    "eCopperFastEthernet": "FastEthernet0/{}",
    "eCopperGigabitEthernet": "GigabitEthernet0/{}",
    "eSerial": "Serial0/{}",
    "eModem": "Modem0/{}",
}


def _get_text(node: ET.Element, path: str, default: str = "") -> str:
    """Safely get text content of a child element."""
    el = node.find(path)
    return el.text.strip() if el is not None and el.text else default


def _get_bool(node: ET.Element, path: str, default: bool = False) -> bool:
    """Safely get boolean value from element text."""
    text = _get_text(node, path, "")
    if text.lower() in ("true", "1"):
        return True
    if text.lower() in ("false", "0"):
        return False
    return default


def _get_int(node: ET.Element, path: str, default: int = 0) -> int:
    """Safely get integer value from element text."""
    text = _get_text(node, path, "")
    try:
        return int(text)
    except (ValueError, TypeError):
        return default


def _get_float(node: ET.Element, path: str, default: float = 0.0) -> float:
    """Safely get float value from element text."""
    text = _get_text(node, path, "")
    try:
        return float(text)
    except (ValueError, TypeError):
        return default


def _clean_xml(data: str) -> str:
    """Remove non-printable characters from XML data."""
    return re.sub(f"[^{re.escape(string.printable)}]", "", data)


def _parse_running_config(engine_node: ET.Element) -> RunningConfig:
    """Parse RUNNINGCONFIG/LINE elements into a RunningConfig object."""
    rc = RunningConfig()
    config_node = engine_node.find("RUNNINGCONFIG")
    if config_node is None:
        return rc

    lines = [line.text if line.text else "" for line in config_node.findall("LINE")]
    rc.raw_lines = lines

    current_interface: InterfaceConfig | None = None
    in_section = False  # True when inside a sub-config block (line con, line vty, etc.)
    section_keyword = ""

    for line in lines:
        stripped = line.strip()

        # Skip empty lines and comment separators
        if not stripped or stripped == "!" or stripped == "end":
            if current_interface:
                rc.interfaces.append(current_interface)
                current_interface = None
            in_section = False
            continue

        # Extract hostname
        if stripped.startswith("hostname "):
            rc.hostname = stripped[len("hostname "):].strip()
            rc.global_commands.append(stripped)
            continue

        # Detect interface blocks
        if stripped.startswith("interface ") and not line.startswith(" "):
            if current_interface:
                rc.interfaces.append(current_interface)
            iface_name = stripped[len("interface "):].strip()
            current_interface = InterfaceConfig(name=iface_name)
            in_section = False
            continue

        # Detect line/router/other section blocks
        if not line.startswith(" ") and not line.startswith("\t"):
            if current_interface:
                rc.interfaces.append(current_interface)
                current_interface = None

            # Check for router/section commands
            if stripped.startswith(("router ", "line ", "ip access-list ", "ipv6 access-list ")):
                in_section = True
                section_keyword = stripped
                rc.global_commands.append(stripped)
                continue

            in_section = False
            rc.global_commands.append(stripped)
            continue

        # Indented lines belong to current context
        if current_interface:
            current_interface.commands.append(stripped)
        elif in_section:
            rc.global_commands.append(stripped)
        else:
            rc.global_commands.append(stripped)

    # Flush last interface
    if current_interface:
        rc.interfaces.append(current_interface)

    return rc


def _derive_port_name(
    port_type: str, index: int, device_type: str
) -> str:
    """Derive interface name from port type, index, and device type."""
    dt_lower = device_type.lower()

    if dt_lower in _HOST_TYPES:
        template = _HOST_PORT_MAP.get(port_type, "{}")
    elif dt_lower in _NETWORK_TYPES:
        template = _NETWORK_PORT_MAP.get(port_type, "{}")
    else:
        template = _HOST_PORT_MAP.get(port_type, "{}")

    return template.format(index)


def _parse_ports(engine_node: ET.Element, device_type: str, running_config: RunningConfig) -> list[PortInfo]:
    """Parse all PORT elements from the device engine node."""
    ports: list[PortInfo] = []

    # Collect interface names from running-config
    config_iface_names = [iface.name for iface in running_config.interfaces]

    # Find all PORT elements recursively
    all_ports = engine_node.findall(".//MODULE/PORT")
    if not all_ports:
        all_ports = engine_node.findall(".//SLOT/MODULE/PORT")
    if not all_ports:
        all_ports = engine_node.findall(".//PORT")

    # Filter out bluetooth and other non-network ports
    network_ports = []
    for p in all_ports:
        ptype = _get_text(p, "TYPE", "")
        if ptype and ptype != "eBluetooth":
            network_ports.append(p)

    # Count indices per port type for naming
    type_counts: dict[str, int] = {}

    for i, port_el in enumerate(network_ports):
        ptype = _get_text(port_el, "TYPE", "")

        # Calculate type-specific index
        if ptype not in type_counts:
            type_counts[ptype] = 0
        else:
            type_counts[ptype] += 1
        type_idx = type_counts[ptype]

        # Determine port name
        if i < len(config_iface_names):
            port_name = config_iface_names[i]
        else:
            port_name = _derive_port_name(ptype, type_idx, device_type)

        port = PortInfo(
            name=port_name,
            port_type=ptype,
            mac_address=_get_text(port_el, "MACADDRESS"),
            bia=_get_text(port_el, "BIA"),
            ip=_get_text(port_el, "IP"),
            subnet=_get_text(port_el, "SUBNET"),
            gateway=_get_text(port_el, "PORT_GATEWAY"),
            dns=_get_text(port_el, "PORT_DNS"),
            dhcp_enabled=_get_bool(port_el, "PORT_DHCP_ENABLE"),
            bandwidth=_get_int(port_el, "BANDWIDTH"),
            full_duplex=_get_bool(port_el, "FULLDUPLEX"),
            power=_get_bool(port_el, "POWER"),
            ipv6_enabled=_get_bool(port_el, "IPV6_ENABLED"),
            ipv6_link_local=_get_text(port_el, "IPV6_LINK_LOCAL"),
            clock_rate=_get_int(port_el, "CLOCKRATE"),
            channel=_get_int(port_el, "CHANNEL"),
            coverage_range=_get_int(port_el, "COVERAGERANGE"),
            description=_get_text(port_el, "DESCRIPTION"),
        )
        ports.append(port)

    return ports


def _parse_vlans(engine_node: ET.Element) -> list[VlanInfo]:
    """Parse VLAN elements from the engine node."""
    vlans: list[VlanInfo] = []

    # Try direct VLANS element first
    for vlan_el in engine_node.findall("VLANS/VLAN"):
        vlans.append(
            VlanInfo(
                number=int(vlan_el.get("number", "0")),
                name=vlan_el.get("name", ""),
                rspan=int(vlan_el.get("rspan", "0")),
            )
        )

    # If no direct VLANs found, try in FILE_MANAGER/vlan.dat
    if not vlans:
        for vlan_el in engine_node.findall(".//CVlanDatFileContent/VLANS/VLAN"):
            vlans.append(
                VlanInfo(
                    number=int(vlan_el.get("number", "0")),
                    name=vlan_el.get("name", ""),
                    rspan=int(vlan_el.get("rspan", "0")),
                )
            )

    return vlans


def _parse_vtp(engine_node: ET.Element) -> VtpInfo:
    """Parse VTP configuration from the engine node."""
    vtp_node = engine_node.find("VTP")
    if vtp_node is None:
        # Try in vlan.dat file content
        vtp_node = engine_node.find(".//CVlanDatFileContent/VTP")
    if vtp_node is None:
        return VtpInfo()

    return VtpInfo(
        domain_name=_get_text(vtp_node, "DOMAIN_NAME"),
        mode=_get_int(vtp_node, "MODE"),
        version=_get_int(vtp_node, "VERSION", 1),
        password=_get_text(vtp_node, "PASSWORD"),
        config_revision=_get_int(vtp_node, "CONFIG_REVISION"),
    )


def _parse_security(engine_node: ET.Element) -> SecurityInfo:
    """Parse security settings from the engine node."""
    sec_node = engine_node.find("SECURITY")
    if sec_node is None:
        return SecurityInfo()

    return SecurityInfo(
        key_name=_get_text(sec_node, "KEY_NAME"),
        rsa_key=_get_text(sec_node, "RSA_KEY"),
        enabled=_get_bool(sec_node, "ENABLED"),
        modulus_bits=_get_int(sec_node, "MODULUS_BITS"),
    )


def _parse_device(device_node: ET.Element) -> Device:
    """Parse a single DEVICE element into a Device object."""
    engine = device_node.find("ENGINE")
    if engine is None:
        return Device()

    type_el = engine.find("TYPE")
    device_type = type_el.text.strip() if type_el is not None and type_el.text else ""
    model = type_el.get("model", "") if type_el is not None else ""
    custom_model = type_el.get("customModel", "") if type_el is not None else ""

    # Parse running config first (needed for port naming)
    running_config = _parse_running_config(engine)

    # Extract position
    x, y = 0.0, 0.0
    workspace = device_node.find("WORKSPACE/LOGICAL")
    if workspace is not None:
        x = _get_float(workspace, "X")
        y = _get_float(workspace, "Y")

    device = Device(
        name=_get_text(engine, "NAME"),
        device_type=device_type,
        model=model,
        custom_model=custom_model,
        save_ref_id=_get_text(engine, "SAVE_REF_ID"),
        serial_number=_get_text(engine, "SERIALNUMBER"),
        power=_get_bool(engine, "POWER", True),
        gateway=_get_text(engine, "GATEWAY"),
        ports=_parse_ports(engine, device_type, running_config),
        vlans=_parse_vlans(engine),
        vtp=_parse_vtp(engine),
        security=_parse_security(engine),
        running_config=running_config,
        x=x,
        y=y,
    )

    # Use running-config hostname if available
    if running_config.hostname:
        device.name = running_config.hostname

    return device


def _parse_links(network_node: ET.Element) -> list[Link]:
    """Parse all LINK elements from the NETWORK/LINKS section."""
    links: list[Link] = []
    links_node = network_node.find("LINKS")
    if links_node is None:
        return links

    for link_el in links_node.findall("LINK"):
        link_type = _get_text(link_el, "TYPE")
        cable = link_el.find("CABLE")
        if cable is None:
            continue

        # Two PORT elements: first = FROM port, second = TO port
        port_elements = cable.findall("PORT")
        from_port = port_elements[0].text if len(port_elements) > 0 and port_elements[0].text else ""
        to_port = port_elements[1].text if len(port_elements) > 1 and port_elements[1].text else ""

        # Cable TYPE is the second TYPE element inside CABLE
        type_elements = cable.findall("TYPE")
        cable_type = ""
        if len(type_elements) > 0 and type_elements[0].text:
            cable_type = type_elements[0].text

        link = Link(
            link_type=link_type,
            cable_type=cable_type,
            length=_get_float(cable, "LENGTH"),
            functional=_get_bool(cable, "FUNCTIONAL", True),
            from_device_ref=_get_text(cable, "FROM"),
            from_port=from_port,
            to_device_ref=_get_text(cable, "TO"),
            to_port=to_port,
        )
        links.append(link)

    return links


def _parse_root(root: ET.Element) -> ParsedNetwork:
    """Parse the root XML element into a ParsedNetwork."""
    # Handle both PACKETTRACER5 wrapper and direct NETWORK
    network_node = root.find("NETWORK")
    if network_node is None:
        network_node = root.find("PACKETTRACER5/NETWORK")
    if network_node is None:
        # Root might be PACKETTRACER5 itself
        if root.tag == "PACKETTRACER5":
            network_node = root.find("NETWORK")

    version = _get_text(root, "VERSION", "")
    if not version:
        version = _get_text(root, "PACKETTRACER5/VERSION", "")

    devices: list[Device] = []
    links: list[Link] = []

    if network_node is not None:
        devices_node = network_node.find("DEVICES")
        if devices_node is not None:
            for device_el in devices_node.findall("DEVICE"):
                device = _parse_device(device_el)
                if device.name:  # Skip devices with no name
                    devices.append(device)

        # Deduplicate device names: if multiple devices share the same name,
        # append an index (Router → Router0, Router1, Router2).
        name_counts: dict[str, int] = {}
        for d in devices:
            name_counts[d.name] = name_counts.get(d.name, 0) + 1

        name_indices: dict[str, int] = {}
        for d in devices:
            if name_counts[d.name] > 1:
                idx = name_indices.get(d.name, 0)
                d.name = f"{d.name}{idx}"
                name_indices[d.name.rstrip("0123456789")] = idx + 1

        links = _parse_links(network_node)

    return ParsedNetwork(version=version, devices=devices, links=links)


def parse_xml_string(xml_content: str) -> ParsedNetwork:
    """Parse an XML string into a ParsedNetwork object.

    Args:
        xml_content: Raw XML string from pka2xml output.

    Returns:
        ParsedNetwork containing all devices, links, and configurations.

    Raises:
        ET.ParseError: If the XML is malformed.
        ValueError: If the XML structure is not recognized.
    """
    cleaned = _clean_xml(xml_content)
    root = ET.fromstring(cleaned)
    return _parse_root(root)


def parse_xml_file(filepath: str | Path) -> ParsedNetwork:
    """Parse an XML file into a ParsedNetwork object.

    Args:
        filepath: Path to the XML file output by pka2xml.

    Returns:
        ParsedNetwork containing all devices, links, and configurations.

    Raises:
        FileNotFoundError: If the file does not exist.
        ET.ParseError: If the XML is malformed.
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"XML file not found: {path}")

    with open(path, encoding="utf-8", errors="replace") as f:
        content = f.read()

    return parse_xml_string(content)
