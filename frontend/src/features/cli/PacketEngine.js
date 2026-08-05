import IosDevice, { ipToInt, intToIp, maskToCidr, getNetworkAddress, sameSubnet, generateMac } from './IosDevice.js';

export function isInterfaceOperational(node, portName) {
  if (!node || !node.interfaces || !node.interfaces[portName]) return false;
  const iface = node.interfaces[portName];
  const type = node.type?.toLowerCase() || 'pc';
  if (type === 'pc' || type === 'server') return true;
  const cmds = iface.commands || [];
  if (cmds.includes('shutdown')) return false;
  if (cmds.includes('no shutdown')) return true;
  return iface.status === 'up';
}

export function findDeviceByIp(ip, topology) {
  if (!topology || !topology.nodes) return null;
  
  for (const node of topology.nodes) {
    if (!node.interfaces) continue;
    for (const [interfaceName, intf] of Object.entries(node.interfaces)) {
      if (intf.ip === ip) {
        return { node, interfaceName, interfaceData: intf };
      }
    }
  }
  return null;
}

export function traceL2Path(fromDeviceId, fromPort, topology) {
  let queue = [{ deviceId: fromDeviceId, port: fromPort }];
  let visitedEdges = new Set();
  let reachableEndpoints = [];
  let hops = [];

  while (queue.length > 0) {
    const { deviceId, port } = queue.shift();
    
    const cables = topology.edges.filter(e => {
      const srcPort = e.data?.sourcePort || e.sourceHandle;
      const tgtPort = e.data?.targetPort || e.targetHandle;
      return (e.source === deviceId && srcPort === port) ||
             (e.target === deviceId && tgtPort === port);
    });

    for (const cable of cables) {
      if (visitedEdges.has(cable.id)) continue;
      visitedEdges.add(cable.id);

      const nextDeviceId = cable.source === deviceId ? cable.target : cable.source;
      const nextPort = cable.source === deviceId
        ? (cable.data?.targetPort || cable.targetHandle)
        : (cable.data?.sourcePort || cable.sourceHandle);
      
      hops.push({ deviceId: nextDeviceId, port: nextPort });
      
      const nextNode = topology.nodes.find(n => n.id === nextDeviceId);
      if (!nextNode) continue;

      if (!isInterfaceOperational(nextNode, nextPort)) continue;

      if (nextNode.type === 'switch') {
        for (const [sPort, sIntf] of Object.entries(nextNode.interfaces || {})) {
          if (sPort !== nextPort && isInterfaceOperational(nextNode, sPort)) {
            queue.push({ deviceId: nextNode.id, port: sPort });
          }
        }
      } else {
        reachableEndpoints.push({ deviceId: nextNode.id, port: nextPort });
      }
    }
  }

  if (reachableEndpoints.length > 0) {
      return { 
          reachable: true, 
          endDeviceId: reachableEndpoints[0].deviceId, 
          endPort: reachableEndpoints[0].port, 
          hops, 
          allEndpoints: reachableEndpoints 
      };
  }
  
  return { reachable: false, endDeviceId: null, endPort: null, hops, allEndpoints: [] };
}

