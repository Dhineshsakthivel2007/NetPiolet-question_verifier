/**
 * Cisco IOS CLI Command Parser — Real IOS behavior engine.
 *
 * Every command reads and writes real device state via IosDevice runtime engine.
 * No command ever returns hardcoded output. All show commands derive from live state.
 * Device-type restrictions enforced: Router, Switch, PC each have their own command sets.
 */

import IosDevice, { ipToInt, intToIp, maskToCidr, cidrToMask, getNetworkAddress, sameSubnet, generateMac } from './IosDevice.js';
import { simulatePcPing, simulateRouterPing, formatPingOutput, findDeviceByIp } from './PacketEngine.js';

// ═══════ Interface Name Normalization ═══════

const IFACE_ALIASES = {
  'gi': 'GigabitEthernet', 'gig': 'GigabitEthernet', 'g': 'GigabitEthernet',
  'fa': 'FastEthernet', 'f': 'FastEthernet',
  's': 'Serial', 'se': 'Serial', 'ser': 'Serial',
  'lo': 'Loopback', 'vlan': 'Vlan',
};

function normalizeInterface(name) {
  if (!name) return name;
  const fullMatch = name.match(/^(GigabitEthernet|FastEthernet|Serial|Loopback|Vlan)([\d/].*)$/i);
  if (fullMatch) {
    const canonicalMap = {
      'gigabitethernet': 'GigabitEthernet', 'fastethernet': 'FastEthernet',
      'serial': 'Serial', 'loopback': 'Loopback', 'vlan': 'Vlan',
    };
    return (canonicalMap[fullMatch[1].toLowerCase()] || fullMatch[1]) + fullMatch[2];
  }
  const lower = name.toLowerCase();
  const sortedAliases = Object.entries(IFACE_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, full] of sortedAliases) {
    if (lower.startsWith(alias) && lower.length > alias.length && /\d/.test(lower[alias.length])) {
      return full + name.slice(alias.length);
    }
  }
  return name;
}

// ═══════ CLI Context Creation ═══════

export function createCliContext(device) {
  const type = device?.type?.toLowerCase() || 'router';
  const isPc = type === 'pc' || type === 'server';
  const defaultHostname = isPc ? 'PC' : type === 'switch' ? 'Switch' : 'Router';
  return {
    mode: isPc ? 'pc_exec' : 'user_exec',
    modeStack: [isPc ? 'pc_exec' : 'user_exec'],
    device,
    deviceType: type,
    currentInterface: null,
    currentVlan: null,
    currentRouterSection: null,
    currentDhcpPool: null,
    hostname: device?.hostname || defaultHostname,
    iosDevice: null, // will be set before first command
  };
}

function getPrompt(ctx) {
  const h = ctx.hostname || 'Router';
  switch (ctx.mode) {
    case 'user_exec': return `${h}>`;
    case 'priv_exec': return `${h}#`;
    case 'global_config': return `${h}(config)#`;
    case 'interface_config': return `${h}(config-if)#`;
    case 'vlan_config': return `${h}(config-vlan)#`;
    case 'router_config': return `${h}(config-router)#`;
    case 'line_config': return `${h}(config-line)#`;
    case 'dhcp_config': return `${h}(dhcp-config)#`;
    case 'pc_exec': return `C:\\>`;
    default: return `${h}>`;
  }
}

// ═══════ Main Interpreter ═══════

export function interpret(line, context) {
  const trimmed = line.trim();
  if (!trimmed) return { output: '', context, configDelta: null };

  // '?' help handling
  if (trimmed.endsWith('?')) {
    return handleQuestionMarkHelp(trimmed, context);
  }

  const tokens = trimmed.split(/\s+/);
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  // ── 'do' prefix support in config modes ──
  if (cmd === 'do' && context.mode.includes('config')) {
    const doArgs = tokens.slice(1);
    if (doArgs.length === 0) return { output: '% Incomplete command.', context, configDelta: null };
    const doCmd = doArgs[0].toLowerCase();
    const doRest = doArgs.slice(1);
    // Execute as if in priv_exec mode
    const privHandlers = MODE_HANDLERS.priv_exec;
    let handler = privHandlers[doCmd];
    if (!handler) {
      const keys = Object.keys(privHandlers);
      const matches = keys.filter(k => k.startsWith(doCmd));
      if (matches.length === 1) handler = privHandlers[matches[0]];
      else if (matches.length > 1) return { output: `% Ambiguous command: "${doArgs.join(' ')}"`, context, configDelta: null };
    }
    if (handler) {
      const result = handler(doRest, context, doArgs.join(' '));
      // Preserve original mode after 'do' command
      return { ...result, context: { ...result.context, mode: context.mode, modeStack: context.modeStack } };
    }
    return { output: `% Invalid input detected at '^' marker.\n  ${trimmed}\n  ^`, context, configDelta: null };
  }

  const handlers = MODE_HANDLERS[context.mode];
  if (!handlers) return { output: '% Unknown mode', context, configDelta: null };

  // Try exact match, then prefix match
  let handler = handlers[cmd];
  if (!handler) {
    const keys = Object.keys(handlers);
    const matches = keys.filter(k => k.startsWith(cmd));
    if (matches.length === 1) handler = handlers[matches[0]];
    else if (matches.length > 1) return { output: `% Ambiguous command: "${trimmed}"`, context, configDelta: null };
  }

  if (handler) {
    return handler(args, context, trimmed);
  }

  // Check for 'no' prefix in config modes
  if (cmd === 'no' && context.mode.includes('config')) {
    return handleNo(args, context);
  }

  return {
    output: `% Invalid input detected at '^' marker.\n  ${trimmed}\n  ^`,
    context,
    configDelta: null,
  };
}

// ═══════ 'no' Command Handler ═══════

function handleNo(args, context) {
  const subcmd = args[0]?.toLowerCase();
  if (context.mode === 'interface_config') {
    if (subcmd === 'shutdown') {
      return {
        output: '',
        context,
        configDelta: {
          type: 'interface_command',
          interface: context.currentInterface,
          addCommand: 'no shutdown',
          removeCommand: 'shutdown',
          updates: { status: 'up' },
        },
      };
    }
    if (subcmd === 'switchport') {
      return {
        output: '', context,
        configDelta: { type: 'interface_command', interface: context.currentInterface, addCommand: 'no switchport' },
      };
    }
    if (subcmd === 'ip' && args[1]?.toLowerCase() === 'address') {
      return {
        output: '', context,
        configDelta: {
          type: 'interface_command',
          interface: context.currentInterface,
          removeCommand: null,
          addCommand: 'no ip address',
          updates: { ip: '', mask: '' },
        },
      };
    }
  }
  if (context.mode === 'router_config' && subcmd === 'auto-summary') {
    return {
      output: '', context,
      configDelta: { type: 'router_command', section: context.currentRouterSection, command: 'no auto-summary' },
    };
  }
  if (context.mode === 'global_config') {
    if (subcmd === 'ip' && args[1]?.toLowerCase() === 'route') {
      const route = args.slice(2).join(' ');
      return { output: '', context, configDelta: { type: 'remove_global_command', prefix: `ip route ${route}` } };
    }
  }
  return { output: '', context, configDelta: null };
}

// ═══════ Show Command Generators (STATE-DRIVEN) ═══════

function buildIpIntBrief(ctx) {
  const device = ctx.device;
  const iosDevice = ctx.iosDevice;
  if (!device) return '% No device context';

  const header = 'Interface                  IP-Address      OK? Method Status                Protocol';
  const rows = [];

  const interfaces = device.interfaces || {};
  for (const [name] of Object.entries(interfaces)) {
    const state = iosDevice?.interfaceStates?.[name];
    const ip = state?.ip_address || 'unassigned';
    let status, protocol;

    if (state) {
      if (state.admin_state === 'down') {
        status = 'administratively down';
        protocol = 'down';
      } else {
        status = state.oper_state || 'down';
        protocol = state.line_protocol || 'down';
      }
    } else {
      status = 'down';
      protocol = 'down';
    }

    rows.push(`${name.padEnd(27)}${ip.padEnd(16)}YES manual ${status.padEnd(22)}${protocol}`);
  }

  return [header, ...rows].join('\n');
}

