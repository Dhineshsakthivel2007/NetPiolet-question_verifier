import { useState } from 'react';
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
    // Show question panel when no device is selected
    return (
      <div style={{ width: 300, background: 'white', borderLeft: '1px solid #E5E7EB', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid #E5E7EB' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>📖 Question</h3>
        </div>
        <div style={{ padding: 14, flex: 1 }}>
          {questionTitle && <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{questionTitle}</h4>}
          <div style={{
            fontSize: 13, lineHeight: 1.8, color: '#374151',
            whiteSpace: 'pre-wrap', padding: 12, background: '#F9FAFB',
            borderRadius: 10, border: '1px solid #F0F1F6',
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
