/**
 * Cisco-like CLI Command Parser — table-driven interpreter with full Cisco IOS Router Simulation.
 *
 * Enforces Cisco IOS interface administrative states (default down for routers),
 * link status (up/up validation), subnet checking, routing table lookups,
 * connected/static/dynamic routes, ARP resolution, and show commands.
 */

// Interface name normalization
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
      'gigabitethernet': 'GigabitEthernet',
      'fastethernet': 'FastEthernet',
      'serial': 'Serial',
      'loopback': 'Loopback',
      'vlan': 'Vlan',
    };
    const canonical = canonicalMap[fullMatch[1].toLowerCase()] || fullMatch[1];
    return canonical + fullMatch[2];
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
    default: return `${h}>`;
  }
}

export function interpret(line, context) {
  const trimmed = line.trim();
  if (!trimmed) return { output: '', context, configDelta: null };

  // Help Autocomplete '?' handling
  if (trimmed.endsWith('?')) {
    return handleQuestionMarkHelp(trimmed, context);
  }

  const tokens = trimmed.split(/\s+/);
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  const handlers = MODE_HANDLERS[context.mode];
  if (!handlers) return { output: '% Unknown mode', context, configDelta: null };

  // Try exact match, then prefix match
  let handler = handlers[cmd];
  if (!handler) {
    const keys = Object.keys(handlers);
    const matches = keys.filter(k => k.startsWith(cmd));
    if (matches.length === 1) handler = handlers[matches[0]];
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
  }
  if (context.mode === 'router_config' && subcmd === 'auto-summary') {
    return {
      output: '',
      context,
      configDelta: {
        type: 'router_command',
        section: context.currentRouterSection,
        command: 'no auto-summary',
      },
    };
  }
  return { output: '', context, configDelta: null };
}

// ═══════ HELPER FUNCTIONS FOR CISCO IOS INTERFACE & LINK STATES ═══════

function isInterfaceAdminUp(device, ifaceName) {
  if (!device || !ifaceName) return false;
  const devType = device.type?.toLowerCase() || 'router';
  const iface = device.interfaces?.[ifaceName];
  if (!iface) return false;

  // PCs and Servers are up by default if configured
  if (devType === 'pc' || devType === 'server') {
    return iface.status !== 'down';
  }

  // Routers & Switches: interface is ONLY admin up if 'no shutdown' was executed or explicitly marked 'up'
  const cmds = iface.commands || [];
  const hasNoShutdown = cmds.some(c => c.toLowerCase() === 'no shutdown');
  const hasShutdown = cmds.some(c => c.toLowerCase() === 'shutdown');

  if (hasShutdown) return false;
  if (hasNoShutdown) return true;
  return iface.status === 'up';
}

function getInterfaceLinkStatus(device, ifaceName, allEdges = [], allNodes = []) {
  if (!device || !ifaceName) {
    return { status: 'administratively down', protocol: 'down' };
  }

  const devType = device.type?.toLowerCase() || 'router';
  const adminUp = isInterfaceAdminUp(device, ifaceName);

  if (!adminUp) {
    return { status: 'administratively down', protocol: 'down' };
  }

  // Check physical connection
  const edge = allEdges.find(e =>
    (e.source === device.id && e.sourceHandle === ifaceName) ||
    (e.target === device.id && e.targetHandle === ifaceName) ||
    (e.source === device.id) || (e.target === device.id)
  );

  if (!edge) {
    return { status: 'down', protocol: 'down' };
  }

  // Find partner node & interface
  const partnerId = edge.source === device.id ? edge.target : edge.source;
  const partnerNode = allNodes.find(n => n.id === partnerId);
  const partnerDevice = partnerNode?.data;

  if (partnerDevice) {
    const partnerIfaceName = edge.source === device.id ? edge.targetHandle : edge.sourceHandle;
    const partnerAdminUp = isInterfaceAdminUp(partnerDevice, partnerIfaceName || 'FastEthernet0/0');
    if (partnerAdminUp) {
      return { status: 'up', protocol: 'up' };
    }
  }

  return { status: 'up', protocol: 'down' };
}

function maskToCidr(mask) {
  if (!mask) return 24;
  return mask.split('.').reduce((acc, oct) => acc + (parseInt(oct, 10).toString(2).match(/1/g) || []).length, 0);
}

function ipToInt(ip) {
  if (!ip) return 0;
  return ip.split('.').reduce((acc, oct) => (acc << 8) + (parseInt(oct, 10) || 0), 0) >>> 0;
}

function getNetworkAddress(ip, mask) {
  if (!ip || !mask) return '0.0.0.0';
  const ipNum = ipToInt(ip);
  const maskNum = ipToInt(mask);
  const netNum = (ipNum & maskNum) >>> 0;
  return [
    (netNum >>> 24) & 255,
    (netNum >>> 16) & 255,
    (netNum >>> 8) & 255,
    netNum & 255,
  ].join('.');
}

function sameSubnet(ip1, ip2, mask) {
  if (!ip1 || !ip2 || !mask) return false;
  const m = ipToInt(mask);
  return (ipToInt(ip1) & m) === (ipToInt(ip2) & m);
}

// ═══════ QUESTION MARK (?) HELP ENGINE ═══════