export function simulatePing(sourceIosDevice, destIp, topology, isPc = false) {
  let replies = [];
  let sent = isPc ? 4 : 5;
  let received = 0;
  let lost = 0;
  
  const upInterfaces = Object.entries(sourceIosDevice.interfaceStates || {}).filter(([_, intf]) => intf.line_protocol === 'up' && intf.ip_address);
  if (upInterfaces.length === 0) {
    for (let i = 0; i < sent; i++) {
        replies.push(isPc ? 'Destination host unreachable.' : 'U');
        lost++;
    }
    return { success: false, replies, stats: { sent, received, lost, lossPercent: 100 } };
  }

  if (destIp === '127.0.0.1' || upInterfaces.some(([_, intf]) => intf.ip_address === destIp)) {
    for (let i = 0; i < sent; i++) {
        replies.push(isPc ? `Reply from ${destIp}: bytes=32 time<1ms TTL=128` : '!');
        received++;
    }
    return { success: true, replies, stats: { sent, received, lost: 0, lossPercent: 0 } };
  }

  for (let i = 0; i < sent; i++) {
    let ttl = isPc ? 128 : 255;
    let currentDevice = sourceIosDevice;
    let currentDestIp = destIp;
    let reached = false;
    let unreachable = false;
    let timeout = false;
    
    let maxHops = 30;
    
    while (maxHops > 0) {
      maxHops--;
      
      let exitIntfName = null;
      let exitIntf = null;
      let nextHopIp = null;
      let isDirectlyConnected = false;
      
      const currentIntfs = currentDevice.interfaceStates || currentDevice.interfaces || {};
      const isIosDevice = !!currentDevice.interfaceStates;

      for (const [name, intf] of Object.entries(currentIntfs)) {
        const isUp = isIosDevice ? intf.line_protocol === 'up' : isInterfaceOperational(currentDevice, name);
        const ip = isIosDevice ? intf.ip_address : intf.ip;
        const mask = isIosDevice ? intf.subnet_mask : intf.mask;
        
        if (isUp && ip && mask && sameSubnet(ip, currentDestIp, mask)) {
          exitIntfName = name;
          exitIntf = intf;
          isDirectlyConnected = true;
          break;
        }
      }

      if (!isDirectlyConnected) {
         if (isIosDevice && typeof currentDevice.routeLookup === 'function') {
            const route = currentDevice.routeLookup(currentDestIp);
            if (route) {
               exitIntfName = route.exitInterface;
               exitIntf = currentIntfs[exitIntfName];
               nextHopIp = route.nextHop;
            }
         } else if (currentDevice.type === 'pc' || !currentDevice.type) {
            const gw = Object.values(currentIntfs)[0]?.gateway;
            if (gw) {
               nextHopIp = gw;
               exitIntfName = Object.keys(currentIntfs)[0];
               exitIntf = currentIntfs[exitIntfName];
            }
         }

         const isExitUp = isIosDevice ? (exitIntf && exitIntf.line_protocol === 'up') : isInterfaceOperational(currentDevice, exitIntfName);

         if (!exitIntf || !isExitUp) {
            unreachable = true;
            break;
         }
      }

      const l2 = traceL2Path(currentDevice.id, exitIntfName, topology);
      if (!l2.reachable) {
        timeout = true;
        break;
      }

      const targetIpToCheck = nextHopIp || currentDestIp;
      let foundEndpoint = null;

      for (const ep of l2.allEndpoints) {
        const epNode = topology.nodes.find(n => n.id === ep.deviceId);
        if (epNode && epNode.interfaces && epNode.interfaces[ep.port]) {
           const epIntf = epNode.interfaces[ep.port];
           if (epIntf.ip === targetIpToCheck && isInterfaceOperational(epNode, ep.port)) {
              foundEndpoint = epNode;
              break;
           }
        }
      }

      if (!foundEndpoint) {
        timeout = true; 
        break;
      }

      const isTarget = Object.entries(foundEndpoint.interfaces || {}).some(([name, intf]) => intf.ip === destIp && isInterfaceOperational(foundEndpoint, name));
      
      if (isTarget) {
        reached = true;
        break;
      } else {
        if (foundEndpoint.type === 'router' || foundEndpoint.type === 'layer3-switch') {
          currentDevice = new IosDevice(foundEndpoint, topology.nodes, topology.edges);
        } else {
          currentDevice = foundEndpoint;
        }
        ttl--;
        if (ttl <= 0) {
          timeout = true;
          break;
        }
      }
    }

    if (reached) {
      replies.push(isPc ? `Reply from ${destIp}: bytes=32 time=1ms TTL=${ttl}` : '!');
      received++;
    } else {
      if (unreachable) {
         replies.push(isPc ? 'Destination host unreachable.' : 'U');
      } else {
         replies.push(isPc ? 'Request timed out.' : '.');
      }
      lost++;
    }
  }

  return {
    success: received > 0,
    replies,
    stats: {
      sent,
      received,
      lost,
      lossPercent: Math.round((lost / sent) * 100)
    }
  };
}

export function simulatePcPing(pcDeviceData, destIp, topology) {
  const iosDevice = new IosDevice(pcDeviceData, topology.nodes, topology.edges);
  return simulatePing(iosDevice, destIp, topology, true);
}

export function simulateRouterPing(routerIosDevice, destIp, topology) {
  return simulatePing(routerIosDevice, destIp, topology, false);
}

export function formatPingOutput(destIp, replies, stats) {
  const isPc = replies.length > 0 && (replies[0].includes('Reply') || replies[0].includes('Request') || replies[0].includes('Destination'));
  
  if (isPc) {
    let out = `\nPinging ${destIp} with 32 bytes of data:\n`;
    for (const reply of replies) {
      out += `${reply}\n`;
    }
    out += `\nPing statistics for ${destIp}:\n`;
    out += `    Packets: Sent = ${stats.sent}, Received = ${stats.received}, Lost = ${stats.lost} (${stats.lossPercent}% loss)\n`;
    if (stats.received > 0) {
        out += `Approximate round trip times in milli-seconds:\n`;
        out += `    Minimum = 0ms, Maximum = 1ms, Average = 0ms\n`;
    }
    return out;
  } else {
    let out = `Type escape sequence to abort.\n`;
    out += `Sending ${stats.sent}, 100-byte ICMP Echos to ${destIp}, timeout is 2 seconds:\n`;
    out += replies.join('') + '\n';
    out += `Success rate is ${100 - stats.lossPercent} percent (${stats.received}/${stats.sent})`;
    if (stats.received > 0) {
      out += `, round-trip min/avg/max = 1/1/1 ms`;
    }
    out += '\n';
    return out;
  }
}