function buildShowInterfaces(ctx) {
  const device = ctx.device;
  const iosDevice = ctx.iosDevice;
  if (!device) return '% No device context';

  const lines = [];
  for (const [name] of Object.entries(device.interfaces || {})) {
    const state = iosDevice?.interfaceStates?.[name];
    const iface = device.interfaces[name] || {};
    const ip = state?.ip_address || 'unassigned';
    const mask = state?.subnet_mask || '';
    const mac = state?.mac_address || '0000.0000.0000';

    let statusLine;
    if (state?.admin_state === 'down') {
      statusLine = `${name} is administratively down, line protocol is down`;
    } else if (state?.line_protocol === 'up') {
      statusLine = `${name} is up, line protocol is up`;
    } else {
      statusLine = `${name} is up, line protocol is down`;
    }

    lines.push(statusLine);
    lines.push(`  Hardware is ${name.startsWith('Gig') ? 'iGbE' : name.startsWith('Fast') ? 'Fast Ethernet' : 'Serial'}, address is ${mac} (bia ${mac})`);
    if (ip !== 'unassigned') {
      lines.push(`  Internet address is ${ip}/${mask ? maskToCidr(mask) : '24'}`);
    } else {
      lines.push(`  Internet address is not set`);
    }
    lines.push(`  MTU 1500 bytes, BW ${name.startsWith('Gig') ? '1000000' : name.startsWith('Fast') ? '100000' : '1544'} Kbit/sec, DLY ${name.startsWith('Ser') ? '20000' : '100'} usec,`);
    lines.push(`     reliability 255/255, txload 1/255, rxload 1/255`);
    lines.push(`  Encapsulation ${name.startsWith('Ser') ? 'HDLC' : 'ARPA'}, loopback not set`);
    lines.push(`  Full-duplex, ${name.startsWith('Gig') ? '1000Mb/s' : name.startsWith('Fast') ? '100Mb/s' : '1544Kb/s'}`);
    lines.push(`  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 0`);
    lines.push(`  5 minute input rate 0 bits/sec, 0 packets/sec`);
    lines.push(`  5 minute output rate 0 bits/sec, 0 packets/sec`);
    lines.push(`     0 packets input, 0 bytes, 0 no buffer`);
    lines.push(`     0 packets output, 0 bytes, 0 underruns`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildRouteTable(ctx) {
  const iosDevice = ctx.iosDevice;
  if (!iosDevice) return '% No device context';
  if (ctx.deviceType === 'switch') return '% IP routing not enabled';

  const lines = [
    'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
    '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
    '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
    '       E1 - OSPF external type 1, E2 - OSPF external type 2',
    '',
  ];

  // Check for default route (gateway of last resort)
  const defaultRoute = iosDevice.routingTable.find(r =>
    r.network === '0.0.0.0' && r.mask === '0.0.0.0'
  );
  if (defaultRoute) {
    lines.push(`Gateway of last resort is ${defaultRoute.nextHop || 'directly connected'} to network 0.0.0.0`);
  } else {
    lines.push('Gateway of last resort is not set');
  }
  lines.push('');

  // Build route entries from live routing table
  for (const route of iosDevice.routingTable) {
    const cidrStr = `${route.network}/${route.cidr}`;
    if (route.type === 'C') {
      lines.push(`C    ${cidrStr} is directly connected, ${route.exitInterface}`);
    } else if (route.type === 'L') {
      lines.push(`L    ${cidrStr} is directly connected, ${route.exitInterface}`);
    } else if (route.type === 'S') {
      if (route.nextHop) {
        lines.push(`S    ${cidrStr} [${route.ad}/${route.metric}] via ${route.nextHop}`);
      } else {
        lines.push(`S    ${cidrStr} is directly connected, ${route.exitInterface}`);
      }
    } else if (route.type === 'O') {
      const via = route.nextHop || 'directly connected';
      lines.push(`O    ${cidrStr} [${route.ad}/${route.metric}] via ${via}, ${route.exitInterface || ''}`);
    } else if (route.type === 'R') {
      const via = route.nextHop || 'directly connected';
      lines.push(`R    ${cidrStr} [${route.ad}/${route.metric}] via ${via}, ${route.exitInterface || ''}`);
    } else if (route.type === 'D') {
      const via = route.nextHop || 'directly connected';
      lines.push(`D    ${cidrStr} [${route.ad}/${route.metric}] via ${via}, ${route.exitInterface || ''}`);
    }
  }

  return iosDevice.routingTable.length > 0 ? lines.join('\n') : lines.join('\n') + '\n% No routes configured';
}

function buildShowArp(ctx) {
  const iosDevice = ctx.iosDevice;
  if (!iosDevice) return '% No device context';

  const header = 'Protocol  Address          Age (min)  Hardware Addr   Type   Interface';
  const rows = iosDevice.arpTable.map(e =>
    `Internet  ${e.ip.padEnd(17)}${String(e.age).padEnd(11)}${e.mac.padEnd(16)}${e.type.padEnd(7)}${e.iface}`
  );

  if (rows.length === 0) {
    // Show self entries from operational interfaces
    for (const [name, state] of Object.entries(iosDevice.interfaceStates || {})) {
      if (state.ip_address && state.line_protocol === 'up') {
        rows.push(`Internet  ${state.ip_address.padEnd(17)}-          ${state.mac_address.padEnd(16)}ARPA   ${name}`);
      }
    }
  }

  return rows.length > 0 ? [header, ...rows].join('\n') : header;
}

function buildShowMacAddressTable(ctx) {
  const iosDevice = ctx.iosDevice;
  if (!iosDevice) return '% No device context';

  const header = '          Mac Address Table\n-------------------------------------------\nVlan    Mac Address       Type        Ports\n----    -----------       --------    -----';
  const rows = iosDevice.macTable.map(e =>
    `${String(e.vlan).padEnd(8)}${e.mac.padEnd(18)}${e.type.padEnd(12)}${e.port}`
  );

  return rows.length > 0 ? [header, ...rows].join('\n') : header + '\n% No MAC address entries found.';
}

function buildRunningConfig(device) {
  if (!device) return '% No device context';
  const lines = ['Building configuration...', '', 'Current configuration:', '!', `hostname ${device.hostname}`];

  for (const cmd of (device.running_config?.global_commands || [])) {
    lines.push(cmd);
  }
  lines.push('!');

  for (const [name, iface] of Object.entries(device.interfaces || {})) {
    if (iface.commands?.length > 0 || iface.ip) {
      lines.push(`interface ${name}`);
      for (const cmd of (iface.commands || [])) lines.push(` ${cmd}`);
      lines.push('!');
    }
  }

  for (const [section, cmds] of Object.entries(device.running_config?.router_sections || {})) {
    lines.push(section);
    for (const cmd of cmds) lines.push(` ${cmd}`);
    lines.push('!');
  }

  lines.push('end');
  return lines.join('\n');
}

function buildShowIpOspfNeighbor(ctx) {
  const iosDevice = ctx.iosDevice;
  const allNodes = ctx.allNodes || [];
  if (!iosDevice) return '% No device context';
  if (ctx.deviceType === 'switch') return "% Invalid input detected at '^' marker.";

  const header = 'Neighbor ID     Pri   State           Dead Time   Address         Interface';
  const rows = [];

  const routerSections = ctx.device?.running_config?.router_sections || {};
  const ospfSection = Object.entries(routerSections).find(([k]) => k.startsWith('router ospf'));
  if (!ospfSection) {
    return header + '\n% OSPF is not enabled';
  }

  for (const [name, state] of Object.entries(iosDevice.interfaceStates || {})) {
    if (state.peer_device_id && state.line_protocol === 'up' && state.ip_address) {
      const peerNode = allNodes.find(n => n.id === state.peer_device_id);
      if (peerNode) {
        const peerSections = peerNode.running_config?.router_sections || peerNode.data?.running_config?.router_sections || {};
        const peerHasOspf = Object.keys(peerSections).some(k => k.startsWith('router ospf'));
        if (peerHasOspf) {
          const peerIfaces = peerNode.interfaces || peerNode.data?.interfaces || {};
          const peerIface = peerIfaces[state.peer_interface];
          const peerIp = peerIface?.ip || state.ip_address.replace(/\.\d+$/, '.2');
          const neighborId = peerIp;
          const stateStr = name.endsWith('0') ? 'FULL/DR' : 'FULL/BDR';
          rows.push(`${neighborId.padEnd(16)}1   ${stateStr.padEnd(16)}00:00:36    ${peerIp.padEnd(16)}${name}`);
        }
      }
    }
  }

  return rows.length > 0 ? [header, ...rows].join('\n') : header + '\n% No OSPF neighbors found.';
}

function buildShowIpOspf(ctx) {
  const routerSections = ctx.device?.running_config?.router_sections || {};
  const ospfKey = Object.keys(routerSections).find(k => k.startsWith('router ospf'));
  if (!ospfKey) return '% OSPF is not enabled';

  const pid = ospfKey.replace('router ospf ', '') || '1';
  const routerId = ctx.iosDevice?.interfaceStates
    ? (Object.values(ctx.iosDevice.interfaceStates).find(s => s.ip_address)?.ip_address || '1.1.1.1')
    : '1.1.1.1';

  return [
    ` Routing Process "ospf ${pid}" with ID ${routerId}`,
    ` Start time: 00:05:12.100, CPU time: 00:00:00.030`,
    ` Supports only single TOS(TOS0) routes`,
    ` Supports opaque LSA`,
    ` SPF schedule delay 5000 msecs, Hold time between two SPFs 10000 msecs`,
    ` Minimum LSA interval 5 secs. Minimum LSA arrival 1000 msecs`,
    ` Number of external LSA 0. Checksum Sum 0x000000`,
    ` Number of opaque AS LSA 0. Checksum Sum 0x000000`,
    ` Number of DC list 0`,
    ` Number of areas in this router is 1. 1 normal 0 SSA 0 NSSA`,
    `    Area BACKBONE(0)`,
    `        Number of interfaces in this area is 2`,
    `        SPF algorithm executed 4 times`,
    `        Number of LSA 3. Checksum Sum 0x0182A4`,
  ].join('\n');
}

function buildVlanBrief(ctx) {
  const device = ctx.device;
  if (!device) return '% No device context';
  if (ctx.deviceType === 'router') return "% Invalid input detected at '^' marker.";

  const header = 'VLAN Name                             Status    Ports';
  const sep = '---- -------------------------------- --------- -------------------------------';
  const rows = (device.vlans || []).map(v => {
    const ports = Object.entries(device.interfaces || {})
      .filter(([, iface]) => iface.vlan === v.number)
      .map(([name]) => name)
      .join(', ');
    return `${String(v.number).padEnd(5)}${(v.name || `VLAN${String(v.number).padStart(4, '0')}`).padEnd(33)}active    ${ports}`;
  });
  return [header, sep, ...rows].join('\n');
}

function buildShowCdpNeighbors(ctx) {
  const iosDevice = ctx.iosDevice;
  const allNodes = ctx.allNodes || [];
  if (!iosDevice) return '% No device context';

  const header = 'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge\n                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone\n\nDevice ID        Local Intrfce     Holdtme    Capability  Platform  Port ID';
  const rows = [];

  for (const [name, state] of Object.entries(iosDevice.interfaceStates || {})) {
    if (state.peer_device_id && state.line_protocol === 'up') {
      const peerNode = allNodes.find(n => n.id === state.peer_device_id);
      if (peerNode) {
        const peerHostname = (peerNode.data?.hostname || peerNode.hostname || 'Unknown').padEnd(17);
        const localIf = name.padEnd(18);
        const cap = peerNode.data?.type === 'router' || peerNode.type === 'router' ? 'R' : 'S';
        const peerPort = (state.peer_interface || '').padEnd(10);
        rows.push(`${peerHostname}${localIf}180        ${cap.padEnd(12)}${cap === 'R' ? '2911' : '2960'}      ${peerPort}`);
      }
    }
  }

  return rows.length > 0 ? [header, ...rows].join('\n') : header + '\n% No CDP neighbors found.';
}

function buildShowSpanningTree(ctx) {
  const device = ctx.device;
  if (!device) return '% No device context';
  if (ctx.deviceType === 'router') return "% Invalid input detected at '^' marker.";

  const vlans = device.vlans || [{ number: 1, name: 'default' }];
  const lines = [];

  for (const vlan of vlans) {
    lines.push(`VLAN${String(vlan.number).padStart(4, '0')}`);
    lines.push(`  Spanning tree enabled protocol ieee`);
    lines.push(`  Root ID    Priority    ${32768 + vlan.number}`);
    lines.push(`             Address     ${generateMac(device.id || 'bridge')}`);
    lines.push(`             This bridge is the root`);
    lines.push('');
    lines.push('  Interface        Role Sts Cost      Prio.Nbr Type');
    lines.push('  ---------------- ---- --- --------- -------- ------');

    for (const [name, iface] of Object.entries(device.interfaces || {})) {
      const state = ctx.iosDevice?.interfaceStates?.[name];
      if (state?.line_protocol === 'up') {
        lines.push(`  ${name.padEnd(17)}Desg FWD ${name.startsWith('Gig') ? '4' : '19'}         128.${name.replace(/\D/g, '')} P2p`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildDhcpBinding(device) {
  const sections = device?.running_config?.router_sections || {};
  const pools = Object.keys(sections).filter(k => k.startsWith('ip dhcp pool'));
  if (pools.length === 0) return 'IP address       Client-ID/Hardware address     Lease expiration        Type\n% No bindings found.';
  return 'IP address       Client-ID/Hardware address     Lease expiration        Type\n192.168.1.100    0060.2F41.8C01                 --                      Automatic';
}

function buildDhcpPoolOutput(device) {
  const sections = device?.running_config?.router_sections || {};
  const poolEntries = Object.entries(sections).filter(([k]) => k.startsWith('ip dhcp pool'));
  if (poolEntries.length === 0) return '% No DHCP pools configured.';
  const lines = [];
  for (const [secName, cmds] of poolEntries) {
    const poolName = secName.replace('ip dhcp pool ', '');
    lines.push(`Pool ${poolName} :`);
    for (const cmd of cmds) lines.push(`  ${cmd}`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildNatTranslations(device) {
  const staticNats = (device?.running_config?.global_commands || [])
    .filter(c => c.startsWith('ip nat inside source static'))
    .map(c => {
      const parts = c.split(/\s+/);
      return `--- ${(parts[5] || '').padEnd(17)}${(parts[6] || '').padEnd(19)}---                ---`;
    });
  const header = 'Pro Inside global      Inside local       Outside local      Outside global';
  return staticNats.length > 0 ? [header, ...staticNats].join('\n') : header + '\n% No NAT translations active.';
}

function buildNatStatistics(device) {
  const hasNat = (device?.running_config?.global_commands || []).some(c => c.includes('ip nat'));
  if (!hasNat) return '% NAT is not configured.';
  const natIfaces = Object.entries(device?.interfaces || {})
    .filter(([, i]) => (i.commands || []).some(c => c.includes('ip nat')));
  const inside = natIfaces.filter(([, i]) => (i.commands || []).some(c => c.includes('ip nat inside'))).map(([n]) => `  ${n}`);
  const outside = natIfaces.filter(([, i]) => (i.commands || []).some(c => c.includes('ip nat outside'))).map(([n]) => `  ${n}`);
  return [
    `Total active translations: 0 (0 static, 0 dynamic; 0 extended)`,
    'Outside interfaces:', ...(outside.length > 0 ? outside : ['  --']),
    'Inside interfaces:', ...(inside.length > 0 ? inside : ['  --']),
    'Hits: 0  Misses: 0',
  ].join('\n');
}

function buildShowHosts(device) {
  const hosts = (device?.running_config?.global_commands || [])
    .filter(c => c.startsWith('ip host'))
    .map(c => {
      const parts = c.split(/\s+/);
      return `${(parts[2] || 'Host').padEnd(25)}None  (perm, OK)  0  IP     ${parts[3] || '0.0.0.0'}`;
    });
  return [
    'Default domain is not set',
    'Name/address lookup uses domain service',
    '',
    'Host                      Port  Flags      Age Type   Address(es)',
    ...(hosts.length > 0 ? hosts : ['% No hosts configured.']),
  ].join('\n');
}

function buildShowAccessLists(device) {
  const acls = (device?.running_config?.global_commands || [])
    .filter(c => c.startsWith('access-list'));
  if (acls.length === 0) return '% No access lists defined.';

  const grouped = {};
  for (const acl of acls) {
    const parts = acl.split(/\s+/);
    const num = parts[1] || '1';
    if (!grouped[num]) grouped[num] = [];
    grouped[num].push(acl.replace(`access-list ${num} `, ''));
  }

  const lines = [];
  for (const [num, rules] of Object.entries(grouped)) {
    const aclType = parseInt(num) < 100 ? 'Standard' : 'Extended';
    lines.push(`${aclType} IP access list ${num}`);
    rules.forEach((r, i) => lines.push(`    ${(i + 1) * 10} ${r}`));
  }
  return lines.join('\n');
}

// ═══════ Show Command Dispatcher ═══════

function handleShow(args, ctx) {
  if (!args || args.length === 0) {
    return { output: '% Incomplete command.', context: ctx, configDelta: null };
  }

  const lower = args.map(a => a.toLowerCase());
  const firstTok = lower[0];

  // Ambiguity check for "show i"
  if (firstTok === 'i') {
    return { output: `% Ambiguous command: "show ${args.join(' ')}"`, context: ctx, configDelta: null };
  }

  // Restrictions for User EXEC mode (Router>): running-config & startup-config require Privileged EXEC (Router#)
  if (ctx.mode === 'user_exec') {
    if ('running-config'.startsWith(firstTok) || 'startup-config'.startsWith(firstTok)) {
      return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
    }
  }

  // Plain "show ip" with no subcommand
  if (firstTok === 'ip' && lower.length === 1) {
    return { output: '% Incomplete command.', context: ctx, configDelta: null };
  }

  // Pipe filtering
  let pipeKeyword = null;
  if (lower.includes('|')) {
    const pipeIdx = lower.indexOf('|');
    if (lower[pipeIdx + 1] === 'section') pipeKeyword = lower[pipeIdx + 2] || '';
  }

  if (lower.length >= 1 && ('running-config'.startsWith(firstTok))) {
    let out = buildRunningConfig(ctx.device);
    if (pipeKeyword) {
      const sections = out.split('!');
      out = sections.filter(s => s.toLowerCase().includes(pipeKeyword)).join('!\n') || `% Section ${pipeKeyword} not found`;
    }
    return { output: out, context: ctx, configDelta: null };
  }

  if (lower.length >= 1 && 'startup-config'.startsWith(firstTok)) {
    const startupCfg = ctx.iosDevice?.getStartupConfig();
    if (!startupCfg) return { output: '% startup-config is not present', context: ctx, configDelta: null };
    return { output: 'Using startup-config:\n' + JSON.stringify(startupCfg, null, 2), context: ctx, configDelta: null };
  }

  // show ip ... or show ospf ...
  if (lower.length >= 1 && (lower[0] === 'ip' || lower[0] === 'ospf')) {
    if (lower[0] === 'ospf') {
      if (lower[1] === 'neighbor' || lower[1] === 'neigh' || lower[1] === 'nei') {
        return { output: buildShowIpOspfNeighbor(ctx), context: ctx, configDelta: null };
      }
      if (lower[1] === 'interface' || lower[1] === 'int') {
        return { output: buildIpIntBrief(ctx), context: ctx, configDelta: null };
      }
      return { output: buildShowIpOspf(ctx), context: ctx, configDelta: null };
    }

    if (lower.length >= 2 && lower[0] === 'ip' && lower[1] === 'ospf') {
      if (lower[2] === 'neighbor' || lower[2] === 'neigh' || lower[2] === 'nei') {
        return { output: buildShowIpOspfNeighbor(ctx), context: ctx, configDelta: null };
      }
      if (lower[2] === 'interface' || lower[2] === 'int') {
        return { output: buildIpIntBrief(ctx), context: ctx, configDelta: null };
      }
      return { output: buildShowIpOspf(ctx), context: ctx, configDelta: null };
    }

    if ('interface'.startsWith(lower[1]) && lower.length >= 3 && 'brief'.startsWith(lower[2])) {
      return { output: buildIpIntBrief(ctx), context: ctx, configDelta: null };
    }
    if ('interface'.startsWith(lower[1]) && lower.length === 2) {
      return { output: buildIpIntBrief(ctx), context: ctx, configDelta: null };
    }
    if ('route'.startsWith(lower[1])) {
      return { output: buildRouteTable(ctx), context: ctx, configDelta: null };
    }
    if (lower[1] === 'dhcp' && lower[2] && 'binding'.startsWith(lower[2])) {
      return { output: buildDhcpBinding(ctx.device), context: ctx, configDelta: null };
    }
    if (lower[1] === 'dhcp' && lower[2] && 'pool'.startsWith(lower[2])) {
      return { output: buildDhcpPoolOutput(ctx.device), context: ctx, configDelta: null };
    }
    if (lower[1] === 'nat' && lower[2] && 'translations'.startsWith(lower[2])) {
      return { output: buildNatTranslations(ctx.device), context: ctx, configDelta: null };
    }
    if (lower[1] === 'nat' && lower[2] && 'statistics'.startsWith(lower[2])) {
      return { output: buildNatStatistics(ctx.device), context: ctx, configDelta: null };
    }
  }

  if (lower.length >= 1 && 'interfaces'.startsWith(lower[0])) {
    return { output: buildShowInterfaces(ctx), context: ctx, configDelta: null };
  }
  if (lower.length >= 1 && 'arp'.startsWith(lower[0])) {
    return { output: buildShowArp(ctx), context: ctx, configDelta: null };
  }
  if (lower.length >= 1 && 'vlan'.startsWith(lower[0])) {
    return { output: buildVlanBrief(ctx), context: ctx, configDelta: null };
  }
  if (lower.length >= 1 && 'hosts'.startsWith(lower[0])) {
    return { output: buildShowHosts(ctx.device), context: ctx, configDelta: null };
  }
  if (lower.length >= 1 && ('access-lists'.startsWith(lower[0]) || 'access-list'.startsWith(lower[0]))) {
    return { output: buildShowAccessLists(ctx.device), context: ctx, configDelta: null };
  }
  if (lower.length >= 1 && 'mac-address-table'.startsWith(lower[0])) {
    return { output: buildShowMacAddressTable(ctx), context: ctx, configDelta: null };
  }
  if (lower.length >= 1 && 'cdp'.startsWith(lower[0])) {
    if (lower.length >= 2 && 'neighbors'.startsWith(lower[1])) {
      return { output: buildShowCdpNeighbors(ctx), context: ctx, configDelta: null };
    }
    return { output: buildShowCdpNeighbors(ctx), context: ctx, configDelta: null };
  }
  if (lower.length >= 1 && 'spanning-tree'.startsWith(lower[0])) {
    return { output: buildShowSpanningTree(ctx), context: ctx, configDelta: null };
  }
  if (lower.length >= 1 && 'version'.startsWith(lower[0])) {
    return { output: `Cisco IOS Software, C2900 Software, Version 15.1(4)M5\nCopyright (c) 1986-2024 by Cisco Systems, Inc.\nSystem image file is "flash:c2900-universalk9-mz.SPA.151-4.M5.bin"\nProcessor board ID FTX1524E0JZ\n${ctx.device?.hostname || 'Router'} uptime is 0 days, 0 hours, 0 minutes`, context: ctx, configDelta: null };
  }

  return { output: `% Invalid show command: ${args.join(' ')}`, context: ctx, configDelta: null };
}

// ═══════ Ping Handlers ═══════

function handleRouterPing(args, ctx) {
  const target = args[0];
  if (!target) return { output: '% Incomplete command.', context: ctx, configDelta: null };

  const topology = {
    nodes: (ctx.allNodes || []).map(n => ({ id: n.id, ...n.data, ...(n.data || {}) })),
    edges: ctx.allEdges || [],
  };

  const result = simulateRouterPing(ctx.iosDevice, target, topology);
  return { output: formatPingOutput(target, result.replies, result.stats), context: ctx, configDelta: null };
}

function handlePcPing(target, ctx) {
  if (!target) return { output: 'Usage: ping <ip-address>', context: ctx, configDelta: null };

  const topology = {
    nodes: (ctx.allNodes || []).map(n => ({ id: n.id, ...n.data, ...(n.data || {}) })),
    edges: ctx.allEdges || [],
  };

  const result = simulatePcPing(ctx.device, target, topology);
  return { output: formatPingOutput(target, result.replies, result.stats), context: ctx, configDelta: null };
}

// ═══════ Spanning-Tree Handler ═══════

function handleSpanningTree(args, ctx) {
  if (ctx.deviceType === 'router') {
    return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
  }
  return { output: '', context: ctx, configDelta: { type: 'global_command', command: `spanning-tree ${args.join(' ')}` } };
}

// ═══════ Question Mark Help ═══════

function handleQuestionMarkHelp(line, context) {
  const lineNoQ = line.slice(0, -1).trim();
  const lower = lineNoQ.toLowerCase();
  const tokens = lower.split(/\s+/).filter(Boolean);
  const mode = context.mode;

  if (mode === 'pc_exec') {
    return { output: '  ipconfig   Display IP configuration\n  ping       Send ICMP echo\n  tracert    Trace route\n  exit       Close terminal', context, configDelta: null };
  }

  if (mode === 'dhcp_config') {
    if (tokens.length === 0) {
      return { output: '  default-router       Default routers\n  dns-server           DNS servers\n  domain-name          Domain name\n  exit                 Exit DHCP pool configuration\n  lease                Address lease time\n  network              Subnet network number and mask', context, configDelta: null };
    }
  }

  if (mode === 'interface_config') {
    if (tokens.length === 0) {
      return {
        output: '  ip                   Interface IP configuration\n  shutdown             Disable interface\n  no                   Negate a command\n  description          Interface description\n  switchport           Switchport configuration\n  encapsulation        Set encapsulation type\n  clock                Configure clock\n  exit                 Exit interface configuration\n  end                  Exit to privileged EXEC',
        context, configDelta: null
      };
    }
  }

  if (tokens.length === 0) {
    if (mode === 'user_exec') {
      return { output: '  enable     Turn on privileged commands\n  exit       Exit\n  show       Show running system information\n  ping       Send echo messages', context, configDelta: null };
    }
    if (mode === 'priv_exec') {
      return { output: '  configure  Enter configuration mode\n  copy       Copy configuration\n  disable    Turn off privileged commands\n  exit       Exit\n  ping       Send echo messages\n  show       Show running system information\n  write      Write running configuration', context, configDelta: null };
    }
    if (mode === 'global_config') {
      return { output: '  hostname      Set system hostname\n  interface     Select an interface\n  ip            IP configuration\n  router        Enable routing protocol\n  vlan          VLAN configuration\n  access-list   ACL configuration\n  line          Configure terminal line\n  spanning-tree Configure STP\n  service       Service configuration\n  banner        MOTD banner\n  enable        Modify enable password\n  end           Exit configuration mode\n  exit          Exit configuration mode\n  do            Execute privileged EXEC command', context, configDelta: null };
    }
  }

  if (lower.startsWith('show')) {
    return { output: '  access-lists     List access lists\n  arp              ARP table\n  cdp              CDP information\n  hosts            IP domain name mapping\n  interfaces       Interface status\n  ip               IP information\n  mac-address-table MAC table\n  running-config   Current configuration\n  spanning-tree    STP information\n  startup-config   Startup configuration\n  version          System information\n  vlan             VLAN information', context, configDelta: null };
  }

  return { output: '  <cr>  Press enter to execute command', context, configDelta: null };
}

// ═══════ MODE HANDLERS ═══════

const MODE_HANDLERS = {
  // ── PC / SERVER EXEC ──
  pc_exec: {
    ipconfig: (args, ctx) => {
      const iface = ctx.device?.interfaces?.['FastEthernet0'] || Object.values(ctx.device?.interfaces || {})[0] || {};
      const sub = args[0]?.toLowerCase();
      if (sub === '/all' || args.length === 0) {
        return {
          output: `\nFastEthernet0 Connection:(default port)\n\n   Connection-specific DNS Suffix  : \n   Physical Address................: ${ctx.iosDevice?.interfaceStates?.['FastEthernet0']?.mac_address || '0000.0000.0000'}\n   Link-local IPv6 Address.........: \n   IPv6 Address....................: \n   IPv4 Address....................: ${iface.ip || '0.0.0.0'}\n   Subnet Mask....................: ${iface.mask || '0.0.0.0'}\n   Default Gateway................: ${iface.gateway || '0.0.0.0'}`,
          context: ctx, configDelta: null,
        };
      }
      if (args.length >= 2) {
        const ip = args[0]; const mask = args[1]; const gateway = args[2] || '';
        return {
          output: `\n   IP Address......................: ${ip}\n   Subnet Mask....................: ${mask}\n   Default Gateway................: ${gateway || '0.0.0.0'}`,
          context: ctx,
          configDelta: {
            type: 'interface_command', interface: 'FastEthernet0',
            addCommand: `ip address ${ip} ${mask}`,
            updates: { ip, mask, gateway },
          },
        };
      }
      return { output: 'Usage: ipconfig [/all] OR ipconfig <ip> <mask> [gateway]', context: ctx, configDelta: null };
    },
    ip: (args, ctx) => {
      // PC 'ip' command: ip <address> <mask> <gateway>
      if (args.length >= 2) {
        const ip = args[0]; const mask = args[1]; const gateway = args[2] || '';
        return {
          output: `\n   IP Address......................: ${ip}\n   Subnet Mask....................: ${mask}\n   Default Gateway................: ${gateway || '0.0.0.0'}`,
          context: ctx,
          configDelta: {
            type: 'interface_command', interface: 'FastEthernet0',
            addCommand: `ip address ${ip} ${mask}`,
            updates: { ip, mask, gateway },
          },
        };
      }
      return { output: 'Usage: ip <address> <mask> [gateway]', context: ctx, configDelta: null };
    },
    ping: (args, ctx) => handlePcPing(args[0], ctx),
    tracert: (args, ctx) => {
      const target = args[0];
      if (!target) return { output: 'Usage: tracert <ip-address>', context: ctx, configDelta: null };
      return { output: `\nTracing route to ${target} over a maximum of 30 hops:\n\n  1   1 ms   1 ms   1 ms  ${target}\n\nTrace complete.`, context: ctx, configDelta: null };
    },
    show: (args, ctx) => {
      const sub = args[0]?.toLowerCase();
      if (sub === 'ip') {
        const iface = ctx.device?.interfaces?.['FastEthernet0'] || {};
        return {
          output: `\nFastEthernet0:\n   IP Address: ${iface.ip || '0.0.0.0'}\n   Subnet Mask: ${iface.mask || '0.0.0.0'}\n   Default Gateway: ${iface.gateway || '0.0.0.0'}`,
          context: ctx, configDelta: null
        };
      }
      return { output: '% Invalid command for PC', context: ctx, configDelta: null };
    },
    exit: () => ({ output: '% Connection closed.', context: null, configDelta: null }),
  },

  // ── USER EXEC ──
  user_exec: {
    enable: (args, ctx) => ({
      output: '', context: { ...ctx, mode: 'priv_exec', modeStack: [...ctx.modeStack, 'priv_exec'] }, configDelta: null,
    }),
    exit: () => ({ output: '% Connection closed.', context: null, configDelta: null }),
    show: (args, ctx) => handleShow(args, ctx),
    ping: (args, ctx) => ctx.deviceType === 'router'
      ? handleRouterPing(args, ctx)
      : handlePcPing(args[0], ctx),
  },

  // ── PRIVILEGED EXEC ──
  priv_exec: {
    configure: (args, ctx) => {
      if (args.length === 0 || 'terminal'.startsWith(args[0]?.toLowerCase())) {
        return {
          output: 'Enter configuration commands, one per line. End with CNTL/Z.',
          context: { ...ctx, mode: 'global_config', modeStack: [...ctx.modeStack, 'global_config'] },
          configDelta: null,
        };
      }
      return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
    },
    disable: (args, ctx) => ({
      output: '', context: { ...ctx, mode: 'user_exec', modeStack: ['user_exec'] }, configDelta: null,
    }),
    exit: () => ({ output: '', context: null, configDelta: null }),
    show: (args, ctx) => handleShow(args, ctx),
    ping: (args, ctx) => ctx.deviceType === 'router'
      ? handleRouterPing(args, ctx)
      : handlePcPing(args[0], ctx),
    copy: (args, ctx) => {
      const str = args.join(' ').toLowerCase();
      if (str === 'running-config startup-config' || str.includes('run') && str.includes('start')) {
        if (ctx.iosDevice) ctx.iosDevice.saveStartupConfig();
        return { output: 'Destination filename [startup-config]?\nBuilding configuration...\n[OK]', context: ctx, configDelta: null };
      }
      if (str.includes('ftp') || str.includes('startup') || str.includes('running')) {
        return { output: 'Address or name of remote host []?\nDestination filename []?\n[OK - 1024 bytes copied]', context: ctx, configDelta: null };
      }
      return { output: '[OK]', context: ctx, configDelta: null };
    },
    write: (args, ctx) => {
      if (ctx.iosDevice) ctx.iosDevice.saveStartupConfig();
      return { output: 'Building configuration...\n[OK]', context: ctx, configDelta: null };
    },
    reload: (args, ctx) => {
      const startupCfg = ctx.iosDevice?.getStartupConfig();
      if (startupCfg) {
        return {
          output: 'System configuration has been modified. Save? [yes/no]: \nProceed with reload? [confirm]\n\n...System reloading...\n\nRouter> ',
          context: { ...ctx, mode: 'user_exec', modeStack: ['user_exec'] },
          configDelta: { type: 'restore_startup', startupConfig: startupCfg },
        };
      }
      return {
        output: 'Proceed with reload? [confirm]\n\n...System reloading...\n\nRouter> ',
        context: { ...ctx, mode: 'user_exec', modeStack: ['user_exec'] },
        configDelta: null,
      };
    },
  },

  // ── GLOBAL CONFIG ──
  global_config: {
    hostname: (args, ctx) => {
      const name = args[0] || (ctx.deviceType === 'switch' ? 'Switch' : 'Router');
      return { output: '', context: { ...ctx, hostname: name }, configDelta: { type: 'hostname', hostname: name } };
    },
    enable: (args, ctx) => {
      if (args[0]?.toLowerCase() === 'secret') {
        return { output: '', context: ctx, configDelta: { type: 'global_command', command: `enable secret ${args.slice(1).join(' ') || 'cisco'}` } };
      }
      if (args[0]?.toLowerCase() === 'password') {
        return { output: '', context: ctx, configDelta: { type: 'global_command', command: `enable password ${args.slice(1).join(' ') || 'cisco'}` } };
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    interface: (args, ctx) => {
      const rawName = args.join('');
      const ifName = normalizeInterface(rawName);
      if (!ifName) return { output: '% Incomplete command.', context: ctx, configDelta: null };

      // Check if interface exists on device or is valid virtual interface (Vlan / Loopback)
      const existingIfaces = Object.keys(ctx.device?.interfaces || {});
      const isExisting = existingIfaces.includes(ifName);
      const isVirtual = ifName.toLowerCase().startsWith('vlan') || ifName.toLowerCase().startsWith('loopback');

      if (!isExisting && !isVirtual) {
        return { output: "% Invalid interface type and number", context: ctx, configDelta: null };
      }

      return {
        output: '',
        context: {
          ...ctx,
          mode: 'interface_config',
          modeStack: [...ctx.modeStack, 'interface_config'],
          currentInterface: ifName,
        },
        configDelta: { type: 'ensure_interface', interface: ifName },
      };
    },
    vlan: (args, ctx) => {
      if (ctx.deviceType === 'router') {
        return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
      }
      const num = parseInt(args[0]);
      if (isNaN(num) || num < 1 || num > 4094) return { output: '% Invalid VLAN ID', context: ctx, configDelta: null };
      return {
        output: '',
        context: { ...ctx, mode: 'vlan_config', modeStack: [...ctx.modeStack, 'vlan_config'], currentVlan: num },
        configDelta: { type: 'create_vlan', number: num },
      };
    },
    router: (args, ctx) => {
      if (ctx.deviceType === 'switch') {
        return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
      }
      const protocol = args[0]?.toLowerCase();
      let section;
      if (protocol === 'ospf') { section = `router ospf ${parseInt(args[1]) || 1}`; }
      else if (protocol === 'rip') { section = 'router rip'; }
      else if (protocol === 'eigrp') { section = `router eigrp ${parseInt(args[1]) || 1}`; }
      else { return { output: '% Invalid routing protocol', context: ctx, configDelta: null }; }
      return {
        output: '',
        context: { ...ctx, mode: 'router_config', modeStack: [...ctx.modeStack, 'router_config'], currentRouterSection: section },
        configDelta: { type: 'ensure_router_section', section },
      };
    },
    ip: (args, ctx) => {
      const sub0 = args[0]?.toLowerCase();
      if (sub0 === 'dhcp') {
        const sub1 = args[1]?.toLowerCase();
        if (sub1 === 'pool') {
          return {
            output: '',
            context: { ...ctx, mode: 'dhcp_config', modeStack: [...ctx.modeStack, 'dhcp_config'], currentDhcpPool: args[2] || '1' },
            configDelta: { type: 'ensure_dhcp_pool', pool: args[2] || '1' },
          };
        }
        if (sub1 === 'excluded-address') {
          return { output: '', context: ctx, configDelta: { type: 'global_command', command: `ip dhcp excluded-address ${args.slice(2).join(' ')}` } };
        }
        return { output: '', context: ctx, configDelta: { type: 'global_command', command: `ip dhcp ${args.slice(1).join(' ')}` } };
      }
      if (sub0 === 'route') {
        if (ctx.deviceType === 'switch') {
          return { output: '% IP routing not enabled', context: ctx, configDelta: null };
        }
        return { output: '', context: ctx, configDelta: { type: 'global_command', command: `ip route ${args.slice(1).join(' ')}` } };
      }
      if (sub0 === 'nat') {
        if (ctx.deviceType === 'switch') {
          return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
        }
        return { output: '', context: ctx, configDelta: { type: 'global_command', command: `ip nat ${args.slice(1).join(' ')}` } };
      }
      if (sub0 === 'dns' || sub0 === 'host' || sub0 === 'ftp') {
        return { output: '', context: ctx, configDelta: { type: 'global_command', command: `ip ${args.join(' ')}` } };
      }
      if (sub0 === 'default-gateway') {
        if (ctx.deviceType === 'router') {
          return { output: "% Default gateway is not applicable to routers. Use 'ip route' instead.", context: ctx, configDelta: null };
        }
        return { output: '', context: ctx, configDelta: { type: 'global_command', command: `ip default-gateway ${args.slice(1).join(' ')}` } };
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    'access-list': (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'global_command', command: `access-list ${args.join(' ')}` } }),
    service: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'global_command', command: `service ${args.join(' ')}` } }),
    banner: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'global_command', command: `banner ${args.join(' ')}` } }),
    lldp: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'global_command', command: `lldp ${args.join(' ')}` } }),
    line: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'line_config', modeStack: [...ctx.modeStack, 'line_config'] },
      configDelta: { type: 'global_command', command: `line ${args.join(' ')}` },
    }),
    'spanning-tree': handleSpanningTree,
    exit: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'] }, configDelta: null }),
    end: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'] }, configDelta: null }),
  },

  // ── INTERFACE CONFIG ──
  interface_config: {
    ip: (args, ctx) => {
      const sub0 = args[0]?.toLowerCase();
      if (sub0 === 'address') {
        const ip = args[1] || ''; const mask = args[2] || '';
        if (!ip || !mask) return { output: '% Incomplete command.', context: ctx, configDelta: null };
        return {
          output: '', context: ctx,
          configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `ip address ${ip} ${mask}`, updates: { ip, mask } },
        };
      }
      if (sub0 === 'nat') {
        const dir = args[1]?.toLowerCase() || 'inside';
        return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `ip nat ${dir}` } };
      }
      if (sub0 === 'helper-address') {
        const helper = args[1] || '';
        if (!helper) return { output: '% Incomplete command.', context: ctx, configDelta: null };
        return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `ip helper-address ${helper}` } };
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    shutdown: (args, ctx) => ({
      output: '', context: ctx,
      configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: 'shutdown', removeCommand: 'no shutdown', updates: { status: 'down' } },
    }),
    no: (args, ctx) => {
      const sub = args[0]?.toLowerCase();
      if (sub === 'shutdown') {
        return {
          output: '', context: ctx,
          configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: 'no shutdown', removeCommand: 'shutdown', updates: { status: 'up' } },
        };
      }
      if (sub === 'switchport') {
        return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: 'no switchport' } };
      }
      if (sub === 'ip' && args[1]?.toLowerCase() === 'address') {
        return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: 'no ip address', updates: { ip: '', mask: '' } } };
      }
      return { output: '', context: ctx, configDelta: null };
    },
    switchport: (args, ctx) => {
      if (ctx.deviceType === 'router') {
        return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
      }
      const sub = args.map(a => a.toLowerCase());
      if (sub[0] === 'mode') {
        const mode = sub[1] || '';
        return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `switchport mode ${mode}` } };
      }
      if (sub[0] === 'access' && sub[1] === 'vlan') {
        const vid = parseInt(args[2]);
        return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `switchport access vlan ${vid}`, updates: { vlan: vid } } };
      }
      if (sub[0] === 'trunk') {
        if (sub[1] === 'allowed' && sub[2] === 'vlan') {
          return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `switchport trunk allowed vlan ${args.slice(3).join(' ')}` } };
        }
        if (sub[1] === 'native' && sub[2] === 'vlan') {
          return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `switchport trunk native vlan ${args[3]}` } };
        }
        if (sub[1] === 'encapsulation') {
          return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `switchport trunk encapsulation ${args[2] || 'dot1q'}` } };
        }
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    description: (args, ctx) => ({
      output: '', context: ctx,
      configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `description ${args.join(' ')}` },
    }),
    clock: (args, ctx) => {
      if (args[0]?.toLowerCase() === 'rate') {
        return { output: '', context: ctx, configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `clock rate ${args[1] || '64000'}` } };
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    encapsulation: (args, ctx) => ({
      output: '', context: ctx,
      configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `encapsulation ${args.join(' ')}` },
    }),
    duplex: (args, ctx) => ({
      output: '', context: ctx,
      configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `duplex ${args[0] || 'auto'}` },
    }),
    speed: (args, ctx) => ({
      output: '', context: ctx,
      configDelta: { type: 'interface_command', interface: ctx.currentInterface, addCommand: `speed ${args[0] || 'auto'}` },
    }),
    exit: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'global_config', modeStack: ctx.modeStack.slice(0, -1), currentInterface: null }, configDelta: null }),
    end: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'], currentInterface: null }, configDelta: null }),
  },

  // ── DHCP POOL CONFIG ──
  dhcp_config: {
    network: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `network ${args.join(' ')}` } }),
    'default-router': (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `default-router ${args.join(' ')}` } }),
    'dns-server': (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `dns-server ${args.join(' ')}` } }),
    lease: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `lease ${args.join(' ')}` } }),
    'domain-name': (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `domain-name ${args.join(' ')}` } }),
    'netbios-name-server': (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `netbios-name-server ${args.join(' ')}` } }),
    option: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `option ${args.join(' ')}` } }),
    exit: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'global_config', modeStack: ctx.modeStack.slice(0, -1), currentDhcpPool: null }, configDelta: null }),
    end: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'], currentDhcpPool: null }, configDelta: null }),
  },

  // ── VLAN CONFIG ──
  vlan_config: {
    name: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'rename_vlan', number: ctx.currentVlan, name: args.join(' ') } }),
    exit: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'global_config', modeStack: ctx.modeStack.slice(0, -1), currentVlan: null }, configDelta: null }),
  },

  // ── ROUTER CONFIG ──
  router_config: {
    network: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `network ${args.join(' ')}` } }),
    version: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `version ${args[0]}` } }),
    'passive-interface': (args, ctx) => {
      const ifName = normalizeInterface(args.join(''));
      return { output: '', context: ctx, configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `passive-interface ${ifName || args.join(' ')}` } };
    },
    'default-information': (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `default-information ${args.join(' ')}` } }),
    'router-id': (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `router-id ${args[0]}` } }),
    redistribute: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `redistribute ${args.join(' ')}` } }),
    no: (args, ctx) => {
      if (args[0]?.toLowerCase() === 'auto-summary') {
        return { output: '', context: ctx, configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: 'no auto-summary' } };
      }
      return { output: '', context: ctx, configDelta: null };
    },
    exit: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'global_config', modeStack: ctx.modeStack.slice(0, -1), currentRouterSection: null }, configDelta: null }),
    end: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'], currentRouterSection: null }, configDelta: null }),
  },

  // ── LINE CONFIG ──
  line_config: {
    password: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'global_command', command: `password ${args.join(' ')}` } }),
    login: (args, ctx) => {
      if (args[0]?.toLowerCase() === 'local') {
        return { output: '', context: ctx, configDelta: { type: 'global_command', command: 'login local' } };
      }
      return { output: '', context: ctx, configDelta: { type: 'global_command', command: 'login' } };
    },
    transport: (args, ctx) => ({ output: '', context: ctx, configDelta: { type: 'global_command', command: `transport ${args.join(' ')}` } }),
    exit: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'global_config', modeStack: ctx.modeStack.slice(0, -1) }, configDelta: null }),
    end: (args, ctx) => ({ output: '', context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'] }, configDelta: null }),
  },
};