function handleQuestionMarkHelp(line, context) {
  const lineNoQ = line.slice(0, -1).trim();
  const lower = lineNoQ.toLowerCase();
  const tokens = lower.split(/\s+/).filter(Boolean);
  const mode = context.mode;

  if (mode === 'dhcp_config') {
    if (tokens.length === 0) {
      return {
        output: `  default-router       Default routers\n  dns-server           DNS servers\n  domain-name          Domain name\n  exit                 Exit from DHCP pool configuration mode\n  lease                DHCP address lease time\n  netbios-name-server  NetBIOS name server\n  network              Subnet network number and mask\n  option               Raw DHCP option`,
        context, configDelta: null
      };
    }
    if (tokens[0] === 'network') return { output: '  A.B.C.D  Network number in IP address format\n  /prefix  Network prefix length', context, configDelta: null };
    if (tokens[0] === 'default-router') return { output: '  A.B.C.D  Default router IP address', context, configDelta: null };
    if (tokens[0] === 'dns-server') return { output: '  A.B.C.D  DNS server IP address', context, configDelta: null };
    if (tokens[0] === 'lease') return { output: '  <0-365>  Lease time in days', context, configDelta: null };
    if (tokens[0] === 'domain-name') return { output: '  WORD  Domain name string', context, configDelta: null };
    if (tokens[0] === 'netbios-name-server') return { output: '  A.B.C.D  NetBIOS name server IP address', context, configDelta: null };
    if (tokens[0] === 'option') return { output: '  <0-254>  DHCP option code number', context, configDelta: null };
  }

  if (mode === 'global_config') {
    if (lower === 'ip dhcp' || lower.startsWith('ip dhcp ')) {
      if (tokens.length === 2) {
        return {
          output: `  bootp             Configure BOOTP parameters\n  conflict          DHCP address conflict parameters\n  database          DHCP database agent\n  excluded-address  Prevent DHCP from assigning certain addresses\n  ping              Enable DHCP ping packets before assignment\n  pool              Configure DHCP pool name`,
          context, configDelta: null
        };
      }
      if (tokens[2] === 'pool') {
        return { output: '  WORD  DHCP pool name', context, configDelta: null };
      }
      if (tokens[2] === 'excluded-address') {
        return { output: '  A.B.C.D  Low IP address in excluded range', context, configDelta: null };
      }
    }

    if (lower === 'ip dns' || lower.startsWith('ip dns ')) {
      return { output: `  server  Enable DNS server\n  view    Configure DNS view`, context, configDelta: null };
    }

    if (lower === 'ip host' || lower.startsWith('ip host ')) {
      return { output: `  WORD  Name of host followed by IP address`, context, configDelta: null };
    }

    if (lower === 'ip nat' || lower.startsWith('ip nat ')) {
      if (tokens.length === 2) {
        return {
          output: `  inside       Inside translation\n  outside      Outside translation\n  pool         Define pool of dynamic IP addresses\n  translation  NAT translation parameters`,
          context, configDelta: null
        };
      }
      if (tokens[2] === 'pool') {
        return { output: '  WORD  Pool name followed by start IP, end IP, netmask/prefix-length', context, configDelta: null };
      }
      if (tokens[2] === 'inside') {
        if (tokens.length === 3) return { output: `  destination  Destination address translation\n  source       Source address translation`, context, configDelta: null };
        if (tokens[3] === 'source') {
          if (tokens.length === 4) return { output: `  list    Specify access-list containing local addresses\n  static  Specify static local address mapping`, context, configDelta: null };
          if (tokens[4] === 'static') return { output: '  A.B.C.D  Inside local IP address', context, configDelta: null };
          if (tokens[4] === 'list') return { output: '  <1-99>  IP standard access list number', context, configDelta: null };
        }
      }
    }

    if (lower === 'access-list' || lower.startsWith('access-list ')) {
      return { output: `  <1-99>     IP standard access list\n  <100-199>  IP extended access list`, context, configDelta: null };
    }
  }

  if (lower === 'show ip dhcp' || lower.startsWith('show ip dhcp ')) {
    return {
      output: `  binding   DHCP address bindings\n  conflict  DHCP address conflicts\n  pool      DHCP pool configuration & statistics\n  server    DHCP server information`,
      context, configDelta: null
    };
  }

  if (lower === 'show ip nat' || lower.startsWith('show ip nat ')) {
    return {
      output: `  statistics    NAT statistics\n  translations  NAT translation table`,
      context, configDelta: null
    };
  }

  if (lower === 'show' || lower.startsWith('show ')) {
    return {
      output: `  access-lists    List access lists\n  arp             ARP table\n  hosts           IP domain name-to-address mapping\n  interfaces      Interface status and configuration\n  ip              IP information\n  running-config  Current operating configuration\n  startup-config  Contents of startup configuration memory\n  vlan            VLAN information\n  version         System hardware and software status`,
      context, configDelta: null
    };
  }

  return { output: `  <cr>  Press enter to execute command`, context, configDelta: null };
}

// ═══════ MODE HANDLERS ═══════

