export function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function intToIp(num) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ].join('.');
}

export function maskToCidr(mask) {
  const intMask = ipToInt(mask);
  let count = 0;
  for (let i = 31; i >= 0; i--) {
    if ((intMask & (1 << i)) !== 0) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function cidrToMask(cidr) {
  const intMask = (0xFFFFFFFF << (32 - cidr)) >>> 0;
  return intToIp(intMask);
}

export function getNetworkAddress(ip, mask) {
  const ipInt = ipToInt(ip);
  const maskInt = ipToInt(mask);
  return intToIp((ipInt & maskInt) >>> 0);
}

export function sameSubnet(ip1, ip2, mask) {
  const ip1Int = ipToInt(ip1);
  const ip2Int = ipToInt(ip2);
  const maskInt = ipToInt(mask);
  return (ip1Int & maskInt) === (ip2Int & maskInt);
}

export function generateMac(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  const parts = ['00', '11'];
  for (let i = 0; i < 4; i++) {
    parts.push(hex.substr((i % 4) * 2, 2).padEnd(2, '0'));
  }
  return parts.join(':').toLowerCase();
}

export default class IosDevice {
  constructor(deviceData, allNodes, allEdges) {
    this.deviceData = deviceData;
    this.id = deviceData.id;
    this.type = deviceData.type;
    
    this.interfaceStates = {};
    this.routingTable = [];
    this.arpTable = [];
    this.macTable = [];
    this.startupConfig = null;
    
    this.refresh(deviceData, allNodes, allEdges);
  }

  refresh(deviceData, allNodes, allEdges) {
    this.deviceData = deviceData;
    this._recomputeInterfaceStates(allNodes, allEdges);
    if (this.type === 'router') {
      this._rebuildRoutingTable(allNodes);
    }
  }

  _recomputeInterfaceStates(allNodes, allEdges) {
    this.interfaceStates = {};
    const defaultAdminState = (this.type === 'router' || this.type === 'switch') ? 'down' : 'up';

    if (this.deviceData.interfaces) {
      for (const [ifaceName, ifaceConfig] of Object.entries(this.deviceData.interfaces)) {
        
        let adminState = defaultAdminState;
        const cmds = (ifaceConfig.commands || []).map(c => c.toLowerCase());
        if (cmds.includes('shutdown')) {
          adminState = 'down';
        } else if (cmds.includes('no shutdown')) {
          adminState = 'up';
        } else if (this.type === 'pc' || this.type === 'server') {
          adminState = 'up';
        } else if (ifaceConfig.status) {
          adminState = ifaceConfig.status === 'up' ? 'up' : 'down';
        }

        const connectedEdge = allEdges ? allEdges.find(
          edge => {
            const srcPort = edge.data?.sourcePort || edge.sourceHandle;
            const tgtPort = edge.data?.targetPort || edge.targetHandle;
            return (edge.source === this.id && srcPort === ifaceName) ||
                   (edge.target === this.id && tgtPort === ifaceName);
          }
        ) : null;

        let cableConnected = !!connectedEdge;
        let peerDeviceId = null;
        let peerInterface = null;
        let peerAdminState = 'down';

        if (cableConnected && allNodes) {
          peerDeviceId = connectedEdge.source === this.id ? connectedEdge.target : connectedEdge.source;
          const srcPort = connectedEdge.data?.sourcePort || connectedEdge.sourceHandle;
          const tgtPort = connectedEdge.data?.targetPort || connectedEdge.targetHandle;
          peerInterface = connectedEdge.source === this.id ? tgtPort : srcPort;
          
          const peerNode = allNodes.find(n => n.id === peerDeviceId);
          if (peerNode && peerNode.interfaces && peerNode.interfaces[peerInterface]) {
            const pIface = peerNode.interfaces[peerInterface];
            let pAdminState = (peerNode.type === 'router' || peerNode.type === 'switch') ? 'down' : 'up';
            const pCmds = (pIface.commands || []).map(c => c.toLowerCase());
            if (pCmds.includes('shutdown')) {
              pAdminState = 'down';
            } else if (pCmds.includes('no shutdown')) {
              pAdminState = 'up';
            } else if (pIface.status) {
              pAdminState = pIface.status === 'up' ? 'up' : 'down';
            }
            peerAdminState = pAdminState;
          }
        }

        const operState = (adminState === 'up' && cableConnected) ? 'up' : 'down';
        const lineProtocol = (operState === 'up' && peerAdminState === 'up') ? 'up' : 'down';

        this.interfaceStates[ifaceName] = {
          admin_state: adminState,
          oper_state: operState,
          line_protocol: lineProtocol,
          link_detected: cableConnected,
          cable_connected: cableConnected,
          peer_device_id: peerDeviceId,
          peer_interface: peerInterface,
          ip_address: ifaceConfig.ip || null,
          subnet_mask: ifaceConfig.mask || null,
          speed: ifaceConfig.speed || 'auto',
          duplex: ifaceConfig.duplex || 'auto',
          mac_address: generateMac(this.id + ifaceName),
        };
      }
    }
  }

  _rebuildRoutingTable(allNodes) {
    this.routingTable = [];
    if (!this.deviceData.interfaces) return;

    for (const [ifaceName, state] of Object.entries(this.interfaceStates)) {
      if (state.line_protocol === 'up' && state.ip_address && state.subnet_mask) {
        const cidr = maskToCidr(state.subnet_mask);
        const network = getNetworkAddress(state.ip_address, state.subnet_mask);
        
        this.routingTable.push({
          type: 'C',
          network: network,
          mask: state.subnet_mask,
          cidr: cidr,
          nextHop: null,
          exitInterface: ifaceName,
          ad: 0,
          metric: 0,
          age: '-'
        });

        this.routingTable.push({
          type: 'L',
          network: state.ip_address,
          mask: '255.255.255.255',
          cidr: 32,
          nextHop: null,
          exitInterface: ifaceName,
          ad: 0,
          metric: 0,
          age: '-'
        });
      }
    }

    if (this.deviceData.running_config && this.deviceData.running_config.global_commands) {
      for (const cmd of this.deviceData.running_config.global_commands) {
        if (cmd.startsWith('ip route ')) {
          const parts = cmd.trim().split(/\s+/);
          if (parts.length >= 5) {
            const network = parts[2];
            const mask = parts[3];
            const target = parts[4];
            let nextHop = null;
            let exitInterface = null;
            
            if (target.includes('.')) {
              nextHop = target;
            } else {
              exitInterface = target;
            }

            this.routingTable.push({
              type: 'S',
              network: network,
              mask: mask,
              cidr: maskToCidr(mask),
              nextHop: nextHop,
              exitInterface: exitInterface,
              ad: 1,
              metric: 0,
              age: '-'
            });
          }
        }
      }
    }
    
    // Dynamic Routing simplification (OSPF)
    if (this.deviceData.running_config && this.deviceData.running_config.router_sections && allNodes) {
      const ospfSections = Object.entries(this.deviceData.running_config.router_sections).filter(([k]) => k.startsWith('router ospf'));
      for (const [secName, commands] of ospfSections) {
         const myOspfNetworks = [];
         for (const cmd of commands) {
            if (cmd.startsWith('network ')) {
                const parts = cmd.trim().split(/\s+/);
                if (parts.length >= 4) {
                    const net = parts[1];
                    const wildcard = parts[2];
                    // Very simple conversion of wildcard to mask for basic comparison
                    const mask = intToIp((~ipToInt(wildcard)) >>> 0);
                    myOspfNetworks.push({ network: net, mask: mask, cidr: maskToCidr(mask) });
                }
            }
         }
         
         if (myOspfNetworks.length > 0) {
             for (const node of allNodes) {
                 if (node.id === this.id || node.type !== 'router') continue;
                 
                 // If the other router also has OSPF and a matching interface in the network
                 if (node.running_config && node.running_config.router_sections) {
                    const peerOspf = Object.keys(node.running_config.router_sections).find(k => k.startsWith('router ospf'));
                    if (peerOspf) {
                        // For this simple simulation, add the peer's connected routes as O routes
                        // In reality, this requires adjacency and LSA DB.
                        if (node.interfaces) {
                          for (const [pIfaceName, pIfaceConfig] of Object.entries(node.interfaces)) {
                            if (pIfaceConfig.ip && pIfaceConfig.mask) {
                              const pNet = getNetworkAddress(pIfaceConfig.ip, pIfaceConfig.mask);
                              this.routingTable.push({
                                type: 'O',
                                network: pNet,
                                mask: pIfaceConfig.mask,
                                cidr: maskToCidr(pIfaceConfig.mask),
                                nextHop: null, // Should be the peer's IP on the shared segment
                                exitInterface: null,
                                ad: 110,
                                metric: 10,
                                age: '00:00:01'
                              });
                            }
                          }
                        }
                    }
                 }
             }
         }
      }
    }
  }

  routeLookup(destIp) {
    let bestMatch = null;
    let maxCidr = -1;

    for (const route of this.routingTable) {
      if (sameSubnet(destIp, route.network, route.mask)) {
        if (route.cidr > maxCidr) {
          maxCidr = route.cidr;
          bestMatch = {
            nextHop: route.nextHop,
            exitInterface: route.exitInterface,
            routeType: route.type
          };
        }
      }
    }
    return bestMatch;
  }

  arpResolve(ip) {
    const entry = this.arpTable.find(e => e.ip === ip);
    return entry ? entry.mac : null;
  }

  arpLearn(ip, mac, iface) {
    const existing = this.arpTable.find(e => e.ip === ip);
    if (existing) {
      existing.mac = mac;
      existing.iface = iface;
      existing.age = '0';
    } else {
      this.arpTable.push({
        protocol: 'Internet',
        ip: ip,
        age: '0',
        mac: mac,
        type: 'ARPA',
        iface: iface
      });
    }
  }

  arpClear() {
    this.arpTable = [];
  }

  macLearn(mac, vlan, port) {
    const existing = this.macTable.find(e => e.mac === mac && e.vlan === vlan);
    if (existing) {
      existing.port = port;
    } else {
      this.macTable.push({
        vlan: vlan,
        mac: mac,
        type: 'DYNAMIC',
        port: port
      });
    }
  }

  macLookup(mac, vlan) {
    const entry = this.macTable.find(e => e.mac === mac && e.vlan === vlan);
    return entry ? entry.port : null;
  }

  macClear() {
    this.macTable = [];
  }

  saveStartupConfig() {
    this.startupConfig = JSON.parse(JSON.stringify(this.deviceData.running_config || {}));
  }

  getStartupConfig() {
    return this.startupConfig ? JSON.parse(JSON.stringify(this.startupConfig)) : null;
  }
}
