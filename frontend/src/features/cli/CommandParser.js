/**
 * Cisco-like CLI Command Parser — table-driven interpreter.
 *
 * Modes: user_exec, priv_exec, global_config, interface_config, vlan_config, router_config
 * Each mode has a command table. Commands mutate device config and return output.
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
  
  // Already a full canonical name — return as-is
  const fullMatch = name.match(/^(GigabitEthernet|FastEthernet|Serial|Loopback|Vlan)([\d/].*)$/i);
  if (fullMatch) {
    // Normalize capitalization
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
  
  // Try short alias expansion (fa0/1 → FastEthernet0/1, gi0/0 → GigabitEthernet0/0)
  const lower = name.toLowerCase();
  // Sort aliases longest-first to match 'gig' before 'gi' before 'g'
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
    if (subcmd === 'switchport') {
      return { output: '', context, configDelta: null };
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
    copy: (args, ctx) => ({ output: '[OK]', context: ctx, configDelta: null }),
    write: (args, ctx) => ({ output: '[OK]', context: ctx, configDelta: null }),
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
      if (args[0]?.toLowerCase() === 'route') {
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
      if (args[0]?.toLowerCase() === 'dhcp') {
        return { output: '', context: ctx, configDelta: null }; // simplified
      }
      if (args[0]?.toLowerCase() === 'default-gateway') {
        return {
          output: '',
          context: ctx,
          configDelta: { type: 'global_command', command: `ip default-gateway ${args.slice(1).join(' ')}` },
        };
      }
      return { output: '% Incomplete command.', context: ctx, configDelta: null };
    },
    service: (args, ctx) => {
      return {
        output: '',
        context: ctx,
        configDelta: { type: 'global_command', command: `service ${args.join(' ')}` },
      };
    },
    banner: (args, ctx) => {
      return {
        output: '',
        context: ctx,
        configDelta: { type: 'global_command', command: `banner ${args.join(' ')}` },
      };
    },
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
      if (args[0]?.toLowerCase() === 'address') {
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
      if (args[0]?.toLowerCase() === 'nat') {
        const dir = args[1]?.toLowerCase() || '';
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
    network: (args, ctx) => {
      const cmd = `network ${args.join(' ')}`;
      return {
        output: '',
        context: ctx,
        configDelta: { type: 'router_command', section: ctx.currentRouterSection, command: cmd },
      };
    },
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

function handlePcPing(target, ctx) {
  if (!target) return { output: 'Usage: ping <ip-address>', context: ctx, configDelta: null };

  const pcIface = ctx.device?.interfaces?.['FastEthernet0'] || Object.values(ctx.device?.interfaces || {})[0] || {};
  const localIp = pcIface.ip || '';
  const localMask = pcIface.mask || '';
  const localGateway = pcIface.gateway || '';
  const deviceId = ctx.device?.id || '';

  // 1. Check cable connection
  const allEdges = ctx.allEdges || [];
  const hasCable = allEdges.some(e => e.source === deviceId || e.target === deviceId);

  if (!hasCable) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nRequest timed out. (Ethernet cable disconnected)\nRequest timed out.\nRequest timed out.\nRequest timed out.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx,
      configDelta: null,
    };
  }

  // 2. Check if local IP is configured
  if (!localIp) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nDestination host unreachable. (Local IP address not configured)\nDestination host unreachable.\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx,
      configDelta: null,
    };
  }

  // 3. Self-ping / Loopback
  if (target === '127.0.0.1' || target === localIp) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)`,
      context: ctx,
      configDelta: null,
    };
  }

  // 4. Find if target IP exists anywhere on the canvas
  const allNodes = ctx.allNodes || [];
  let targetNode = null;

  for (const node of allNodes) {
    const ifaces = node.data?.interfaces || {};
    for (const [, ifObj] of Object.entries(ifaces)) {
      if (ifObj.ip === target) {
        targetNode = node;
        break;
      }
    }
    if (targetNode) break;
  }

  // Target IP does not exist on canvas
  if (!targetNode) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nRequest timed out.\nRequest timed out.\nRequest timed out.\nRequest timed out.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
      context: ctx,
      configDelta: null,
    };
  }

  // Subnet helper
  const ipToInt = ip => ip.split('.').reduce((acc, oct) => (acc << 8) + (parseInt(oct, 10) || 0), 0) >>> 0;
  const sameSubnet = (ip1, ip2, mask) => {
    if (!ip1 || !ip2 || !mask) return false;
    const m = ipToInt(mask);
    return (ipToInt(ip1) & m) === (ipToInt(ip2) & m);
  };

  const isSameSubnet = sameSubnet(localIp, target, localMask || '255.255.255.0');

  // If target is in same subnet
  if (isSameSubnet) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)`,
      context: ctx,
      configDelta: null,
    };
  }

  // If target is in different subnet: requires Default Gateway configured
  if (localGateway && sameSubnet(localIp, localGateway, localMask || '255.255.255.0')) {
    return {
      output: `Pinging ${target} with 32 bytes of data:\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\nReply from ${target}: bytes=32 time=1ms TTL=128\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)`,
      context: ctx,
      configDelta: null,
    };
  }

  // Subnet mismatch and no valid gateway
  return {
    output: `Pinging ${target} with 32 bytes of data:\nDestination host unreachable.\nDestination host unreachable.\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for ${target}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`,
    context: ctx,
    configDelta: null,
  };
}

// ── Show command handlers ──
// Helper: check if tokens match a pattern with prefix matching
// e.g. matchTokens(['ip', 'int', 'br'], ['ip', 'interface', 'brief']) => true
function matchTokens(input, pattern) {
  if (input.length !== pattern.length) return false;
  return input.every((tok, i) => pattern[i].startsWith(tok));
}

function handleShow(args, ctx) {
  const lower = args.map(a => a.toLowerCase());

  // show running-config / show run
  if (lower.length >= 1 && 'running-config'.startsWith(lower[0])) {
    return { output: buildRunningConfig(ctx.device), context: ctx, configDelta: null };
  }
  // show ip interface brief
  if (lower.length === 3 && matchTokens(lower, ['ip', 'interface', 'brief'])) {
    return { output: buildIpIntBrief(ctx.device), context: ctx, configDelta: null };
  }
  // show ip route (routers only)
  if (lower.length === 2 && matchTokens(lower, ['ip', 'route'])) {
    if (ctx.deviceType === 'switch') {
      return { output: '% IP routing not enabled', context: ctx, configDelta: null };
    }
    return { output: buildRouteTable(ctx.device), context: ctx, configDelta: null };
  }
  // show vlan / show vlan brief (switches only)
  if (lower.length >= 1 && 'vlan'.startsWith(lower[0])) {
    if (ctx.deviceType === 'router') {
      return { output: "% Invalid input detected at '^' marker.", context: ctx, configDelta: null };
    }
    return { output: buildVlanBrief(ctx.device), context: ctx, configDelta: null };
  }
  // show interfaces
  if (lower.length >= 1 && 'interfaces'.startsWith(lower[0])) {
    return { output: buildIpIntBrief(ctx.device), context: ctx, configDelta: null };
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

function buildIpIntBrief(device) {
  if (!device) return '% No device context';
  const header = 'Interface              IP-Address      OK? Method Status                Protocol';
  const sep = '─'.repeat(80);
  const rows = Object.entries(device.interfaces || {}).map(([name, iface]) => {
    const ip = iface.ip || 'unassigned';
    const status = iface.status === 'up' ? 'up' : 'administratively down';
    const proto = iface.status === 'up' ? 'up' : 'down';
    return `${name.padEnd(23)}${ip.padEnd(16)}YES manual ${status.padEnd(22)}${proto}`;
  });
  return [header, sep, ...rows].join('\n');
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

function buildRouteTable(device) {
  const routes = (device.running_config?.global_commands || [])
    .filter(c => c.startsWith('ip route'))
    .map(c => `S    ${c.replace('ip route ', '')}`)
    .join('\n');
  return routes || '% No static routes configured';
}

// ═══════ AUTOCOMPLETION ENGINE ═══════

// ═══════ AUTOCOMPLETION ENGINE ═══════

const MODE_COMMAND_TEMPLATES = {
  pc_exec: [
    'ipconfig', 'ipconfig /all', 'ping', 'tracert', 'exit'
  ],
  user_exec: [
    'enable', 'exit', 'show', 'show ip', 'show ip interface', 'show ip interface brief',
    'show ip route', 'show ip ospf', 'show vlan', 'show vlan brief',
    'show running-config', 'show interfaces', 'show version',
    'show mac-address-table', 'show cdp neighbors', 'show lldp'
  ],
  priv_exec: [
    'configure', 'configure terminal', 'disable', 'exit', 'copy',
    'copy running-config startup-config', 'write', 'write memory',
    'show', 'show ip', 'show ip interface', 'show ip interface brief',
    'show ip route', 'show ip ospf', 'show vlan', 'show vlan brief',
    'show running-config', 'show interfaces', 'show version',
    'show mac-address-table', 'show cdp neighbors', 'show lldp',
    'clear mac-address-table'
  ],
  global_config: [
    'hostname', 'enable', 'enable secret', 'enable password',
    'interface', 'vlan', 'router', 'router ospf', 'router rip', 'router eigrp',
    'ip', 'ip route', 'ip default-gateway', 'ip dhcp', 'ip dhcp pool',
    'ip dhcp excluded-address', 'ip domain-name', 'ip domain-lookup',
    'ip name-server', 'ip ftp username', 'ip ftp password',
    'ip nat', 'ip nat inside', 'ip nat outside', 'ip nat inside source static',
    'lldp', 'lldp run', 'lldp enable', 'no lldp run',
    'spanning-tree', 'spanning-tree mode rapid-pvst', 'spanning-tree mode pvst',
    'spanning-tree vlan 1 root primary', 'spanning-tree portfast bpduguard default',
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
    'spanning-tree', 'spanning-tree portfast', 'spanning-tree bpduguard enable',
    'bpduguard', 'lldp', 'lldp transmit', 'lldp receive',
    'duplex', 'duplex auto', 'duplex full', 'duplex half',
    'speed', 'speed auto', 'speed 100', 'clock', 'clock rate', 'end', 'exit'
  ],
  vlan_config: [
    'name', 'state', 'state active', 'state suspend', 'end', 'exit'
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

  // Dynamically add interface names if device interfaces are available in global_config
  if (mode === 'global_config' && context.device?.interfaces) {
    for (const ifaceName of Object.keys(context.device.interfaces)) {
      templates.push(`interface ${ifaceName}`);
    }
  }

  const isTrailingSpace = rawLine.endsWith(' ');
  const tokens = rawLine.trim().split(/\s+/).filter(Boolean);

  // STRICT REQUIREMENT: Autocomplete works ONLY if candidate typed at least 1 letter!
  if (tokens.length === 0) {
    return { completedLine: rawLine, addition: '', matches: [] };
  }

  const lastToken = isTrailingSpace ? '' : tokens[tokens.length - 1];

  // If candidate has not typed the first letter of the current token, return empty
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