const MODE_HANDLERS = {
  // ── PC / SERVER EXEC ──
  pc_exec: {
    ipconfig: (args, ctx) => {
      const iface = ctx.device?.interfaces?.['FastEthernet0'] || {};
      const sub = args[0]?.toLowerCase();
      if (sub === '/all' || args.length === 0) {
        return {
          output: `FastEthernet0 Connection-specific DNS Suffix: \nIP Address: ${iface.ip || '0.0.0.0'}\nSubnet Mask: ${iface.mask || '0.0.0.0'}\nDefault Gateway: ${iface.gateway || '0.0.0.0'}`,
          context: ctx,
          configDelta: null,
        };
      }
      if (args.length >= 2) {
        const ip = args[0];
        const mask = args[1];
        const gateway = args[2] || '';
        return {
          output: `IP Address set to ${ip}, Subnet Mask set to ${mask}`,
          context: ctx,
          configDelta: {
            type: 'interface_command',
            interface: 'FastEthernet0',
            addCommand: `ip address ${ip} ${mask}`,
            updates: { ip, mask, gateway },
          },
        };
      }
      return { output: 'Usage: ipconfig [/all] OR ipconfig <ip> <mask> [gateway]', context: ctx, configDelta: null };
    },
    ping: (args, ctx) => handlePcPing(args[0], ctx),
    tracert: (args, ctx) => {
      const target = args[0];
      if (!target) return { output: 'Usage: tracert <ip-address>', context: ctx, configDelta: null };
      return {
        output: `Tracing route to ${target} over a maximum of 30 hops:\n  1   1 ms   1 ms   1 ms  ${target}\nTrace complete.`,
        context: ctx,
        configDelta: null,
      };
    },
    ftp: (args, ctx) => {
      const sub = args[0]?.toLowerCase();
      if (sub === 'username') return { output: 'FTP username set.', context: ctx, configDelta: null };
      if (sub === 'password') return { output: 'FTP password set.', context: ctx, configDelta: null };
      if (sub === 'passive') return { output: 'FTP passive mode toggled.', context: ctx, configDelta: null };
      return { output: 'Usage: ftp <username | password | passive | host-ip>', context: ctx, configDelta: null };
    },
    exit: () => ({ output: '% Connection closed.', context: null, configDelta: null }),
  },

  // ── USER EXEC ──
  user_exec: {
    enable: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'priv_exec', modeStack: [...ctx.modeStack, 'priv_exec'] },
      configDelta: null,
    }),
    exit: () => ({ output: '% Connection closed.', context: null, configDelta: null }),
    show: (args, ctx) => handleShow(args, ctx),
    ping: (args, ctx) => handlePcPing(args[0], ctx),
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
      return { output: '% Invalid input', context: ctx, configDelta: null };
    },
    disable: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'user_exec', modeStack: ['user_exec'] },
      configDelta: null,
    }),
    exit: () => ({ output: '', context: null, configDelta: null }),
    show: (args, ctx) => handleShow(args, ctx),
    ping: (args, ctx) => handlePcPing(args[0], ctx),
    copy: (args, ctx) => {
      const str = args.join(' ').toLowerCase();
      if (str.includes('ftp') || str.includes('running-config') || str.includes('startup-config')) {
        return {
          output: 'Address or name of remote host []?\nDestination filename []?\n[OK - 1024 bytes copied]',
          context: ctx,
          configDelta: null,
        };
      }
      return { output: '[OK - 1024 bytes]', context: ctx, configDelta: null };
    },
    write: (args, ctx) => ({ output: 'Building configuration...\n[OK]', context: ctx, configDelta: null }),
  },

  // ── GLOBAL CONFIG ──
  global_config: {
    hostname: (args, ctx) => {
      const name = args[0] || (ctx.deviceType === 'switch' ? 'Switch' : 'Router');
      return {
        output: '',
        context: { ...ctx, hostname: name },
        configDelta: { type: 'hostname', hostname: name },
      };
    },
    enable: (args, ctx) => {
      if (args[0]?.toLowerCase() === 'secret') {
        const pass = args.slice(1).join(' ') || 'cisco';
        return {
          output: '',
          context: ctx,
          configDelta: { type: 'global_command', command: `enable secret ${pass}` },
        };
      }
      if (args[0]?.toLowerCase() === 'password') {
        const pass = args.slice(1).join(' ') || 'cisco';
        return {
          output: '',
          context: ctx,
          configDelta: { type: 'global_command', command: `enable password ${pass}` },
        };
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    interface: (args, ctx) => {
      const ifName = normalizeInterface(args.join(''));
      if (!ifName) return { output: '% Incomplete command.', context: ctx, configDelta: null };
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
        context: {
          ...ctx,
          mode: 'vlan_config',
          modeStack: [...ctx.modeStack, 'vlan_config'],
          currentVlan: num,
        },
        configDelta: { type: 'create_vlan', number: num },
      };
    },
    router: (args, ctx) => {
      if (ctx.deviceType === 'switch') {
        return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
      }
      const protocol = args[0]?.toLowerCase();
      let section;
      if (protocol === 'ospf') {
        const pid = parseInt(args[1]) || 1;
        section = `router ospf ${pid}`;
      } else if (protocol === 'rip') {
        section = 'router rip';
      } else if (protocol === 'eigrp') {
        const as = parseInt(args[1]) || 1;
        section = `router eigrp ${as}`;
      } else {
        return { output: '% Invalid routing protocol', context: ctx, configDelta: null };
      }
      return {
        output: '',
        context: {
          ...ctx,
          mode: 'router_config',
          modeStack: [...ctx.modeStack, 'router_config'],
          currentRouterSection: section,
        },
        configDelta: { type: 'ensure_router_section', section },
      };
    },
    ip: (args, ctx) => {
      const sub0 = args[0]?.toLowerCase();

      if (sub0 === 'dhcp') {
        const sub1 = args[1]?.toLowerCase();
        if (sub1 === 'pool') {
          const poolName = args[2] || '1';
          return {
            output: '',
            context: {
              ...ctx,
              mode: 'dhcp_config',
              modeStack: [...ctx.modeStack, 'dhcp_config'],
              currentDhcpPool: poolName,
            },
            configDelta: { type: 'ensure_dhcp_pool', pool: poolName },
          };
        }
        if (sub1 === 'excluded-address') {
          const range = args.slice(2).join(' ');
          return {
            output: '',
            context: ctx,
            configDelta: { type: 'global_command', command: `ip dhcp excluded-address ${range}` },
          };
        }
        return {
          output: '',
          context: ctx,
          configDelta: { type: 'global_command', command: `ip dhcp ${args.slice(1).join(' ')}` },
        };
      }

      if (sub0 === 'route') {
        if (ctx.deviceType === 'switch') {
          return { output: '% IP routing not enabled', context: ctx, configDelta: null };
        }
        const route = args.slice(1).join(' ');
        return {
          output: '',
          context: ctx,
          configDelta: { type: 'global_command', command: `ip route ${route}` },
        };
      }

      if (sub0 === 'nat') {
        const natCmd = `ip nat ${args.slice(1).join(' ')}`;
        return {
          output: '',
          context: ctx,
          configDelta: { type: 'global_command', command: natCmd },
        };
      }

      if (sub0 === 'dns' || sub0 === 'host') {
        const cmdStr = `ip ${args.join(' ')}`;
        return {
          output: '',
          context: ctx,
          configDelta: { type: 'global_command', command: cmdStr },
        };
      }

      if (sub0 === 'default-gateway') {
        return {
          output: '',
          context: ctx,
          configDelta: { type: 'global_command', command: `ip default-gateway ${args.slice(1).join(' ')}` },
        };
      }

      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    'access-list': (args, ctx) => {
      const aclCmd = `access-list ${args.join(' ')}`;
      return {
        output: '',
        context: ctx,
        configDelta: { type: 'global_command', command: aclCmd },
      };
    },
    service: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'global_command', command: `service ${args.join(' ')}` },
    }),
    banner: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'global_command', command: `banner ${args.join(' ')}` },
    }),
    line: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'line_config', modeStack: [...ctx.modeStack, 'line_config'] },
      configDelta: { type: 'global_command', command: `line ${args.join(' ')}` },
    }),
    spanning_tree: handleSpanningTree,
    'spanning-tree': handleSpanningTree,
    exit: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'] },
      configDelta: null,
    }),
    end: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'] },
      configDelta: null,
    }),
    show: (args, ctx) => handleShow(args, ctx),
  },

  // ── INTERFACE CONFIG ──
  interface_config: {
    ip: (args, ctx) => {
      const sub0 = args[0]?.toLowerCase();
      if (sub0 === 'address') {
        const ip = args[1] || '';
        const mask = args[2] || '';
        if (!ip || !mask) return { output: '% Incomplete command.', context: ctx, configDelta: null };
        return {
          output: '',
          context: ctx,
          configDelta: {
            type: 'interface_command',
            interface: ctx.currentInterface,
            addCommand: `ip address ${ip} ${mask}`,
            updates: { ip, mask },
          },
        };
      }
      if (sub0 === 'nat') {
        const dir = args[1]?.toLowerCase() || 'inside';
        return {
          output: '',
          context: ctx,
          configDelta: {
            type: 'interface_command',
            interface: ctx.currentInterface,
            addCommand: `ip nat ${dir}`,
          },
        };
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    shutdown: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: {
        type: 'interface_command',
        interface: ctx.currentInterface,
        addCommand: 'shutdown',
        removeCommand: 'no shutdown',
        updates: { status: 'down' },
      },
    }),
    no: (args, ctx) => {
      if (args[0]?.toLowerCase() === 'shutdown') {
        return {
          output: '',
          context: ctx,
          configDelta: {
            type: 'interface_command',
            interface: ctx.currentInterface,
            addCommand: 'no shutdown',
            removeCommand: 'shutdown',
            updates: { status: 'up' },
          },
        };
      }
      return { output: '', context: ctx, configDelta: null };
    },
    switchport: (args, ctx) => {
      const sub = args.map(a => a.toLowerCase());
      if (sub[0] === 'mode') {
        const mode = sub[1] || '';
        return {
          output: '',
          context: ctx,
          configDelta: {
            type: 'interface_command',
            interface: ctx.currentInterface,
            addCommand: `switchport mode ${mode}`,
          },
        };
      }
      if (sub[0] === 'access' && sub[1] === 'vlan') {
        const vid = parseInt(args[2]);
        return {
          output: '',
          context: ctx,
          configDelta: {
            type: 'interface_command',
            interface: ctx.currentInterface,
            addCommand: `switchport access vlan ${vid}`,
            updates: { vlan: vid },
          },
        };
      }
      if (sub[0] === 'trunk') {
        if (sub[1] === 'allowed' && sub[2] === 'vlan') {
          return {
            output: '',
            context: ctx,
            configDelta: {
              type: 'interface_command',
              interface: ctx.currentInterface,
              addCommand: `switchport trunk allowed vlan ${args.slice(3).join(' ')}`,
            },
          };
        }
        if (sub[1] === 'native' && sub[2] === 'vlan') {
          return {
            output: '',
            context: ctx,
            configDelta: {
              type: 'interface_command',
              interface: ctx.currentInterface,
              addCommand: `switchport trunk native vlan ${args[3]}`,
            },
          };
        }
        if (sub[1] === 'encapsulation') {
          return {
            output: '',
            context: ctx,
            configDelta: {
              type: 'interface_command',
              interface: ctx.currentInterface,
              addCommand: `switchport trunk encapsulation ${args[2] || 'dot1q'}`,
            },
          };
        }
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    description: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: {
        type: 'interface_command',
        interface: ctx.currentInterface,
        addCommand: `description ${args.join(' ')}`,
      },
    }),
    clock: (args, ctx) => {
      if (args[0]?.toLowerCase() === 'rate') {
        return {
          output: '',
          context: ctx,
          configDelta: {
            type: 'interface_command',
            interface: ctx.currentInterface,
            addCommand: `clock rate ${args[1] || '64000'}`,
          },
        };
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    encapsulation: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: {
        type: 'interface_command',
        interface: ctx.currentInterface,
        addCommand: `encapsulation ${args.join(' ')}`,
      },
    }),
    exit: (args, ctx) => ({
      output: '',
      context: {
        ...ctx,
        mode: 'global_config',
        modeStack: ctx.modeStack.slice(0, -1),
        currentInterface: null,
      },
      configDelta: null,
    }),
    end: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'], currentInterface: null },
      configDelta: null,
    }),
  },

  // ── DHCP POOL CONFIG ──
  dhcp_config: {
    network: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `network ${args.join(' ')}` },
    }),
    'default-router': (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `default-router ${args.join(' ')}` },
    }),
    'dns-server': (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `dns-server ${args.join(' ')}` },
    }),
    lease: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `lease ${args.join(' ')}` },
    }),
    'domain-name': (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `domain-name ${args.join(' ')}` },
    }),
    'netbios-name-server': (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `netbios-name-server ${args.join(' ')}` },
    }),
    option: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'dhcp_pool_command', pool: ctx.currentDhcpPool, command: `option ${args.join(' ')}` },
    }),
    exit: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'global_config', modeStack: ctx.modeStack.slice(0, -1), currentDhcpPool: null },
      configDelta: null,
    }),
    end: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'], currentDhcpPool: null },
      configDelta: null,
    }),
  },

  // ── VLAN CONFIG ──
  vlan_config: {
    name: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'rename_vlan', number: ctx.currentVlan, name: args.join(' ') },
    }),
    exit: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'global_config', modeStack: ctx.modeStack.slice(0, -1), currentVlan: null },
      configDelta: null,
    }),
  },

  // ── ROUTER CONFIG ──
  router_config: {
    network: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `network ${args.join(' ')}` },
    }),
    version: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `version ${args[0]}` },
    }),
    'passive-interface': (args, ctx) => {
      const ifName = normalizeInterface(args.join(''));
      return {
        output: '',
        context: ctx,
        configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `passive-interface ${ifName || args.join(' ')}` },
      };
    },
    'default-information': (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `default-information ${args.join(' ')}` },
    }),
    'router-id': (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `router-id ${args[0]}` },
    }),
    redistribute: (args, ctx) => ({
      output: '',
      context: ctx,
      configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: `redistribute ${args.join(' ')}` },
    }),
    exit: (args, ctx) => ({
      output: '',
      context: {
        ...ctx,
        mode: 'global_config',
        modeStack: ctx.modeStack.slice(0, -1),
        currentRouterSection: null,
      },
      configDelta: null,
    }),
    end: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'], currentRouterSection: null },
      configDelta: null,
    }),
  },

  // ── LINE CONFIG ──
  line_config: {
    password: (args, ctx) => ({
      output: '', context: ctx,
      configDelta: { type: 'global_command', command: `password ${args.join(' ')}` },
    }),
    login: (args, ctx) => ({
      output: '', context: ctx,
      configDelta: { type: 'global_command', command: 'login' },
    }),
    transport: (args, ctx) => ({
      output: '', context: ctx,
      configDelta: { type: 'global_command', command: `transport ${args.join(' ')}` },
    }),
    exit: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'global_config', modeStack: ctx.modeStack.slice(0, -1) },
      configDelta: null,
    }),
    end: (args, ctx) => ({
      output: '',
      context: { ...ctx, mode: 'priv_exec', modeStack: ['user_exec', 'priv_exec'] },
      configDelta: null,
    }),
  },
};

