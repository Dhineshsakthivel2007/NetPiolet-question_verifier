import { useState, useRef, useEffect } from 'react';
import useProjectStore from '../../store/projectStore.js';
import { getDeviceDef } from '../devices/DeviceRegistry.js';

export default function PropertiesPanel() {
  const selectedDevice = useProjectStore(s => s.selectedDevice);
  const nodes = useProjectStore(s => s.nodes);
  const edges = useProjectStore(s => s.edges);
  const updateDeviceHostname = useProjectStore(s => s.updateDeviceHostname);
  const updateInterface = useProjectStore(s => s.updateInterface);
  const removeDevice = useProjectStore(s => s.removeDevice);
  const openTerminal = useProjectStore(s => s.openTerminal);
  const questionText = useProjectStore(s => s.questionText);
  const questionTitle = useProjectStore(s => s.questionTitle);

  const [expandedIface, setExpandedIface] = useState(null);

  // Question Panel Resizable & Expandable State
  const [questionPanelWidth, setQuestionPanelWidth] = useState(340);
  const [isQuestionExpanded, setIsQuestionExpanded] = useState(false);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const resizeStartXRef = useRef(0);
  const startWidthRef = useRef(340);

  const handlePanelResizeMouseDown = (e) => {
    e.preventDefault();
    setIsResizingPanel(true);
    resizeStartXRef.current = e.clientX;
    startWidthRef.current = questionPanelWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingPanel) return;
      const deltaX = resizeStartXRef.current - e.clientX;
      const newWidth = Math.max(280, Math.min(850, startWidthRef.current + deltaX));
      setQuestionPanelWidth(newWidth);
    };

    const handleMouseUp = () => setIsResizingPanel(false);

    if (isResizingPanel) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel]);

  const node = nodes.find(n => n.id === selectedDevice);
  const device = node?.data;

  // Helper to check if a specific interface has a cable connected
  const isPortConnected = (deviceId, ifaceName) => {
    return edges.some(e =>
      (e.source === deviceId && (e.data?.sourcePort === ifaceName || e.sourceHandle === ifaceName)) ||
      (e.target === deviceId && (e.data?.targetPort === ifaceName || e.targetHandle === ifaceName))
    );
  };

  if (!device) {
    const currentWidth = isQuestionExpanded ? 640 : questionPanelWidth;

    // Show question panel when no device is selected
    return (
      <div style={{
        width: currentWidth,
        height: '100%',
        maxHeight: '100vh',
        background: 'white',
        borderLeft: '1px solid #E5E7EB',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        transition: isResizingPanel ? 'none' : 'width 0.2s ease',
      }}>
        {/* Draggable Left Border Resize Handle */}
        <div
          onMouseDown={handlePanelResizeMouseDown}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'ew-resize',
            zIndex: 20,
            background: isResizingPanel ? '#7C5CFC' : 'transparent',
            transition: 'background 0.15s ease',
          }}
          title="Click & Drag left/right to resize question panel"
        />

        {/* Panel Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#F9FAFB',
          userSelect: 'none',
          flexShrink: 0,
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', letterSpacing: 1, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📖</span>
            <span>Question</span>
          </h3>

          <button
            onClick={() => setIsQuestionExpanded(!isQuestionExpanded)}
            style={{
              background: isQuestionExpanded ? '#7C5CFC' : '#F3E8FF',
              color: isQuestionExpanded ? 'white' : '#7C5CFC',
              border: '1px solid #C084FC',
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.2s ease',
            }}
            title={isQuestionExpanded ? 'Shrink Question Panel Width' : 'Expand Question Panel Width'}
          >
            {isQuestionExpanded ? '🗗 Shrink' : '⤢ Expand Question'}
          </button>
        </div>

        {/* Panel Content (Scrollable Container) */}
        <div style={{
          padding: 16,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {questionTitle && (
            <h4 style={{ fontSize: 15, fontWeight: 800, color: '#1E293B', margin: 0, lineHeight: 1.4 }}>
              {questionTitle}
            </h4>
          )}
          <div style={{
            fontSize: 13, lineHeight: 1.8, color: '#334155',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            padding: 14, background: '#F8FAFC',
            borderRadius: 10, border: '1px solid #E2E8F0',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            {questionText || 'Select a device on the canvas to edit its properties, connect cables, or open its terminal.'}
          </div>
        </div>
      </div>
    );
  }

  if (device.type === 'note') {
    const NOTE_THEMES = [
      { label: 'Yellow', bg: '#FEF3C7', border: '#F59E0B', text: '#1F2937' },
      { label: 'Blue', bg: '#EFF6FF', border: '#3B82F6', text: '#1E3A8A' },
      { label: 'Green', bg: '#ECFDF5', border: '#10B981', text: '#064E3B' },
      { label: 'Purple', bg: '#F5F3FF', border: '#8B5CF6', text: '#4C1D95' },
      { label: 'Dark', bg: '#1F2937', border: '#4B5563', text: '#F9FAFB' },
    ];

    return (
      <div style={{ width: 300, background: 'white', borderLeft: '1px solid #E5E7EB', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>📝 Edit Place Note</h3>
          <button onClick={() => useProjectStore.getState().selectDevice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9CA3AF' }}>✕</button>
        </div>
        <div style={{ padding: 14, flex: 1 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 4 }}>Note Content</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={device.text || ''}
              onChange={e => useProjectStore.getState().updateDeviceConfig(selectedDevice, { text: e.target.value })}
              placeholder="Enter note text (e.g. Subnet 192.168.1.0/24)..."
              style={{ width: '100%', fontSize: 13, padding: '8px 10px' }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>Font Size ({device.fontSize || 13}px)</label>
            <input
              type="range"
              min="10"
              max="24"
              value={device.fontSize || 13}
              onChange={e => useProjectStore.getState().updateDeviceConfig(selectedDevice, { fontSize: parseInt(e.target.value, 10) })}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>Note Color Theme</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {NOTE_THEMES.map(theme => (
                <button
                  key={theme.label}
                  onClick={() => useProjectStore.getState().updateDeviceConfig(selectedDevice, {
                    bgColor: theme.bg,
                    borderColor: theme.border,
                    color: theme.text,
                  })}
                  style={{
                    height: 28,
                    background: theme.bg,
                    border: `2px solid ${device.bgColor === theme.bg ? '#7C5CFC' : theme.border}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                  title={theme.label}
                />
              ))}
            </div>
          </div>

          <button className="btn btn-sm" onClick={() => removeDevice(selectedDevice)}
            style={{ width: '100%', background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', marginTop: 12 }}>
            🗑 Delete Note
          </button>
        </div>
      </div>
    );
  }

  const def = getDeviceDef(device.type);
  const ifaces = Object.entries(device.interfaces || {});
  const isPcOrServer = device.type === 'pc' || device.type === 'server';
  const primaryIfaceName = isPcOrServer ? (ifaces[0]?.[0] || 'FastEthernet0') : null;
  const primaryIface = primaryIfaceName ? device.interfaces?.[primaryIfaceName] || {} : null;
  const primaryConnected = primaryIfaceName ? isPortConnected(selectedDevice, primaryIfaceName) : false;

  return (
    <div style={{ width: 300, background: 'white', borderLeft: '1px solid #E5E7EB', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>Device Properties</h3>
        <button onClick={() => useProjectStore.getState().selectDevice(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9CA3AF' }}>✕</button>
      </div>

      <div style={{ padding: 14, flex: 1 }}>
        {/* Device Info */}
        <div style={{ textAlign: 'center', marginBottom: 16, padding: 14, background: '#F9FAFB', borderRadius: 12 }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>{def?.icon || '📦'}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'white', background: def?.color || '#7C5CFC', borderRadius: 100, padding: '2px 10px', display: 'inline-block' }}>
            {device.type?.toUpperCase()}
          </div>
        </div>

        {/* Hostname */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 4 }}>Device Hostname</label>
          <input
            className="form-input"
            value={device.hostname}
            onChange={e => updateDeviceHostname(selectedDevice, e.target.value)}
            style={{ fontSize: 14, padding: '8px 10px', width: '100%' }}
          />
        </div>

        {/* --- PC / SERVER IP CONFIGURATION --- */}
        {isPcOrServer && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1F2937' }}>🔌 Ethernet Interface</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                background: primaryConnected ? '#ECFDF5' : '#FEF2F2',
                color: primaryConnected ? '#10B981' : '#EF4444',
                border: `1px solid ${primaryConnected ? '#A7F3D0' : '#FECACA'}`,
              }}>
                {primaryConnected ? '🟢 Connected' : '🔴 Not Connected'}
              </span>
            </div>

            {!primaryConnected ? (
              <div style={{
                padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 8, color: '#DC2626', fontSize: 12, lineHeight: 1.5,
              }}>
                ⚠️ <strong>Ethernet cable not connected!</strong><br />
                Connect a cable from this PC to a Switch or Router on the canvas to configure IP address settings.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#4B5563', display: 'block', marginBottom: 2 }}>IP Address</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 192.168.1.10"
                    value={primaryIface?.ip || ''}
                    onChange={e => updateInterface(selectedDevice, primaryIfaceName, { ip: e.target.value })}
                    style={{ fontSize: 13, padding: '6px 8px', width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#4B5563', display: 'block', marginBottom: 2 }}>Subnet Mask</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 255.255.255.0"
                    value={primaryIface?.mask || ''}
                    onChange={e => updateInterface(selectedDevice, primaryIfaceName, { mask: e.target.value })}
                    style={{ fontSize: 13, padding: '6px 8px', width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#4B5563', display: 'block', marginBottom: 2 }}>Default Gateway</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 192.168.1.1"
                    value={primaryIface?.gateway || ''}
                    onChange={e => updateInterface(selectedDevice, primaryIfaceName, { gateway: e.target.value })}
                    style={{ fontSize: 13, padding: '6px 8px', width: '100%' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- ALL INTERFACES LIST --- */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>
            Interfaces ({ifaces.filter(([, i]) => i.ip).length}/{ifaces.length})
          </label>
          <div style={{ maxHeight: 220, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ifaces.map(([name, iface]) => {
              const connected = isPortConnected(selectedDevice, name);
              const isExpanded = expandedIface === name;
              const shortName = name.replace('FastEthernet', 'Fa').replace('GigabitEthernet', 'Gi').replace('Serial', 'Se');

              return (
                <div key={name} style={{
                  fontSize: 12, borderRadius: 8,
                  background: connected ? '#F0FDF4' : '#F9FAFB',
                  border: `1px solid ${connected ? '#BBF7D0' : '#F0F1F6'}`,
                  overflow: 'hidden',
                }}>
                  <div
                    onClick={() => setExpandedIface(isExpanded ? null : name)}
                    style={{
                      padding: '8px 10px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: connected ? '#10B981' : '#D1D5DB',
                      }} />
                      <span style={{ fontWeight: 600, color: '#374151' }}>{shortName}</span>
                    </div>
                    <span style={{ fontSize: 11, color: connected ? '#059669' : '#9CA3AF' }}>
                      {connected ? (iface.ip || 'Connected') : 'Disconnected'}
                    </span>
                  </div>

                  {/* Expanded Interface IP Editor for Routers/Switches */}
                  {isExpanded && !isPcOrServer && (
                    <div style={{ padding: '8px 10px', background: 'white', borderTop: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {!connected ? (
                        <span style={{ fontSize: 11, color: '#EF4444' }}>⚠️ Cable not connected to {shortName}</span>
                      ) : (
                        <>
                          <input
                            className="form-input"
                            placeholder="IP Address (e.g. 192.168.1.1)"
                            value={iface.ip || ''}
                            onChange={e => updateInterface(selectedDevice, name, { ip: e.target.value })}
                            style={{ fontSize: 12, padding: '4px 6px' }}
                          />
                          <input
                            className="form-input"
                            placeholder="Subnet Mask (e.g. 255.255.255.0)"
                            value={iface.mask || ''}
                            onChange={e => updateInterface(selectedDevice, name, { mask: e.target.value })}
                            style={{ fontSize: 12, padding: '4px 6px' }}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* VLANs list for switches */}
        {device.vlans?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>VLANs Database</label>
            {device.vlans.map(v => (
              <div key={v.number} style={{ fontSize: 12, padding: '4px 8px', display: 'flex', justifyContent: 'space-between', background: '#F9FAFB', borderRadius: 6, marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: '#7C5CFC' }}>VLAN {v.number}</span>
                <span style={{ color: '#6B7280' }}>{v.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={() => openTerminal(selectedDevice)} style={{ width: '100%' }}>
            🖥 Open CLI Terminal
          </button>
          <button className="btn btn-sm" onClick={() => removeDevice(selectedDevice)}
            style={{ width: '100%', background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
            🗑 Delete Device
          </button>
        </div>
      </div>
    </div>
  );
}
