import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { createCliContext, interpret, getPrompt, autocompleteCommand } from './CommandParser.js';
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
        const gc = [...(device.running_config?.global_commands || [])];
        if (!gc.includes(delta.command)) gc.push(delta.command);
        updateRunningConfig(deviceId, { global_commands: gc });
        break;
      }

      case 'interface_command': {
        const iface = device.interfaces?.[delta.interface] || {};
        const cmds = [...(iface.commands || [])];
        if (delta.removeCommand) {
          const idx = cmds.indexOf(delta.removeCommand);
          if (idx >= 0) cmds.splice(idx, 1);
        }
        if (delta.addCommand && !cmds.includes(delta.addCommand)) {
          cmds.push(delta.addCommand);
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
      scrollback: 1000,
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
      if (ctxRef.current) {
        ctxRef.current.device = freshDevice;
        ctxRef.current.allNodes = useProjectStore.getState().nodes;
        ctxRef.current.allEdges = useProjectStore.getState().edges;
      }

      const result = interpret(line, ctxRef.current);

      if (result.context === null) {
        xterm.writeln('% Connection closed. Reopen terminal.');
        ctxRef.current = createCliContext(freshDevice);
      } else {
        ctxRef.current = result.context;
      }

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
        minHeight: 200,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    />
  );
}
