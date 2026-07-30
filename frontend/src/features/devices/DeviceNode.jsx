import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getDeviceDef } from './DeviceRegistry.js';
import useProjectStore from '../../store/projectStore.js';

const DeviceNode = memo(({ id, data, selected }) => {
  const selectDevice = useProjectStore(s => s.selectDevice);
  const openTerminal = useProjectStore(s => s.openTerminal);
  const def = getDeviceDef(data.type);
  const color = def?.color || '#7C5CFC';
  const isEndDevice = data.type === 'pc' || data.type === 'server';

  const configuredPorts = Object.values(data.interfaces || {}).filter(
    i => i.ip || i.commands?.length > 0
  ).length;
  const totalPorts = Object.keys(data.interfaces || {}).length;

  return (
    <div
      className="device-node"
      onClick={() => selectDevice(id)}
      onDoubleClick={(e) => { e.stopPropagation(); openTerminal(id); }}
      style={{
        background: 'white',
        border: `2px solid ${selected ? color : '#E5E7EB'}`,
        borderRadius: 14,
        padding: '12px 16px',
        minWidth: 130,
        cursor: 'grab',
        boxShadow: selected
          ? `0 0 0 3px ${color}33, 0 4px 16px rgba(0,0,0,0.1)`
          : '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.2s ease, border 0.2s ease',
        textAlign: 'center',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {isEndDevice ? (
        <>
          <Handle type="source" position={Position.Left} style={handleStyle} id="port" isConnectable={true} />
          <Handle type="target" position={Position.Left} style={handleStyle} id="port" isConnectable={false} />
        </>
      ) : (
        <>
          <Handle type="target" position={Position.Top} style={handleStyle} id="top" isConnectable={true} />
          <Handle type="source" position={Position.Bottom} style={handleStyle} id="bottom" isConnectable={true} />
          <Handle type="target" position={Position.Left} style={handleStyle} id="left" isConnectable={true} />
          <Handle type="source" position={Position.Right} style={handleStyle} id="right" isConnectable={true} />
        </>
      )}
      {/* Device icon */}
      <div style={{ fontSize: 32, marginBottom: 4, lineHeight: 1 }}>
        {def?.icon || '📦'}
      </div>

      {/* Hostname */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 2 }}>
        {data.hostname}
      </div>

      {/* Type badge */}
      <div style={{
        fontSize: 10, fontWeight: 600, color: 'white',
        background: color, borderRadius: 100, padding: '2px 8px',
        display: 'inline-block', marginBottom: 4,
      }}>
        {data.type?.toUpperCase()}
      </div>

      {/* Port info */}
      <div style={{ fontSize: 10, color: '#9CA3AF' }}>
        {configuredPorts}/{totalPorts} port{totalPorts === 1 ? '' : 's'}
      </div>

      {/* CLI hint */}
      <div style={{ fontSize: 9, color: '#D1D5DB', marginTop: 2 }}>
        double-click → CLI
      </div>
    </div>
  );
});

DeviceNode.displayName = 'DeviceNode';

const handleStyle = {
  width: 14, height: 14,
  background: '#7C5CFC',
  border: '2px solid white',
  borderRadius: '50%',
  zIndex: 100,
};

export default DeviceNode;
