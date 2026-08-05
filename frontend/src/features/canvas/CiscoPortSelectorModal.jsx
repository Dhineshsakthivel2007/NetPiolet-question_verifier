import { memo } from 'react';

/**
 * Compact Cisco Packet Tracer Port Selection Menu
 */

function RJ45Icon({ type }) {
  let bg = '#FACC15'; // FastEthernet Yellow
  if (type === 'giga') bg = '#F97316'; // GigabitEthernet Orange
  if (type === 'serial') bg = '#EF4444'; // Serial Red
  if (type === 'console') bg = '#1E293B'; // Console Black

  return (
    <div style={{
      width: 11, height: 11,
      background: bg,
      borderRadius: 2,
      border: '1px solid rgba(0,0,0,0.5)',
      boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <div style={{ width: 4, height: 3, background: '#000', opacity: 0.6, borderRadius: 1 }} />
    </div>
  );
}

const CiscoPortSelectorModal = memo(({ selector, onSelect, onClose }) => {
  if (!selector) return null;

  const { deviceName, modelName, availablePorts, x, y } = selector;

  // Calculate smart position so popup stays on screen
  const popupLeft = Math.min(window.innerWidth - 180, Math.max(10, x));
  const popupTop = Math.min(window.innerHeight - 300, Math.max(10, y));

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: popupLeft,
        top: popupTop,
        zIndex: 99999,
        width: 165,
        background: '#2B2B2B',
        border: '1px solid #404040',
        borderRadius: 5,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.4)',
        fontFamily: '"JetBrains Mono", monospace, sans-serif',
        userSelect: 'none',
        overflow: 'hidden',
        animation: 'fadeIn 0.12s ease',
      }}
    >
      {/* Header bar showing device model */}
      <div style={{
        background: '#1E1E1E',
        padding: '4px 8px',
        borderBottom: '1px solid #3A3A3A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8' }}>
          {modelName || 'Device Ports'}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748B',
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
            padding: '0 2px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Port list */}
      <div style={{ maxHeight: 240, overflowY: 'auto', padding: '2px 0' }}>
        {availablePorts && availablePorts.length > 0 ? (
          availablePorts.map((port) => (
            <div
              key={port.name}
              onClick={() => onSelect(port.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '3.5px 8px',
                fontSize: 10.5,
                fontWeight: 600,
                color: '#F1F5F9',
                cursor: 'pointer',
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#404040'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <RJ45Icon type={port.type} />
              <span>{port.name}</span>
            </div>
          ))
        ) : (
          <div style={{ padding: '8px', fontSize: 10, color: '#EF4444', textAlign: 'center' }}>
            🔒 All ports connected!
          </div>
        )}
      </div>
    </div>
  );
});

CiscoPortSelectorModal.displayName = 'CiscoPortSelectorModal';

export default CiscoPortSelectorModal;