// ═══════ REALISTIC PACKET PROCESSOR & PING ENGINE ═══════

function handlePcPing(target, ctx) {
  if (!target) return { output: 'Usage: ping <ip-address>', context: ctx, configDelta: null };

  const pcIface = ctx.device?.interfaces?.['FastEthernet0'] || Object.values(ctx.device?.interfaces || {})[0] || {};
  const localIp = pcIface.ip || '';
  const localMask = pcIface.mask || '255.255.255.0';
  const localGateway = pcIface.gateway || '';
  const deviceId = ctx.device?.id || '';
  const allNodes = ctx.allNodes || [];
  const allEdges = ctx.allEdges || [];

  // Check 1: Physical Connection (Cable)
  const hasCable = allEdges.some(e => e.source === deviceId || e.target === deviceId);
  if (!hasCable) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nRequest timed out. (Ethernet cable disconnected)\nRequest timed out.\nRequest timed out.\nRequest timed out.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Check 2: Local Interface Admin State (no shutdown)
  const localIfaceName = ctx.device?.interfaces?.['FastEthernet0'] ? 'FastEthernet0' : Object.keys(ctx.device?.interfaces || {})[0] || 'FastEthernet0/0';
  const localLinkState = getInterfaceLinkStatus(ctx.device, localIfaceName, allEdges, allNodes);

  if (localLinkState.status === 'administratively down') {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nDestination host unreachable. (Interface is administratively down)\nDestination host unreachable.\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Check 3: Local IP Configured
  if (!localIp) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nDestination host unreachable. (Local IP address not configured)\nDestination host unreachable.\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Check 4: Self / Loopback Ping
  if (target === '127.0.0.1' || target === localIp) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Check 5: Target Host Lookup on Canvas
  let targetNode = null;
  let targetIfaceName = null;
  let targetIfaceObj = null;

  for (const node of allNodes) {
    const ifaces = node.data?.interfaces || {};
    for (const [ifName, ifObj] of Object.entries(ifaces)) {
      if (ifObj.ip === target) {
        targetNode = node;
        targetIfaceName = ifName;
        targetIfaceObj = ifObj;
        break;
      }
    }
    if (targetNode) break;
  }

  if (!targetNode || !targetIfaceObj) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nRequest timed out.\nRequest timed out.\nRequest timed out.\nRequest timed out.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Check 6: Target Interface Admin State (no shutdown)
  const targetAdminUp = isInterfaceAdminUp(targetNode.data, targetIfaceName);
  if (!targetAdminUp) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nRequest timed out. (Destination host interface is down)\nRequest timed out.\nRequest timed out.\nRequest timed out.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Check 7: Subnet & Routing Validation
  const isSameSubnet = sameSubnet(localIp, target, localMask);

  if (isSameSubnet) {
    // Same subnet: verify physical link protocol is up/up
    if (localLinkState.protocol === 'up') {
      return {
        output: `Pinging ${target} with 32 bytes of data:\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)`,
        context: ctx, configDelta: null,
      };
    }
    return {
      output: `Pinging ${target} with 32 bytes of data:\nRequest timed out.\nRequest timed out.\nRequest timed out.\nRequest timed out.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Different subnet: require valid Default Gateway & Router Routing Table Lookup
  if (!localGateway) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nDestination host unreachable. (Default gateway not configured)\nDestination host unreachable.\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Check if gateway IP is in local subnet
  if (!sameSubnet(localIp, localGateway, localMask)) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nDestination host unreachable. (Default gateway outside local subnet)\nDestination host unreachable.\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Find router node holding localGateway IP
  let routerNode = null;
  let routerIngressIface = null;

  for (const node of allNodes) {
    if (node.data?.type?.toLowerCase() === 'router') {
      const ifaces = node.data?.interfaces || {};
      for (const [ifName, ifObj] of Object.entries(ifaces)) {
        if (ifObj.ip === localGateway) {
          routerNode = node;
          routerIngressIface = ifName;
          break;
        }
      }
    }
    if (routerNode) break;
  }

  if (!routerNode || !isInterfaceAdminUp(routerNode.data, routerIngressIface)) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nDestination host unreachable. (Gateway router interface is down)\nDestination host unreachable.\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx, configDelta: null,
    };
  }

  // Check Router Routing Table for Route to Target Subnet
  const routerDevice = routerNode.data;
  const routerIfaces = Object.entries(routerDevice.interfaces || {});
  let hasRouteToTarget = false;

  // 1. Direct Connected Route (C) on Router
  for (const [rIfName, rIfObj] of routerIfaces) {
    if (rIfObj.ip && isInterfaceAdminUp(routerDevice, rIfName)) {
      if (sameSubnet(rIfObj.ip, target, rIfObj.mask || '255.255.255.0')) {
        hasRouteToTarget = true;
        break;
      }
    }
  }

  // 2. Static Route (S) on Router (ip route ...)
  if (!hasRouteToTarget) {
    const globalCmds = routerDevice.running_config?.global_commands || [];
    hasRouteToTarget = globalCmds.some(cmd => cmd.startsWith('ip route'));
  }

  // 3. Dynamic Route (OSPF/RIP/EIGRP) on Router
  if (!hasRouteToTarget) {
    const routerSections = routerDevice.running_config?.router_sections || {};
    hasRouteToTarget = Object.keys(routerSections).length > 0;
  }

  if (hasRouteToTarget) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)`,
      context: ctx, configDelta: null,
    };
  }

  return {
    output: `Pinging ${target} with 32 bytes of data:\nDestination host unreachable. (No route to destination host)\nDestination host unreachable.\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
    context: ctx, configDelta: null,
  };
}

// ── Show Command Handlers ──

function matchTokens(input, pattern) {
  if (input.length > pattern.length) return false;
  return input.every((tok, i) => pattern[i].startsWith(tok));
}

function handleShow(args, ctx) {
  const lower = args.map(a => a.toLowerCase());
  const fullCmd = lower.join(' ');

  let pipeKeyword = null;
  if (fullCmd.includes('|')) {
    const pipeIdx = lower.indexOf('|');
    if (pipeIdx > 0 && lower[pipeIdx + 1] === 'section') {
      pipeKeyword = lower[pipeIdx + 2] || '';
    }
  }

  if (lower.length >= 1 && ('running-config'.startsWith(lower[0]) || 'startup-config'.startsWith(lower[0]))) {
    let configStr = buildRunningConfig(ctx.device);
    if (pipeKeyword) {
      const sections = configStr.split('!');
      const matched = sections.filter(sec => sec.toLowerCase().includes(pipeKeyword));
      configStr = matched.join('!\n') || `% Section ${pipeKeyword} not found`;
    }
    return { output: configStr, context: ctx, configDelta: null };
  }

  if (lower.length >= 3 && lower[0] === 'ip' && lower[1] === 'dhcp' && lower[2].startsWith('bind')) {
    return { output: buildDhcpBinding(ctx.device), context: ctx, configDelta: null };
  }

  if (lower.length >= 3 && lower[0] === 'ip' && lower[1] === 'dhcp' && lower[2].startsWith('pool')) {
    return { output: buildDhcpPoolOutput(ctx.device), context: ctx, configDelta: null };
  }

  if (lower.length >= 3 && lower[0] === 'ip' && lower[1] === 'dhcp') {
    return { output: 'IP address        Detection method   Detection time\n---------------------------------------------------', context: ctx, configDelta: null };
  }

  if (lower.length >= 3 && lower[0] === 'ip' && lower[1] === 'nat' && lower[2].startsWith('trans')) {
    return { output: buildNatTranslations(ctx.device), context: ctx, configDelta: null };
  }

  if (lower.length >= 3 && lower[0] === 'ip' && lower[1] === 'nat' && lower[2].startsWith('stat')) {
    return { output: buildNatStatistics(ctx.device), context: ctx, configDelta: null };
  }

  if (lower.length >= 1 && 'hosts'.startsWith(lower[0])) {
    return { output: buildShowHosts(ctx.device), context: ctx, configDelta: null };
  }

  if (lower.length >= 1 && ('access-lists'.startsWith(lower[0]) || 'access-list'.startsWith(lower[0]))) {
    return { output: buildShowAccessLists(ctx.device), context: ctx, configDelta: null };
  }

  if (lower.length >= 1 && 'arp'.startsWith(lower[0])) {
    return { output: buildShowArp(ctx.device), context: ctx, configDelta: null };
  }

  if (lower.length >= 2 && matchTokens(lower, ['ip', 'interface', 'brief'])) {
    return { output: buildIpIntBrief(ctx.device, ctx.allEdges, ctx.allNodes), context: ctx, configDelta: null };
  }

  if (lower.length >= 2 && matchTokens(lower, ['ip', 'route'])) {
    if (ctx.deviceType === 'switch') {
      return { output: '% IP routing not enabled', context: ctx, configDelta: null };
    }
    return { output: buildRouteTable(ctx.device), context: ctx, configDelta: null };
  }

  if (lower.length >= 1 && 'vlan'.startsWith(lower[0])) {
    if (ctx.deviceType === 'router') {
      return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
    }
    return { output: buildVlanBrief(ctx.device), context: ctx, configDelta: null };
  }

  if (lower.length >= 1 && 'interfaces'.startsWith(lower[0])) {
    return { output: buildIpIntBrief(ctx.device, ctx.allEdges, ctx.allNodes), context: ctx, configDelta: null };
  }

  return { output: `% Invalid show command: ${args.join(' ')}`, context: ctx, configDelta: null };
}

function handleSpanningTree(args, ctx) {
  const cmd = `spanning-tree ${args.join(' ')}`;
  return { output: '', context: ctx, configDelta: { type: 'global_command', command: cmd } };
}

function buildRunningConfig(device) {
  if (!device) return '% No device context';
  const lines = ['Building configuration...', '', 'Current configuration:', `!`, `hostname ${device.hostname}`];
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

function buildIpIntBrief(device, allEdges = [], allNodes = []) {
  if (!device) return '% No device context';
  const header = 'Interface              IP-Address      OK? Method Status                Protocol';
  const sep = '─'.repeat(80);
  const rows = Object.entries(device.interfaces || {}).map(([name, iface]) => {
    const ip = iface.ip || 'unassigned';
    const linkState = getInterfaceLinkStatus(device, name, allEdges, allNodes);
    return `${name.padEnd(23)}${ip.padEnd(16)}YES manual ${linkState.status.padEnd(22)}${linkState.protocol}`;
  });
  return [header, sep, ...rows].join('\n');
}

function buildRouteTable(device) {
  if (!device) return '% No device context';

  const lines = [
    'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
    '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
    '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
    '       E1 - OSPF external type 1, E2 - OSPF external type 2',
    '',
    'Gateway of last resort is not set',
    '',
  ];

  // 1. Connected Routes (C) & Local Routes (L)
  for (const [ifName, iface] of Object.entries(device.interfaces || {})) {
    if (iface.ip && isInterfaceAdminUp(device, ifName)) {
      const mask = iface.mask || '255.255.255.0';
      const cidr = maskToCidr(mask);
      const netAddr = getNetworkAddress(iface.ip, mask);
      lines.push(`C    ${netAddr}/${cidr} is directly connected, ${ifName}`);
      lines.push(`L    ${iface.ip}/32 is directly connected, ${ifName}`);
    }
  }

  // 2. Static Routes (S)
  const staticRoutes = (device.running_config?.global_commands || [])
    .filter(c => c.startsWith('ip route'))
    .map(c => {
      const parts = c.replace('ip route ', '').split(/\s+/);
      const dest = parts[0] || '0.0.0.0';
      const mask = parts[1] || '0.0.0.0';
      const next = parts[2] || 'FastEthernet0/0';
      const cidr = maskToCidr(mask);
      return `S    ${dest}/${cidr} [1/0] via ${next}`;
    });

  for (const sr of staticRoutes) lines.push(sr);

  // 3. Dynamic Routes (O/R/D)
  const routerSections = device.running_config?.router_sections || {};
  for (const [secName, cmds] of Object.entries(routerSections)) {
    if (secName.startsWith('router ospf')) {
      for (const cmd of cmds) {
        if (cmd.startsWith('network')) {
          const parts = cmd.split(/\s+/);
          lines.push(`O    ${parts[1] || '172.16.0.0'}/16 [110/2] via 192.168.1.2, 00:04:12, FastEthernet0/0`);
        }
      }
    }
  }

  return lines.length > 7 ? lines.join('\n') : lines.join('\n') + '% No routes configured';
}

function buildShowArp(device) {
  const ip = device?.interfaces?.['FastEthernet0/0']?.ip || '192.168.1.1';
  return [
    'Protocol  Address          Age (min)  Hardware Addr   Type   Interface',
    `Internet  ${ip.padEnd(16)} -   0002.4A41.4519  ARPA   FastEthernet0/0`,
    'Internet  192.168.1.10            0   0060.2F41.8C01  ARPA   FastEthernet0/0',
  ].join('\n');
}

function buildDhcpBinding(device) {
  return [
    'IP address       Client-ID/Hardware address     Lease expiration        Type',
    '192.168.1.100    0060.2F41.8C01                 Aug 03 2026 15:30 PM    Automatic',
  ].join('\n');
}

function buildDhcpPoolOutput(device) {
  const sections = device?.running_config?.router_sections || {};
  const poolNames = Object.keys(sections).filter(k => k.startsWith('ip dhcp pool')).map(k => k.replace('ip dhcp pool ', ''));
  const poolName = poolNames[0] || 'MYPOOL';
  return [
    `Pool ${poolName} :`,
    `  Utilization mark (high/low)    : 100 / 0`,
    `  Subnet size (total/usable)     : 254 / 254`,
    `  Total addresses                : 254`,
    `  Leased addresses               : 1`,
    `  Pending event                  : none`,
    `  1 subnet is currently in the pool :`,
    `  Current index                  IP address range                    Leased addresses`,
    `  192.168.1.1                    192.168.1.1      - 192.168.1.254     1`,
  ].join('\n');
}

function buildNatTranslations(device) {
  const staticNats = (device?.running_config?.global_commands || [])
    .filter(c => c.startsWith('ip nat inside source static'))
    .map(c => {
      const parts = c.split(/\s+/);
      return `--- ${parts[5] || '200.1.1.10'}         ${parts[4] || '192.168.1.10'}       ---                ---`;
    });
  return [
    'Pro Inside global      Inside local       Outside local      Outside global',
    ...(staticNats.length > 0 ? staticNats : ['--- 200.1.1.10         192.168.1.10       ---                ---']),
  ].join('\n');
}

function buildNatStatistics(device) {
  return [
    'Total active translations: 1 (1 static, 0 dynamic; 0 extended)',
    'Outside interfaces:',
    '  Serial0/0/0',
    'Inside interfaces:',
    '  FastEthernet0/0, FastEthernet0/1',
    'Hits: 12  Misses: 0',
  ].join('\n');
}

function buildShowHosts(device) {
  const hosts = (device?.running_config?.global_commands || [])
    .filter(c => c.startsWith('ip host'))
    .map(c => {
      const parts = c.split(/\s+/);
      return `${(parts[2] || 'Host').padEnd(25)}None  (temp, ok)  0  IP     ${parts[3] || '192.168.1.10'}`;
    });
  return [
    'Default domain is not set',
    'Name/address lookup uses domain service',
    'Name servers are 8.8.8.8',
    '',
    'Host                      Port  Flags      Age Type   Address(es)',
    ...(hosts.length > 0 ? hosts : ['Server0                   None  (temp, ok)  0  IP     192.168.1.10']),
  ].join('\n');
}

function buildShowAccessLists(device) {
  const acls = (device?.running_config?.global_commands || [])
    .filter(c => c.startsWith('access-list'))
    .map(c => `    ${c.replace('access-list ', '')}`);
  return [
    'Standard IP access list 1',
    ...(acls.length > 0 ? acls : ['    10 permit 192.168.1.0, wildcard bits 0.0.0.255']),
  ].join('\n');
}

function buildVlanBrief(device) {
  if (!device) return '% No device context';
  const header = 'VLAN Name                             Status    Ports';
  const sep = '─'.repeat(60);
  const rows = (device.vlans || []).map(v => {
    const ports = Object.entries(device.interfaces || {})
      .filter(([, iface]) => iface.vlan === v.number)
      .map(([name]) => name)
      .join(', ');
    return `${String(v.number).padEnd(5)}${(v.name || `VLAN${String(v.number).padStart(4, '0')}`).padEnd(34)}active    ${ports}`;
  });
  return [header, sep, ...rows].join('\n');
}

// ═══════ AUTOCOMPLETION ENGINE ═══════

const MODE_COMMAND_TEMPLATES = {
  pc_exec: [
    'ipconfig', 'ipconfig /all', 'ping', 'tracert', 'ftp', 'ftp username', 'ftp password', 'ftp passive', 'exit'
  ],
  user_exec: [
    'enable', 'exit', 'show', 'show ip', 'show ip interface', 'show ip interface brief',
    'show ip route', 'show ip ospf', 'show ip dhcp', 'show ip dhcp binding', 'show ip dhcp pool',
    'show ip nat', 'show ip nat translations', 'show ip nat statistics', 'show hosts', 'show access-lists', 'show arp',
    'show vlan', 'show vlan brief', 'show running-config', 'show interfaces', 'show version'
  ],
  priv_exec: [
    'configure', 'configure terminal', 'disable', 'exit', 'copy',
    'copy ftp: running-config', 'copy running-config ftp:', 'copy startup-config ftp:', 'copy ftp: startup-config',
    'copy running-config startup-config', 'write', 'write memory',
    'show', 'show ip', 'show ip interface', 'show ip interface brief',
    'show ip route', 'show ip ospf', 'show ip dhcp', 'show ip dhcp binding', 'show ip dhcp pool',
    'show ip nat', 'show ip nat translations', 'show ip nat statistics', 'show hosts', 'show access-lists', 'show arp',
    'show vlan', 'show vlan brief', 'show running-config', 'show startup-config', 'show interfaces', 'show version'
  ],
  global_config: [
    'hostname', 'enable', 'enable secret', 'enable password',
    'interface', 'vlan', 'router', 'router ospf', 'router rip', 'router eigrp',
    'ip', 'ip route', 'ip default-gateway', 'ip dhcp', 'ip dhcp pool',
    'ip dhcp excluded-address', 'ip dns', 'ip dns server', 'ip dns view', 'ip host',
    'ip ftp username', 'ip ftp password',
    'ip nat', 'ip nat inside', 'ip nat outside', 'ip nat pool', 'ip nat inside source static', 'ip nat inside source list',
    'access-list', 'access-list 1 permit', 'access-list 1 deny',
    'lldp', 'lldp run', 'lldp enable',
    'spanning-tree', 'spanning-tree mode rapid-pvst', 'spanning-tree mode pvst',
    'service', 'service password-encryption', 'banner', 'banner motd',
    'line', 'line console 0', 'line vty 0 4', 'end', 'exit'
  ],
  interface_config: [
    'ip', 'ip address', 'ip helper-address', 'ip nat inside', 'ip nat outside',
    'no', 'no shutdown', 'no switchport', 'shutdown',
    'description', 'encapsulation', 'encapsulation dot1Q',
    'switchport', 'switchport mode', 'switchport mode access',
    'switchport mode trunk', 'switchport access vlan', 'switchport trunk allowed vlan',
    'switchport trunk native vlan',
    'duplex', 'speed', 'clock', 'clock rate', 'end', 'exit'
  ],
  dhcp_config: [
    'network', 'default-router', 'dns-server', 'lease', 'domain-name', 'netbios-name-server', 'option', 'end', 'exit'
  ],
  vlan_config: [
    'name', 'state', 'end', 'exit'
  ],
  router_config: [
    'network', 'area', 'passive-interface', 'default-information originate',
    'no', 'no auto-summary', 'auto-summary', 'version', 'version 2', 'end', 'exit'
  ],
  line_config: [
    'password', 'login', 'transport input ssh', 'transport input all', 'end', 'exit'
  ]
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

  if (tokens.length === 0) {
    return { completedLine: rawLine, addition: '', matches: [] };
  }

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
      const availableNextWords = matchingTemplates
        .map(t => t.split(' ')[i]?.toLowerCase())
        .filter(Boolean);

      const exactOrPrefix = availableNextWords.filter(w => w === token || w.startsWith(token));
      const chosen = exactOrPrefix[0] || token;

      let expanded = chosen;
      if (chosen === 'int') expanded = 'interface';
      if (chosen === 'sh') expanded = 'show';
      if (chosen === 'conf') expanded = 'configure';
      if (chosen === 't' && tokens[i - 1]?.toLowerCase() === 'configure') expanded = 'terminal';
      if (chosen === 'br' && tokens[i - 1]?.toLowerCase() === 'interface') expanded = 'brief';
      if (chosen === 'fa' || chosen === 'gi' || chosen === 's') expanded = normalizeInterface(chosen);

      prefixSoFar += (prefixSoFar ? ' ' : '') + expanded;
      matchingTemplates = matchingTemplates.filter(t => t.toLowerCase().startsWith(prefixSoFar.toLowerCase()));
    } else {
      const wordIndex = i;
      const candidateWords = matchingTemplates
        .map(t => t.split(' ')[wordIndex])
        .filter(Boolean);

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
          while (j < commonPrefix.length && j < matches[m].length && commonPrefix[j].toLowerCase() === matches[m][j].toLowerCase()) {
            j++;
          }
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
    const matchingTemplates = templates.filter(t => t.toLowerCase().startsWith(rawLine.trim().toLowerCase() + ' '));
    const nextWords = [...new Set(matchingTemplates.map(t => t.split(' ')[wordIndex]).filter(Boolean))];
    if (nextWords.length === 1) {
      const fullWord = nextWords[0];
      return { completedLine: rawLine + fullWord + ' ', addition: fullWord + ' ', matches: [fullWord] };
    }
    return { completedLine: rawLine, addition: '', matches: nextWords };
  }

  return { completedLine: rawLine, addition: '', matches: [] };
}

export { getPrompt, normalizeInterface };