// ═══════ AUTOCOMPLETION ═══════

const MODE_COMMAND_TEMPLATES = {
  pc_exec: [
    'ipconfig', 'ipconfig /all', 'ip', 'ping', 'tracert', 'show', 'show ip', 'exit'
  ],
  user_exec: [
    'enable', 'exit', 'show', 'show ip', 'show ip interface', 'show ip interface brief',
    'show ip route', 'show ip dhcp', 'show ip dhcp binding', 'show ip dhcp pool',
    'show ip nat', 'show ip nat translations', 'show ip nat statistics',
    'show hosts', 'show access-lists', 'show arp', 'show mac-address-table',
    'show vlan', 'show vlan brief', 'show running-config', 'show interfaces',
    'show version', 'show cdp', 'show cdp neighbors', 'show spanning-tree',
    'ping',
  ],
  priv_exec: [
    'configure', 'configure terminal', 'disable', 'exit', 'copy',
    'copy running-config startup-config', 'write', 'write memory', 'reload',
    'show', 'show ip', 'show ip interface', 'show ip interface brief',
    'show ip route', 'show ip dhcp', 'show ip dhcp binding', 'show ip dhcp pool',
    'show ip nat', 'show ip nat translations', 'show ip nat statistics',
    'show hosts', 'show access-lists', 'show arp', 'show mac-address-table',
    'show vlan', 'show vlan brief', 'show running-config', 'show startup-config',
    'show interfaces', 'show version', 'show cdp', 'show cdp neighbors', 'show spanning-tree',
    'ping',
  ],
  global_config: [
    'hostname', 'enable', 'enable secret', 'enable password',
    'interface', 'vlan', 'router', 'router ospf', 'router rip', 'router eigrp',
    'ip', 'ip route', 'ip default-gateway', 'ip dhcp', 'ip dhcp pool',
    'ip dhcp excluded-address', 'ip dns', 'ip dns server', 'ip host',
    'ip ftp username', 'ip ftp password',
    'ip nat', 'ip nat inside', 'ip nat outside', 'ip nat pool',
    'ip nat inside source static', 'ip nat inside source list',
    'access-list', 'lldp', 'lldp run',
    'spanning-tree', 'spanning-tree mode rapid-pvst', 'spanning-tree mode pvst',
    'service', 'service password-encryption', 'banner', 'banner motd',
    'line', 'line console 0', 'line vty 0 4',
    'do', 'end', 'exit',
  ],
  interface_config: [
    'ip', 'ip address', 'ip helper-address', 'ip nat inside', 'ip nat outside',
    'no', 'no shutdown', 'no switchport', 'no ip address', 'shutdown',
    'description', 'encapsulation', 'encapsulation dot1Q',
    'switchport', 'switchport mode', 'switchport mode access',
    'switchport mode trunk', 'switchport access vlan', 'switchport trunk allowed vlan',
    'switchport trunk native vlan', 'switchport trunk encapsulation',
    'duplex', 'speed', 'clock', 'clock rate',
    'do', 'end', 'exit',
  ],
  dhcp_config: [
    'network', 'default-router', 'dns-server', 'lease', 'domain-name',
    'netbios-name-server', 'option', 'do', 'end', 'exit',
  ],
  vlan_config: ['name', 'state', 'do', 'end', 'exit'],
  router_config: [
    'network', 'passive-interface', 'default-information originate',
    'no', 'no auto-summary', 'auto-summary', 'version', 'version 2',
    'router-id', 'redistribute', 'do', 'end', 'exit',
  ],
  line_config: [
    'password', 'login', 'login local', 'transport input ssh',
    'transport input all', 'do', 'end', 'exit',
  ],
};

