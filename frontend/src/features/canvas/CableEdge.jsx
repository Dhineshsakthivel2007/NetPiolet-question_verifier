import { memo } from 'react';
import { getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import useProjectStore from '../../store/projectStore.js';
import { evaluateLinkStatus } from './linkEvaluator.js';

/**
 * Custom edge component for network cables.
 * Dynamically evaluates Cisco Link Status (IP, subnet match, no shutdown).
 * Displays Cisco Link Status LED lights (Green/Red) at both ends.
 */

// Cable type → visual style mapping
const CABLE_STYLES = {
  'copper-straight': { stroke: '#7C5CFC', width: 2.5, dash: undefined,    label: 'Copper Straight', shortLabel: '━━', color: '#7C5CFC' },
  'copper-cross':    { stroke: '#F97316', width: 2.5, dash: '8 4',        label: 'Copper Cross',    shortLabel: '╳╳', color: '#F97316' },
  'fiber':           { stroke: '#F59E0B', width: 3,   dash: '2 3',        label: 'Fiber',           shortLabel: '〰', color: '#F59E0B' },
  'console':         { stroke: '#06B6D4', width: 2.5, dash: undefined,    label: 'Console',         shortLabel: '▬▬', color: '#06B6D4' },
  'serial':          { stroke: '#EF4444', width: 2.5, dash: '10 3 2 3',   label: 'Serial',          shortLabel: '⇌',  color: '#EF4444' },
};

const CableEdge = memo(({
  id,
  source, target,
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

  const nodes = useProjectStore(s => s.nodes);
  const srcNode = nodes.find(n => n.id === source);
  const tgtNode = nodes.find(n => n.id === target);

  const sourcePort = data?.sourcePort || '';
  const targetPort = data?.targetPort || '';
  const cableType = data?.cableType || 'copper-straight';

  // Evaluate dynamic Cisco Link Status
  const linkEval = evaluateLinkStatus(srcNode, sourcePort, tgtNode, targetPort);

  const shortName = (port) => {
    if (!port) return '';
    return port
      .replace('FastEthernet', 'Fa')
      .replace('GigabitEthernet', 'Gi')
      .replace('Serial', 'Se');
  };

  const cs = CABLE_STYLES[cableType] || CABLE_STYLES['copper-straight'];

  // Dynamic stroke color based on Cisco link evaluation
  let strokeColor = cs.stroke;
  let strokeDash = cs.dash;

  if (selected) {
    strokeColor = '#EF4444';
  } else if (!linkEval.isUp) {
    // Unconfigured / Shutdown / Subnet Mismatch link shows Alert Red with dashed line
    strokeColor = linkEval.status === 'mismatch' ? '#F97316' : '#EF4444';
    strokeDash = '6 4';
  } else {
    // Active & Operational link turns Cisco Green!
    strokeColor = '#10B981';
  }

  const openMenu = (e) => {
    e.stopPropagation();
    e.preventDefault();
    useProjectStore.getState().setActiveEdgeMenu({
      edgeId: id,
      x: e.clientX,
      y: e.clientY,
    });
  };

  // Calculate offset direction perpendicular to cable for port labels
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const labelOffset = 18;

  const srcLabelX = sourceX + dx * 0.15 + px * labelOffset;
  const srcLabelY = sourceY + dy * 0.15 + py * labelOffset;
  const tgtLabelX = sourceX + dx * 0.85 + px * labelOffset;
  const tgtLabelY = sourceY + dy * 0.85 + py * labelOffset;

  // Cisco Link LED coordinates (right near the endpoints)
  const srcLedX = sourceX + dx * 0.08;
  const srcLedY = sourceY + dy * 0.08;
  const tgtLedX = sourceX + dx * 0.92;
  const tgtLedY = sourceY + dy * 0.92;

  const portLabelStyle = {
    position: 'absolute',
    pointerEvents: 'none',
    fontSize: 9, fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    color: '#374151',
    background: 'rgba(255,255,255,0.95)',
    padding: '2px 6px', borderRadius: 4,
    border: '1px solid #D1D5DB',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    lineHeight: 1.2,
    zIndex: 100,
  };

  return (
    <>
      {/* Invisible wider hit-area for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        onClick={openMenu}
        onContextMenu={openMenu}
      />
      {/* Visible cable path */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: selected ? cs.width + 1.5 : cs.width,
          strokeDasharray: strokeDash,
          cursor: 'pointer',
          transition: 'stroke 0.3s ease, stroke-width 0.15s ease',
        }}
        markerEnd={markerEnd}
        onClick={openMenu}
        onContextMenu={openMenu}
      />

      <EdgeLabelRenderer>

        {/* Source port label */}
        {sourcePort && (
          <div style={{
            ...portLabelStyle,
            transform: `translate(-50%, -50%) translate(${srcLabelX}px, ${srcLabelY}px)`,
          }}>
            {shortName(sourcePort)}
          </div>
        )}

        {/* Target port label */}
        {targetPort && (
          <div style={{
            ...portLabelStyle,
            transform: `translate(-50%, -50%) translate(${tgtLabelX}px, ${tgtLabelY}px)`,
          }}>
            {shortName(targetPort)}
          </div>
        )}

        {/* Center badge — shows Link Status LED + cable type */}
        <div
          onClick={openMenu}
          onContextMenu={openMenu}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            fontSize: 9, fontWeight: 700,
            color: 'white',
            background: strokeColor,
            padding: '3px 9px',
            borderRadius: 12,
            cursor: 'pointer',
            boxShadow: `0 2px 8px ${strokeColor}55`,
            userSelect: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
            whiteSpace: 'nowrap',
            transition: 'background 0.3s ease',
            zIndex: 101,
          }}
          title={linkEval.reason}
        >
          <span>{linkEval.isUp ? '🟢' : linkEval.status === 'mismatch' ? '⚠️' : '🔴'}</span>
          <span>{cs.shortLabel}</span>
          <span style={{ fontSize: 7, opacity: 0.8 }}>▼</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

CableEdge.displayName = 'CableEdge';
export default CableEdge;
