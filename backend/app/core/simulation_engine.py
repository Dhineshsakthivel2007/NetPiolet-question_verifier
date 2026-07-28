from __future__ import annotations

import logging
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

logger = logging.getLogger(__name__)

def build_network(project_state: dict) -> ParsedNetwork:
    """
    Convert browser lab project JSON state into a ParsedNetwork
    for evaluation.
    """
    network = ParsedNetwork(version="7.3")

    type_mapping = {
        "router": "Router",
        "switch": "Switch",
        "pc": "Pc",
        "server": "Server",
        "laptop": "Laptop"
    }

    nodes = project_state.get("nodes", [])
    for node in nodes:
        d_type = type_mapping.get(node.get("type", "pc"), "Pc")
        device = Device(
            name=node.get("hostname", ""),
            device_type=d_type,
            save_ref_id=node.get("id", ""),
            model=node.get("type", "").upper() + "-PT",
            x=node.get("position", {}).get("x", 0.0),
            y=node.get("position", {}).get("y", 0.0)
        )

        interfaces_data = node.get("interfaces", {})
        for iface_name, iface_data in interfaces_data.items():
            port = PortInfo(
                name=iface_name,
                ip=iface_data.get("ip", ""),
                subnet=iface_data.get("mask", ""),
                power=(iface_data.get("status", "up") == "up")
            )
            device.ports.append(port)

        rc_data = node.get("running_config", {})
        rc = RunningConfig(hostname=rc_data.get("hostname", device.name))
        
        raw_lines = []
        raw_lines.append("!")
        raw_lines.append(f"hostname {rc.hostname}")
        
        for cmd in rc_data.get("global_commands", []):
            rc.global_commands.append(cmd)
            raw_lines.append(cmd)

        for iface_name, iface_data in interfaces_data.items():
            iface_conf = InterfaceConfig(name=iface_name)
            raw_lines.append(f"interface {iface_name}")
            for cmd in iface_data.get("commands", []):
                iface_conf.commands.append(cmd)
                raw_lines.append(f" {cmd}")
            raw_lines.append("!")
            rc.interfaces.append(iface_conf)

        for section_name, section_cmds in rc_data.get("router_sections", {}).items():
            raw_lines.append(section_name)
            for cmd in section_cmds:
                raw_lines.append(f" {cmd}")
            raw_lines.append("!")
            
        rc.raw_lines = raw_lines
        device.running_config = rc

        for vlan_data in node.get("vlans", []):
            device.vlans.append(VlanInfo(
                number=vlan_data.get("number", 1),
                name=vlan_data.get("name", "")
            ))

        vtp_data = node.get("vtp", {})
        if vtp_data:
            device.vtp = VtpInfo(
                domain_name=vtp_data.get("domain", ""),
                mode=vtp_data.get("mode", 0),
                version=vtp_data.get("version", 1)
            )

        network.devices.append(device)

    edges = project_state.get("edges", [])
    for edge in edges:
        link = Link(
            link_type="eCopper",
            cable_type=edge.get("cableType", "copper-straight"),
            from_device_ref=edge.get("source", ""),
            from_port=edge.get("sourcePort", ""),
            to_device_ref=edge.get("target", ""),
            to_port=edge.get("targetPort", "")
        )
        network.links.append(link)

    return network