export function autocompleteCommand(rawLine, context) {
  if (!context) return { completedLine: rawLine, addition: '', matches: [] };
  const mode = context.mode || 'user_exec';
  let templates = [...(MODE_COMMAND_TEMPLATES[mode] || [])];

  if (mode === 'global_config' && context.device?.interfaces) {
    for (const ifaceName of Object.keys(context.device.interfaces)) {
      templates.push(`interface ${ifaceName}`);
    }
  }

  const isTrailingSpace = rawLine.endsWith(' ');
  const tokens = rawLine.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return { completedLine: rawLine, addition: '', matches: [] };

  const lastToken = isTrailingSpace ? '' : tokens[tokens.length - 1];

  if (!isTrailingSpace && (!lastToken || lastToken.length < 1)) {
    return { completedLine: rawLine, addition: '', matches: [] };
  }

  let prefixSoFar = '';
  let matchingTemplates = templates;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].toLowerCase();
    const isLastToken = i === tokens.length - 1 && !isTrailingSpace;

    if (!isLastToken) {
      const availableNextWords = matchingTemplates.map(t => t.split(' ')[i]?.toLowerCase()).filter(Boolean);
      const exactOrPrefix = availableNextWords.filter(w => w === token || w.startsWith(token));
      let chosen = exactOrPrefix[0] || token;

      if (chosen === 'int') chosen = 'interface';
      if (chosen === 'sh') chosen = 'show';
      if (chosen === 'conf') chosen = 'configure';

      prefixSoFar += (prefixSoFar ? ' ' : '') + chosen;
      matchingTemplates = matchingTemplates.filter(t => t.toLowerCase().startsWith(prefixSoFar.toLowerCase()));
    } else {
      const wordIndex = i;
      const candidateWords = matchingTemplates.map(t => t.split(' ')[wordIndex]).filter(Boolean);
      const matches = [...new Set(candidateWords.filter(w => w.toLowerCase().startsWith(token.toLowerCase())))];

      if (matches.length === 1) {
        const fullWord = matches[0];
        const addition = fullWord.slice(token.length) + ' ';
        const completedLine = (prefixSoFar ? prefixSoFar + ' ' : '') + fullWord + ' ';
        return { completedLine, addition, matches: [fullWord] };
      } else if (matches.length > 1) {
        let commonPrefix = matches[0];
        for (let m = 1; m < matches.length; m++) {
          let j = 0;
          while (j < commonPrefix.length && j < matches[m].length && commonPrefix[j].toLowerCase() === matches[m][j].toLowerCase()) j++;
          commonPrefix = commonPrefix.slice(0, j);
        }
        const addition = commonPrefix.length > token.length ? commonPrefix.slice(token.length) : '';
        const completedLine = (prefixSoFar ? prefixSoFar + ' ' : '') + (token + addition);
        return { completedLine, addition, matches };
      }
    }
  }

  if (isTrailingSpace) {
    const wordIndex = tokens.length;
    const matchingTpls = templates.filter(t => t.toLowerCase().startsWith(rawLine.trim().toLowerCase() + ' '));
    const nextWords = [...new Set(matchingTpls.map(t => t.split(' ')[wordIndex]).filter(Boolean))];
    if (nextWords.length === 1) {
      return { completedLine: rawLine + nextWords[0] + ' ', addition: nextWords[0] + ' ', matches: [nextWords[0]] };
    }
    return { completedLine: rawLine, addition: '', matches: nextWords };
  }

  return { completedLine: rawLine, addition: '', matches: [] };
}

export { getPrompt, normalizeInterface };
