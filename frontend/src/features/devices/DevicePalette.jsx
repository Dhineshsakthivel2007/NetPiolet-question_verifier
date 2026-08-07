import { useRef } from 'react';
import useProjectStore from '../../store/projectStore.js';
import { DEVICE_CATALOG } from './DeviceRegistry.js';

function PaletteDeviceIcon({ type }) {
  if (type === 'router') {
    return (
      <div style={{ width: 26, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="26" height="20" viewBox="0 0 100 66" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="50" cy="46" rx="46" ry="16" fill="#1C75B5" />
          <rect x="4" y="20" width="92" height="26" fill="#29A3DD" />
          <ellipse cx="50" cy="20" rx="46" ry="16" fill="#38C5F8" stroke="#BAE6FD" strokeWidth="1.5" />
          <g stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 50 14 L 50 7 M 45 11 L 50 6 L 55 11" />
            <path d="M 50 26 L 50 33 M 45 29 L 50 34 L 55 29" />
            <path d="M 44 20 L 37 20 M 41 15 L 36 20 L 41 25" />
            <path d="M 56 20 L 63 20 M 59 15 L 64 20 L 59 25" />
          </g>
        </svg>
      </div>
    );
  }
  if (type === 'switch') {
    return (
      <div style={{ width: 26, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="26" height="18" viewBox="0 0 120 75" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="6,38 60,63 60,74 6,49" fill="#29A3DD" />
          <polygon points="60,63 114,38 114,49 60,74" fill="#1C75B5" />
          <polygon points="60,12 114,38 60,63 6,38" fill="#4FD2FF" stroke="#BAE6FD" strokeWidth="2" />
          <g stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 36 34 L 54 25" /><path d="M 45 24 L 54 25 L 53 33" />
            <path d="M 84 41 L 66 50" /><path d="M 75 51 L 66 50 L 67 42" />
            <path d="M 66 25 L 84 34" /><path d="M 75 35 L 84 34 L 83 26" />
            <path d="M 54 50 L 36 41" /><path d="M 45 40 L 36 41 L 37 49" />
          </g>
        </svg>
      </div>
    );
  }
  if (type === 'pc') {
    return (
      <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="22" viewBox="0 0 80 84" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="10,22 46,22 46,80 10,80" fill="#29A3DD" />
          <polygon points="46,22 72,10 72,68 46,80" fill="#1C75B5" />
          <polygon points="10,22 36,10 72,10 46,22" fill="#4FD2FF" />
          <rect x="13" y="28" width="28" height="9" fill="#0F172A" rx="1" />
          <line x1="14" y1="41" x2="38" y2="41" stroke="#FFFFFF" strokeWidth="1.5" />
          <line x1="14" y1="45" x2="38" y2="45" stroke="#FFFFFF" strokeWidth="1.5" />
          <line x1="14" y1="49" x2="38" y2="49" stroke="#FFFFFF" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }
  if (type === 'server') {
    return (
      <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="22" viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="10,24 50,24 50,92 10,92" fill="#0891B2" />
          <polygon points="50,24 74,10 74,78 50,92" fill="#155E75" />
          <polygon points="10,24 34,10 74,10 50,24" fill="#67E8F9" />
          <rect x="16" y="32" width="24" height="7" fill="#A5F3FC" rx="1.5" />
          <rect x="14" y="46" width="28" height="3" fill="#0E7490" />
          <rect x="14" y="52" width="28" height="3" fill="#0E7490" />
          <rect x="14" y="58" width="28" height="3" fill="#0E7490" />
        </svg>
      </div>
    );
  }
  return <span style={{ fontSize: 18 }}>📝</span>;
}

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
              <PaletteDeviceIcon type={d.type} />
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
