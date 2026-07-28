import { DEVICE_CATALOG } from './DeviceRegistry.js';

export default function DevicePalette() {
  const onDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow-type', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  const categories = {};
  DEVICE_CATALOG.forEach(d => {
    if (!categories[d.category]) categories[d.category] = [];
    categories[d.category].push(d);
  });

  return (
    <div style={{
      width: 180, background: 'white', borderRight: '1px solid #E5E7EB',
      display: 'flex', flexDirection: 'column', overflow: 'auto',
    }}>
      <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid #E5E7EB' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>
          Devices
        </h3>
      </div>

      {Object.entries(categories).map(([cat, devices]) => (
        <div key={cat} style={{ padding: '8px 10px' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
            {cat}
          </p>
          {devices.map(d => (
            <div
              key={d.type}
              draggable
              onDragStart={e => onDragStart(e, d.type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', marginBottom: 4, borderRadius: 10,
                cursor: 'grab', border: '1px solid #F0F1F6',
                background: '#FAFBFC', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F0F1F6'; e.currentTarget.style.borderColor = d.color; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FAFBFC'; e.currentTarget.style.borderColor = '#F0F1F6'; }}
            >
              <span style={{ fontSize: 22 }}>{d.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{d.label}</div>
                <div style={{ fontSize: 10, color: '#9CA3AF' }}>{d.defaultPorts.length} ports</div>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ padding: '10px 14px', marginTop: 'auto', borderTop: '1px solid #E5E7EB' }}>
        <p style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.5 }}>
          Drag devices onto the canvas. Double-click a device to open its CLI terminal.
        </p>
      </div>
    </div>
  );
}
