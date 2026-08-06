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
  const nodes = useProjectStore(s => s.nodes);
  const edges = useProjectStore(s => s.edges);
  const srcNode = nodes.find(n => n.id === source);
  const tgtNode = nodes.find(n => n.id === target);

  // Shift Y coordinates down 16px to align directly with 3D block top face (ZERO GAP!)
  const sy = sourceY + 16;
  const ty = targetY + 16;

  // Find all parallel cables between this pair of devices (in either direction)
  const parallelEdges = edges.filter(e =>
    (e.source === source && e.target === target) ||
    (e.source === target && e.target === source)
  );

  const edgeIndex = parallelEdges.findIndex(e => e.id === id);
  const totalParallel = parallelEdges.length;

  let edgePath = '';
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sy + ty) / 2;

  if (totalParallel > 1 && edgeIndex !== -1) {
    // Calculate perpendicular offset vector for straight parallel cables
    const dx = targetX - sourceX;
    const dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    // Parallel offset: shift start and end points in parallel direction (straight lines!)
    const offsetIndex = edgeIndex - (totalParallel - 1) / 2;
    const offsetDistance = offsetIndex * 14;

    const sx = sourceX + nx * offsetDistance;
    const s_y = sy + ny * offsetDistance;
    const tx = targetX + nx * offsetDistance;
    const t_y = ty + ny * offsetDistance;

    edgePath = `M ${sx} ${s_y} L ${tx} ${t_y}`;
    labelX = (sx + tx) / 2;
    labelY = (s_y + t_y) / 2;
  } else {
    // 100% straight line from source to target device!
    edgePath = `M ${sourceX} ${sy} L ${targetX} ${ty}`;
    labelX = (sourceX + targetX) / 2;
    labelY = (sy + ty) / 2;
  }

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
  const dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  
  // Stagger label offset based on parallel edge index to prevent label collisions
  const offsetIndex = totalParallel > 1 ? (edgeIndex - (totalParallel - 1) / 2) : 0;
  const labelOffset = 16 + offsetIndex * 12;

  // Place port badges at 28% and 72% along the cable to clear node cylinder and labels!
  const srcLabelX = sourceX + dx * 0.28 + px * labelOffset;
  const srcLabelY = sy + dy * 0.28 + py * labelOffset;
  const tgtLabelX = sourceX + dx * 0.72 + px * labelOffset;
  const tgtLabelY = sy + dy * 0.72 + py * labelOffset;

  const portLabelStyle = {
    position: 'absolute',
    pointerEvents: 'none',
    fontSize: 7.5, fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    color: '#1E293B',
    background: 'rgba(255,255,255,0.94)',
    padding: '1px 3.5px', borderRadius: 3,
    border: '1px solid #CBD5E1',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    lineHeight: 1.1,
    zIndex: 100,
  };

  return (
    <>
      {/* Invisible wider hit-area for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
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
          strokeWidth: selected ? cs.width + 1 : cs.width,
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
            fontSize: 7.5, fontWeight: 700,
            color: 'white',
            background: strokeColor,
            padding: '1.5px 5px',
            borderRadius: 6,
            cursor: 'pointer',
            boxShadow: `0 2px 5px ${strokeColor}55`,
            userSelect: 'none',
            display: 'flex', alignItems: 'center', gap: 2.5,
            whiteSpace: 'nowrap',
            transition: 'background 0.3s ease',
            zIndex: 101,
          }}
          title={linkEval.reason}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: linkEval.isUp ? '#10B981' : linkEval.status === 'mismatch' ? '#F97316' : '#EF4444',
            boxShadow: linkEval.isUp ? '0 0 3px #10B981' : 'none',
            display: 'inline-block', flexShrink: 0
          }} />
          <span>{cs.shortLabel}</span>
          <span style={{ fontSize: 5.5, opacity: 0.8 }}>▼</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

CableEdge.displayName = 'CableEdge';
export default CableEdge;
