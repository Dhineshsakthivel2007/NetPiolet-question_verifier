import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getDeviceDef } from './DeviceRegistry.js';
import useProjectStore from '../../store/projectStore.js';
import { FaPlug, FaLock } from 'react-icons/fa';

/* ═══════════════════════════════════════════════════════════════
   Full Surface Handle Helper:
   Covers 100% of the node surface when cable tool is active so dragging
   a wire anywhere on the device completes connection 100% of the time!
   ═══════════════════════════════════════════════════════════════ */
const getFullSurfaceHandleStyle = (active) => ({
  position: 'absolute',
  top: 0, left: 0,
  width: '100%', height: '100%',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  opacity: 0,
  zIndex: active ? 15 : -1,
  pointerEvents: active ? 'all' : 'none',
  transform: 'none',
  minWidth: 0, minHeight: 0,
});

/* ═══════════════════════════════════════════════════════════════
   1. 3D Isometric Cisco Switch Component
   ═══════════════════════════════════════════════════════════════ */
function CiscoSwitch3DIcon({ selected }) {
  return (
    <div style={{
      width: 62, height: 40, position: 'relative', margin: '0 auto',
      filter: selected
        ? 'drop-shadow(0 0 8px rgba(56, 197, 248, 0.95)) drop-shadow(0 4px 10px rgba(0,0,0,0.2))'
        : 'drop-shadow(0 3px 6px rgba(0,0,0,0.14))',
      transform: selected ? 'scale(1.05)' : 'scale(1)',
      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      <svg width="62" height="40" viewBox="0 0 120 75" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="6,38 60,63 60,74 6,49" fill="#29A3DD" />
        <polygon points="60,63 114,38 114,49 60,74" fill="#1C75B5" />
        <polygon points="60,12 114,38 60,63 6,38" fill="url(#switchTopGrad)" />
        <polygon points="60,12 114,38 60,63 6,38" stroke="#BAE6FD" strokeWidth="1.5" strokeOpacity="0.7" />
        <g stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 36 34 L 54 25" /><path d="M 45 24 L 54 25 L 53 33" />
        </g>
        <g stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 84 41 L 66 50" /><path d="M 75 51 L 66 50 L 67 42" />
        </g>
        <g stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 66 25 L 84 34" /><path d="M 75 35 L 84 34 L 83 26" />
        </g>
        <g stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 54 50 L 36 41" /><path d="M 45 40 L 36 41 L 37 49" />
        </g>
        <defs>
          <linearGradient id="switchTopGrad" x1="6" y1="12" x2="114" y2="63" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4FD2FF" /><stop offset="1" stopColor="#38C5F8" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   2. 3D Isometric Cisco Router Component (Exact Match to User Reference Image 1)
   Cyan 3D Cylinder with 4 crisp white directional arrows in center
   ═══════════════════════════════════════════════════════════════ */
function CiscoRouter3DIcon({ selected }) {
  return (
    <div style={{
      width: 60, height: 40, position: 'relative', margin: '0 auto',
      filter: selected
        ? 'drop-shadow(0 0 8px rgba(56, 197, 248, 0.95)) drop-shadow(0 4px 10px rgba(0,0,0,0.2))'
        : 'drop-shadow(0 3px 6px rgba(0,0,0,0.14))',
      transform: selected ? 'scale(1.05)' : 'scale(1)',
      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      <svg width="60" height="40" viewBox="0 0 100 66" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="50" cy="46" rx="46" ry="16" fill="#1C75B5" />
        <rect x="4" y="20" width="92" height="26" fill="#29A3DD" />
        <ellipse cx="50" cy="20" rx="46" ry="16" fill="url(#routerTopGrad)" />
        <ellipse cx="50" cy="20" rx="46" ry="16" stroke="#BAE6FD" strokeWidth="1.2" strokeOpacity="0.8" fill="none" />
        <g stroke="#FFFFFF" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 50 14 L 50 7 M 45 11 L 50 6 L 55 11" />
          <path d="M 50 26 L 50 33 M 45 29 L 50 34 L 55 29" />
          <path d="M 44 20 L 37 20 M 41 15 L 36 20 L 41 25" />
          <path d="M 56 20 L 63 20 M 59 15 L 64 20 L 59 25" />
        </g>
        <defs>
          <linearGradient id="routerTopGrad" x1="4" y1="4" x2="96" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38C5F8" />
            <stop offset="1" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   3. 3D Isometric PC Tower Component
   ═══════════════════════════════════════════════════════════════ */
function CiscoPC3DIcon({ selected }) {
  return (
    <div style={{
      width: 46, height: 46, position: 'relative', margin: '0 auto',
      filter: selected
        ? 'drop-shadow(0 0 8px rgba(56, 197, 248, 0.95)) drop-shadow(0 4px 10px rgba(0,0,0,0.2))'
        : 'drop-shadow(0 3px 6px rgba(0,0,0,0.14))',
      transform: selected ? 'scale(1.05)' : 'scale(1)',
      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      <svg width="46" height="46" viewBox="0 0 80 84" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="10,22 46,22 46,80 10,80" fill="#29A3DD" />
        <polygon points="46,22 72,10 72,68 46,80" fill="#1C75B5" />
        <polygon points="10,22 36,10 72,10 46,22" fill="#4FD2FF" />
        <polygon points="10,22 36,10 72,10 46,22" stroke="#BAE6FD" strokeWidth="1" strokeOpacity="0.6" fill="none" />
        <rect x="13" y="28" width="28" height="9" fill="#0F172A" rx="1" stroke="#FFFFFF" strokeWidth="0.8" />
        <line x1="15" y1="32.5" x2="35" y2="32.5" stroke="#E0F2FE" strokeWidth="1" />
        <line x1="14" y1="41" x2="38" y2="41" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="14" y1="44" x2="38" y2="44" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="14" y1="47" x2="38" y2="47" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="14" y1="50" x2="38" y2="50" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="28" cy="57" r="3.2" fill="#FFFFFF" />
        <circle cx="28" cy="62" r="1.2" fill="#FFFFFF" />
        <line x1="18" y1="67" x2="38" y2="67" stroke="#0F172A" strokeWidth="1" opacity="0.75" />
        <line x1="18" y1="69" x2="38" y2="69" stroke="#0F172A" strokeWidth="1" opacity="0.75" />
        <line x1="18" y1="71" x2="38" y2="71" stroke="#0F172A" strokeWidth="1" opacity="0.75" />
        <line x1="18" y1="73" x2="38" y2="73" stroke="#0F172A" strokeWidth="1" opacity="0.75" />
        <line x1="18" y1="75" x2="38" y2="75" stroke="#0F172A" strokeWidth="1" opacity="0.75" />
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   4. 3D Isometric Cisco Server-PT Tower Component (Packet Tracer Match)
   Teal 3D Rack Tower with top display window slot
   ═══════════════════════════════════════════════════════════════ */
function CiscoServer3DIcon({ selected }) {
  return (
    <div style={{
      width: 44, height: 50, position: 'relative', margin: '0 auto',
      filter: selected
        ? 'drop-shadow(0 0 8px rgba(56, 197, 248, 0.95)) drop-shadow(0 4px 10px rgba(0,0,0,0.2))'
        : 'drop-shadow(0 3px 6px rgba(0,0,0,0.18))',
      transform: selected ? 'scale(1.05)' : 'scale(1)',
      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      <svg width="44" height="50" viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Front Face (Light Teal Gradient) */}
        <polygon points="10,24 50,24 50,92 10,92" fill="url(#serverFrontGrad)" />
        {/* Right Side Face (Dark Teal Shadow Side) */}
        <polygon points="50,24 74,10 74,78 50,92" fill="#155E75" />
        {/* Top Face (Top Cap) */}
        <polygon points="10,24 34,10 74,10 50,24" fill="#67E8F9" />
        <polygon points="10,24 34,10 74,10 50,24" stroke="#A5F3FC" strokeWidth="1" strokeOpacity="0.7" fill="none" />

        {/* Server Top Display Slot Window (Packet Tracer Server-PT Characteristic Window) */}
        <rect x="16" y="32" width="24" height="7" fill="#A5F3FC" rx="1.5" opacity="0.9" />
        <line x1="18" y1="35.5" x2="34" y2="35.5" stroke="#0891B2" strokeWidth="1.2" strokeLinecap="round" />

        {/* Server Drive Bays / Slots */}
        <rect x="14" y="46" width="28" height="3" fill="#0E7490" rx="0.5" opacity="0.6" />
        <rect x="14" y="52" width="28" height="3" fill="#0E7490" rx="0.5" opacity="0.6" />
        <rect x="14" y="58" width="28" height="3" fill="#0E7490" rx="0.5" opacity="0.6" />
        <rect x="14" y="64" width="28" height="3" fill="#0E7490" rx="0.5" opacity="0.6" />

        {/* LED Activity Indicators */}
        <circle cx="16" cy="76" r="1.8" fill="#A7F3D0" />
        <circle cx="22" cy="76" r="1.8" fill="#FDE68A" />
        <circle cx="28" cy="76" r="1.8" fill="#67E8F9" />

        {/* Bottom Air Vent Lines */}
        <line x1="14" y1="84" x2="38" y2="84" stroke="#0891B2" strokeWidth="1" opacity="0.5" />
        <line x1="14" y1="87" x2="38" y2="87" stroke="#0891B2" strokeWidth="1" opacity="0.5" />

        <defs>
          <linearGradient id="serverFrontGrad" x1="10" y1="24" x2="50" y2="92" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" />
            <stop offset="1" stopColor="#0891B2" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/* Helper to render matching 3D icon */
function DeviceIcon({ type, selected }) {
  switch (type) {
    case 'switch': return <CiscoSwitch3DIcon selected={selected} />;
    case 'router': return <CiscoRouter3DIcon selected={selected} />;
    case 'pc': return <CiscoPC3DIcon selected={selected} />;
    case 'server': return <CiscoServer3DIcon selected={selected} />;
    default: return <CiscoPC3DIcon selected={selected} />;
  }
}

/* ═══════════════════════════════════════════════════════════════
   DeviceNode — Sleek 3D Block (Compact Size, Full Surface Connectivity)
   ═══════════════════════════════════════════════════════════════ */
const DeviceNode = memo(({ id, data, selected }) => {
  const selectDevice = useProjectStore(s => s.selectDevice);
  const openTerminal = useProjectStore(s => s.openTerminal);
  const reconnectingCable = useProjectStore(s => s.reconnectingCable);
  const reconnectEdgeToNode = useProjectStore(s => s.reconnectEdgeToNode);
  const getDeviceCapacity = (type) => {
    if (type === 'switch') return 24;
    if (type === 'router') return 4;
    if (type === 'pc' || type === 'server') return 1;
    return 4;
  };

  const connectedCables = useProjectStore(
    useCallback(
      (state) => {
        const nodeIds = new Set((state.nodes || []).map(n => n.id));
        return (state.edges || []).filter(e =>
          e &&
          e.source &&
          e.target &&
          e.source !== e.target &&
          nodeIds.has(e.source) &&
          nodeIds.has(e.target) &&
          (e.source === id || e.target === id)
        ).length;
      },
      [id]
    )
  );

  const maxPorts = getDeviceCapacity(data.type);
  const isFull = connectedCables >= maxPorts;

  const cableToolActive = useProjectStore(s => s.cableToolActive);
  const cableToolSourceId = useProjectStore(s => s.cableToolSourceId);
  const handleCableToolClickDevice = useProjectStore(s => s.handleCableToolClickDevice);
  const isCableSource = cableToolSourceId === id;

  const handleClick = (e) => {
    if (cableToolActive) {
      e.stopPropagation();
      handleCableToolClickDevice(id, { x: e.clientX, y: e.clientY });
      return;
    }
    if (reconnectingCable) {
      e.stopPropagation();
      reconnectEdgeToNode(reconnectingCable.edgeId, id, reconnectingCable.side);
      return;
    }
    selectDevice(id);
  };

  const canConnect = cableToolActive && !isFull;

  return (
    <div
      className="device-node"
      onClick={handleClick}
      onDoubleClick={(e) => { e.stopPropagation(); openTerminal(id); }}
      style={{
        cursor: 'grab',
        userSelect: 'none',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 0,
        background: 'transparent',
        border: 'none',
        boxShadow: isCableSource ? '0 0 0 2.5px #F59E0B, 0 4px 14px rgba(245,158,11,0.4)' : 'none',
        borderRadius: 6,
        width: 64,
      }}
    >
      {/* ── Surface Handles: Aligned directly to the 3D block face to eliminate wire gap! ── */}
      {/* ── 100% Surface Handles: Covers 100% of node area so dragging & dropping ANYWHERE on the device completes connection! ── */}
      <Handle type="source" position={Position.Top} style={getFullSurfaceHandleStyle(canConnect)} id="src-full" isConnectable={canConnect} />
      <Handle type="target" position={Position.Top} style={getFullSurfaceHandleStyle(canConnect)} id="tgt-full" isConnectable={canConnect} />

      {/* 3D Isometric Device Icon */}
      <DeviceIcon type={data.type} selected={selected} />

      {/* Hostname & Model Labels (Packet Tracer Style) */}
      <div style={{
        fontSize: 8.5, fontWeight: 800, color: '#0F172A',
        marginTop: 1, textAlign: 'center',
        textShadow: '0 1px 2px rgba(255,255,255,0.95)',
        background: selected ? '#E0F2FE' : 'rgba(255,255,255,0.85)',
        border: selected ? '1px solid #7DD3FC' : '1px solid rgba(226,232,240,0.8)',
        padding: '1px 5px', borderRadius: 4,
        transition: 'all 0.2s ease',
        lineHeight: 1.25,
        maxWidth: 80,
      }}>
        <div style={{ fontSize: 7.5, color: '#475569', fontWeight: 700 }}>
          {data.model || (data.type === 'server' ? 'Server-PT' : data.type === 'pc' ? 'PC-PT' : data.type === 'router' ? 'Router-PT' : 'Switch-PT')}
        </div>
        <div>{data.hostname}</div>
      </div>

      {/* Port Indicator */}
      <div style={{
        fontSize: 8, fontWeight: 700, marginTop: 1, textAlign: 'center',
        color: isFull ? '#EF4444' : '#0284C7',
        background: isFull ? '#FEE2E2' : '#F0F9FF',
        border: `1px solid ${isFull ? '#FCA5A5' : '#BAE6FD'}`,
        padding: '1px 6px', borderRadius: 100,
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 3,
      }}>
        {isFull ? (
          <>
            <FaLock size={8} style={{ color: '#EF4444' }} />
            <span>{maxPorts}/{maxPorts}</span>
          </>
        ) : (
          <>
            <FaPlug size={8} style={{ color: '#0284C7' }} />
            <span>{connectedCables}/{maxPorts}</span>
          </>
        )}
      </div>
    </div>
  );
});

DeviceNode.displayName = 'DeviceNode';

export default DeviceNode;
