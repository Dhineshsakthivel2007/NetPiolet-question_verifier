import { memo } from 'react';
import { getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

/**
 * Custom edge that shows port labels (e.g. "Fa0/1", "Gi0/0") at each end.
 * Also has a delete button on hover.
 */
const CableEdge = memo(({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
  style,
  markerEnd,
  selected,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });

  const sourcePort = data?.sourcePort || '';
  const targetPort = data?.targetPort || '';

  // Short port name for display
  const shortName = (port) => {
    if (!port) return '';
    return port
      .replace('FastEthernet', 'Fa')
      .replace('GigabitEthernet', 'Gi')
      .replace('Serial', 'Se');
  };

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          ...style,
          stroke: selected ? '#EF4444' : '#7C5CFC',
          strokeWidth: selected ? 3 : 2,
          cursor: 'pointer',
        }}
        markerEnd={markerEnd}
      />

      <EdgeLabelRenderer>
        {/* Source port label — near source end */}
        {sourcePort && (
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * 0.15}px, ${sourceY + (targetY - sourceY) * 0.15 - 12}px)`,
            pointerEvents: 'none',
            fontSize: 9,
            fontWeight: 700,
            fontFamily: '"JetBrains Mono", monospace',
            color: '#6B7280',
            background: 'rgba(255,255,255,0.9)',
            padding: '1px 5px',
            borderRadius: 4,
            border: '1px solid #E5E7EB',
            whiteSpace: 'nowrap',
          }}>
            {shortName(sourcePort)}
          </div>
        )}

        {/* Target port label — near target end */}
        {targetPort && (
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * 0.85}px, ${sourceY + (targetY - sourceY) * 0.85 - 12}px)`,
            pointerEvents: 'none',
            fontSize: 9,
            fontWeight: 700,
            fontFamily: '"JetBrains Mono", monospace',
            color: '#6B7280',
            background: 'rgba(255,255,255,0.9)',
            padding: '1px 5px',
            borderRadius: 4,
            border: '1px solid #E5E7EB',
            whiteSpace: 'nowrap',
          }}>
            {shortName(targetPort)}
          </div>
        )}

        {/* Cable type label — center */}
        <div style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          pointerEvents: 'none',
          fontSize: 8,
          fontWeight: 600,
          color: selected ? '#EF4444' : '#9CA3AF',
          background: 'rgba(255,255,255,0.85)',
          padding: '1px 4px',
          borderRadius: 3,
        }}>
          {selected ? '⌫ Del to remove' : '━━'}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

CableEdge.displayName = 'CableEdge';

export default CableEdge;
