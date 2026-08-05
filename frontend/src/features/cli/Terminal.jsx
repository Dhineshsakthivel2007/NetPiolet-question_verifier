import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { createCliContext, interpret, getPrompt, autocompleteCommand } from './CommandParser.js';
import IosDevice from './IosDevice.js';
import useProjectStore from '../../store/projectStore.js';

export default function CliTerminal({ deviceId }) {
  const termRef = useRef(null);
  const xtermRef = useRef(null);
  const fitRef = useRef(null);
  const ctxRef = useRef(null);
  const lineRef = useRef('');
  const historyRef = useRef([]);
  const historyIdxRef = useRef(-1);

  const getDevice = useProjectStore(s => s.getDevice);
  const updateDeviceConfig = useProjectStore(s => s.updateDeviceConfig);
  const updateDeviceHostname = useProjectStore(s => s.updateDeviceHostname);
  const updateInterface = useProjectStore(s => s.updateInterface);
  const addVlan = useProjectStore(s => s.addVlan);
  const updateRunningConfig = useProjectStore(s => s.updateRunningConfig);

  const applyDelta = useCallback((delta) => {
    if (!delta) return;
    const device = getDevice(deviceId);
    if (!device) return;

    switch (delta.type) {
      case 'hostname':
        updateDeviceHostname(deviceId, delta.hostname);
        break;

      case 'global_command': {
        let gc = [...(device.running_config?.global_commands || [])];
        const newCmd = delta.command.trim();
        const lowerNew = newCmd.toLowerCase();

        if (lowerNew.startsWith('enable secret ')) {
          gc = gc.filter(c => !c.toLowerCase().startsWith('enable secret '));
        } else if (lowerNew.startsWith('enable password ')) {
          gc = gc.filter(c => !c.toLowerCase().startsWith('enable password '));
        } else if (lowerNew.startsWith('ip default-gateway ')) {
          gc = gc.filter(c => !c.toLowerCase().startsWith('ip default-gateway '));
        } else if (lowerNew.startsWith('banner motd ')) {
          gc = gc.filter(c => !c.toLowerCase().startsWith('banner motd '));
        }

        if (!gc.includes(newCmd)) gc.push(newCmd);
        updateRunningConfig(deviceId, { global_commands: gc });
        break;
      }

      case 'interface_command': {
        const iface = device.interfaces?.[delta.interface] || {};
        let cmds = [...(iface.commands || [])];

        if (delta.addCommand) {
          const newCmd = delta.addCommand.trim();
          const lowerNew = newCmd.toLowerCase();

          if (lowerNew.startsWith('ip address ')) {
            cmds = cmds.filter(c => !c.toLowerCase().startsWith('ip address '));
          } else if (lowerNew === 'no ip address') {
            cmds = cmds.filter(c => !c.toLowerCase().startsWith('ip address ') && !c.toLowerCase().startsWith('no ip address'));
          } else if (lowerNew.startsWith('description ')) {
            cmds = cmds.filter(c => !c.toLowerCase().startsWith('description '));
          } else if (lowerNew.startsWith('switchport mode ')) {
            cmds = cmds.filter(c => !c.toLowerCase().startsWith('switchport mode '));
          } else if (lowerNew.startsWith('switchport access vlan ')) {
            cmds = cmds.filter(c => !c.toLowerCase().startsWith('switchport access vlan '));
          } else if (lowerNew.startsWith('clock rate ')) {
            cmds = cmds.filter(c => !c.toLowerCase().startsWith('clock rate '));
          } else if (lowerNew === 'no shutdown') {
            cmds = cmds.filter(c => c.toLowerCase() !== 'shutdown');
          } else if (lowerNew === 'shutdown') {
            cmds = cmds.filter(c => c.toLowerCase() !== 'no shutdown');
          }

          if (delta.removeCommand) {
            cmds = cmds.filter(c => c.toLowerCase() !== delta.removeCommand.toLowerCase());
          }

          if (lowerNew !== 'no ip address' && !cmds.includes(newCmd)) {
            cmds.push(newCmd);
          }
        }

        updateInterface(deviceId, delta.interface, {
          ...iface,
          ...(delta.updates || {}),
          commands: cmds,
        });
        break;
      }

      case 'ensure_interface': {
        if (!device.interfaces?.[delta.interface]) {
          updateInterface(deviceId, delta.interface, {
            ip: '', mask: '', status: 'down', vlan: null, commands: [],
          });
        }
        break;
      }

      case 'create_vlan':
        addVlan(deviceId, delta.number, `VLAN${String(delta.number).padStart(4, '0')}`);
        break;

      case 'rename_vlan': {
        const vlans = [...(device.vlans || [])].map(v =>
          v.number === delta.number ? { ...v, name: delta.name } : v
        );
        updateDeviceConfig(deviceId, { vlans });
        break;
      }

      case 'ensure_router_section': {
        const rs = { ...(device.running_config?.router_sections || {}) };
        if (!rs[delta.section]) rs[delta.section] = [];
        updateRunningConfig(deviceId, { router_sections: rs });
        break;
      }

      case 'router_command': {
        const rs = { ...(device.running_config?.router_sections || {}) };
        const cmds = [...(rs[delta.section] || [])];
        if (!cmds.includes(delta.command)) cmds.push(delta.command);
        rs[delta.section] = cmds;
        updateRunningConfig(deviceId, { router_sections: rs });
        break;
      }

      case 'ensure_dhcp_pool': {
        const rs = { ...(device.running_config?.router_sections || {}) };
        const secName = `ip dhcp pool ${delta.pool}`;
        if (!rs[secName]) rs[secName] = [];
        updateRunningConfig(deviceId, { router_sections: rs });
        break;
      }

      case 'dhcp_pool_command': {
        const rs = { ...(device.running_config?.router_sections || {}) };
        const secName = `ip dhcp pool ${delta.pool}`;
        const cmds = [...(rs[secName] || [])];
        if (!cmds.includes(delta.command)) cmds.push(delta.command);
        rs[secName] = cmds;
        updateRunningConfig(deviceId, { router_sections: rs });
        break;
      }

      case 'remove_global_command': {
        const gc = [...(device.running_config?.global_commands || [])];
        const filtered = gc.filter(c => !c.startsWith(delta.prefix));
        updateRunningConfig(deviceId, { global_commands: filtered });
        break;
      }

      case 'restore_startup': {
        if (delta.startupConfig) {
          updateRunningConfig(deviceId, delta.startupConfig);
        }
        break;
      }
    }
  }, [deviceId, getDevice, updateDeviceConfig, updateDeviceHostname, updateInterface, addVlan, updateRunningConfig]);

  useEffect(() => {
    if (!termRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", monospace',
      theme: {
        background: '#1E1E2E',
        foreground: '#CDD6F4',
        cursor: '#F5E0DC',
        selectionBackground: '#45475A',
        black: '#45475A',
        red: '#F38BA8',
        green: '#A6E3A1',
        yellow: '#F9E2AF',
        blue: '#89B4FA',
        magenta: '#CBA6F7',
        cyan: '#94E2D5',
        white: '#BAC2DE',
      },
      scrollback: 10000,
      scrollSensitivity: 2,
      fastScrollSensitivity: 5,
      convertEol: true,
    });

    const fit = new FitAddon();
    xterm.loadAddon(fit);
    xterm.open(termRef.current);

    setTimeout(() => {
      try { fit.fit(); } catch {}
    }, 50);

    xtermRef.current = xterm;
    fitRef.current = fit;

    // Init CLI context
    const device = getDevice(deviceId);
    ctxRef.current = createCliContext(device);

    // Create IosDevice runtime state engine
    const allNodes = useProjectStore.getState().nodes;
    const allEdges = useProjectStore.getState().edges;
    const deviceDataForIos = { id: deviceId, ...device };
    ctxRef.current.iosDevice = new IosDevice(deviceDataForIos, allNodes.map(n => ({ id: n.id, ...n.data })), allEdges);
    ctxRef.current.allNodes = allNodes;
    ctxRef.current.allEdges = allEdges;

    // Welcome message
    xterm.writeln('\x1b[36m╔══════════════════════════════════════════╗\x1b[0m');
    xterm.writeln(`\x1b[36m║\x1b[0m  Cisco IOS CLI Simulator                \x1b[36m║\x1b[0m`);
    xterm.writeln(`\x1b[36m║\x1b[0m  Device: \x1b[33m${(device?.hostname || 'Unknown').padEnd(30)}\x1b[0m\x1b[36m║\x1b[0m`);
    xterm.writeln('\x1b[36m╚══════════════════════════════════════════╝\x1b[0m');
    xterm.writeln('');

    // Write prompt helper
    function writePrompt() {
      if (ctxRef.current) {
        const p = getPrompt(ctxRef.current);
        xterm.write(`\x1b[32m${p}\x1b[0m `);
      }
    }

    // Clear the visible line on terminal
    function clearLine() {
      const len = lineRef.current.length;
      for (let i = 0; i < len; i++) {
        xterm.write('\b \b');
      }
      lineRef.current = '';
    }

    // Process a completed line
    function processLine(line) {
      if (!line.trim()) {
        writePrompt();
        return;
      }

      historyRef.current.push(line);
      historyIdxRef.current = historyRef.current.length;

      // Get fresh device and canvas topology data
      const freshDevice = getDevice(deviceId);
      const freshNodes = useProjectStore.getState().nodes;
      const freshEdges = useProjectStore.getState().edges;
      if (ctxRef.current) {
        ctxRef.current.device = freshDevice;
        ctxRef.current.allNodes = freshNodes;
        ctxRef.current.allEdges = freshEdges;

        // Refresh IosDevice runtime state from latest topology
        const deviceDataForIos = { id: deviceId, ...freshDevice };
        if (ctxRef.current.iosDevice) {
          ctxRef.current.iosDevice.refresh(
            deviceDataForIos,
            freshNodes.map(n => ({ id: n.id, ...n.data })),
            freshEdges
          );
        } else {
          ctxRef.current.iosDevice = new IosDevice(
            deviceDataForIos,
            freshNodes.map(n => ({ id: n.id, ...n.data })),
            freshEdges
          );
        }
      }

      const result = interpret(line, ctxRef.current);

      if (result.context === null) {
        xterm.writeln('% Connection closed. Reopen terminal.');
        ctxRef.current = createCliContext(freshDevice);
      } else {
        ctxRef.current = result.context;
      }

      const isPingCmd = line.trim().toLowerCase().startsWith('ping');

      if (isPingCmd && result.output) {
        const outputLines = result.output.split('\n');
        let index = 0;

        const streamNextLine = () => {
          if (index < outputLines.length) {
            const currentLine = outputLines[index];
            xterm.writeln(currentLine);
            index++;

            // Calculate ICMP latency gap for realistic ping response delays
            let delayMs = 120;
            if (currentLine.includes('Reply from')) {
              delayMs = 550; // 550ms ICMP reply gap
            } else if (currentLine.includes('Request timed out') || currentLine.includes('unreachable')) {
              delayMs = 700; // 700ms ICMP timeout gap
            } else if (currentLine.startsWith('Pinging')) {
              delayMs = 350; // ARP request delay
            }

            setTimeout(streamNextLine, delayMs);
          } else {
            if (result.configDelta) {
              applyDelta(result.configDelta);
              const updated = getDevice(deviceId);
              if (ctxRef.current) ctxRef.current.device = updated;
            }
            writePrompt();
          }
        };

        streamNextLine();
      } else {
        if (result.output) {
          xterm.writeln(result.output);
        }
        if (result.configDelta) {
          applyDelta(result.configDelta);
          const updated = getDevice(deviceId);
          if (ctxRef.current) ctxRef.current.device = updated;
        }
        writePrompt();
      }
    }

    // Write initial prompt
    writePrompt();

    // Use onData — the reliable API for xterm.js v5
    // Data comes as raw strings:
    //   Regular chars: the char itself ('a', 'B', '1', ' ', etc.)
    //   Enter: '\r'
    //   Backspace: '\x7f' (DEL)
    //   Arrow Up: '\x1b[A'
    //   Arrow Down: '\x1b[B'
    //   Tab: '\t'
    //   Ctrl+C: '\x03'
    const disposable = xterm.onData((data) => {
      // Enter
      if (data === '\r') {
        const line = lineRef.current;
        xterm.write('\r\n');
        lineRef.current = '';
        processLine(line);
        return;
      }

      // Backspace (DEL char or BS char)
      if (data === '\x7f' || data === '\b') {
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1);
          xterm.write('\b \b');
        }
        return;
      }

      // Arrow Up — history previous
      if (data === '\x1b[A') {
        if (historyRef.current.length > 0 && historyIdxRef.current > 0) {
          historyIdxRef.current--;
          clearLine();
          const prev = historyRef.current[historyIdxRef.current];
          lineRef.current = prev;
          xterm.write(prev);
        }
        return;
      }

      // Arrow Down — history next
      if (data === '\x1b[B') {
        if (historyIdxRef.current < historyRef.current.length - 1) {
          historyIdxRef.current++;
          clearLine();
          const next = historyRef.current[historyIdxRef.current];
          lineRef.current = next;
          xterm.write(next);
        } else {
          clearLine();
          historyIdxRef.current = historyRef.current.length;
        }
        return;
      }

      // Tab — Cisco CLI Autocomplete
      if (data === '\t') {
        const freshDevice = getDevice(deviceId);
        if (ctxRef.current) ctxRef.current.device = freshDevice;
        const auto = autocompleteCommand(lineRef.current, ctxRef.current);
        if (auto.addition) {
          lineRef.current += auto.addition;
          xterm.write(auto.addition);
        } else if (auto.matches && auto.matches.length > 1) {
          xterm.write('\r\n' + auto.matches.join('  ') + '\r\n');
          writePrompt();
          xterm.write(lineRef.current);
        }
        return;
      }

      // Ctrl+C — cancel line
      if (data === '\x03') {
        xterm.write('^C\r\n');
        lineRef.current = '';
        writePrompt();
        return;
      }

      // Arrow Left/Right — ignore for simplicity
      if (data === '\x1b[C' || data === '\x1b[D') return;

      // Ignore other escape sequences
      if (data.startsWith('\x1b')) return;

      // Printable character(s) — xterm may send multiple chars at once (paste)
      for (const ch of data) {
        if (ch.charCodeAt(0) >= 32) { // printable
          lineRef.current += ch;
          xterm.write(ch);
        }
      }
    });

    // Resize observer
    const observer = new ResizeObserver(() => {
      try { fit.fit(); } catch {}
    });
    observer.observe(termRef.current);

    return () => {
      disposable.dispose();
      observer.disconnect();
      xterm.dispose();
    };
  }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={termRef}
      style={{
        height: '100%',
        width: '100%',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  );
}
