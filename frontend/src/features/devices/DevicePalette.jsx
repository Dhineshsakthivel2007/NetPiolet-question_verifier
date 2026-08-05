import { useRef } from 'react';
import useProjectStore from '../../store/projectStore.js';
import { DEVICE_CATALOG } from './DeviceRegistry.js';

export default function DevicePalette() {
  const dragImgRef = useRef(null);
  const cableToolActive = useProjectStore(s => s.cableToolActive);
  const toggleCableTool = useProjectStore(s => s.toggleCableTool);

  const onDragStart = (e, type, icon) => {
    e.dataTransfer.setData('application/reactflow-type', type);
    e.dataTransfer.effectAllowed = 'move';

    // Create a custom drag image that looks like the device
    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: fixed; top: -200px; left: -200px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 90px; height: 80px;
      background: white; border: 2px solid #7C5CFC; border-radius: 14px;
      box-shadow: 0 8px 24px rgba(124,92,252,0.3);
      font-size: 32px; padding: 6px;
      pointer-events: none; z-index: 99999;
    `;
    ghost.innerHTML = `<span style="font-size:32px">${icon}</span><span style="font-size:10px;font-weight:700;color:#4B5563;margin-top:2px">${type.toUpperCase()}</span>`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 45, 40);

    // Clean up drag image after a tick
    if (dragImgRef.current) document.body.removeChild(dragImgRef.current);
    dragImgRef.current = ghost;
    setTimeout(() => {
      if (dragImgRef.current) {
        try { document.body.removeChild(dragImgRef.current); } catch {}
        dragImgRef.current = null;
      }
    }, 0);
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

      {/* ── CONNECTIONS / CABLE TOOL SECTION ── */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #F3F4F6' }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
          CONNECTIONS
        </p>
        <div
          onClick={toggleCableTool}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
            border: cableToolActive ? '2px solid #F59E0B' : '1px solid #F0F1F6',
            background: cableToolActive ? '#FEF3C7' : '#FAFBFC',
            boxShadow: cableToolActive ? '0 2px 10px rgba(245, 158, 11, 0.25)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: 22 }}>⚡</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: cableToolActive ? '#B45309' : '#1F2937' }}>
              {cableToolActive ? '⚡ Cable Active' : 'Auto Cable Wire'}
            </div>
            <div style={{ fontSize: 9, fontWeight: 500, color: cableToolActive ? '#92400E' : '#9CA3AF', marginTop: 1 }}>
              {cableToolActive ? 'Click devices to connect' : 'Click 2 devices to connect'}
            </div>
          </div>
        </div>
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
              onDragStart={e => onDragStart(e, d.type, d.icon)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', marginBottom: 4, borderRadius: 10,
                cursor: 'grab', border: '1px solid #F0F1F6',
                background: '#FAFBFC', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F0F1F6'; e.currentTarget.style.borderColor = d.color; e.currentTarget.style.boxShadow = `0 2px 8px ${d.color}22`; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FAFBFC'; e.currentTarget.style.borderColor = '#F0F1F6'; e.currentTarget.style.boxShadow = 'none'; }}
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
