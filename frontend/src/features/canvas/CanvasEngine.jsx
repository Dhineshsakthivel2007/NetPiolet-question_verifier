import { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background,
  ConnectionMode, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DeviceNode from '../devices/DeviceNode.jsx';
import TextNoteNode from '../devices/TextNoteNode.jsx';
import CableEdge from './CableEdge.jsx';
import CiscoPortSelectorModal from './CiscoPortSelectorModal.jsx';
import useProjectStore, { autoCableType } from '../../store/projectStore.js';
import { evaluateLinkStatus } from './linkEvaluator.js';

const nodeTypes = { device: DeviceNode, note: TextNoteNode };
const edgeTypes = { cable: CableEdge };

const CABLE_COLORS = {
  'copper-straight': '#7C5CFC',
  'copper-cross': '#F97316',
  'fiber': '#F59E0B',
  'console': '#06B6D4',
  'serial': '#EF4444',
};

/* ════════════════════════════════════════════════════════════
   Wire Options Context Menu
   ════════════════════════════════════════════════════════════ */
function WireContextMenu({ menu, edge, nodes, onClose }) {
  const startReconnectingCable = useProjectStore(s => s.startReconnectingCable);
  const removeEdge = useProjectStore(s => s.removeEdge);
  const updateEdgeCableType = useProjectStore(s => s.updateEdgeCableType);

  if (!menu || !edge) return null;

  const srcNode = nodes.find(n => n.id === edge.source);
  const tgtNode = nodes.find(n => n.id === edge.target);
  const srcName = srcNode?.data?.label || srcNode?.data?.hostname || srcNode?.data?.type || 'Source';
  const tgtName = tgtNode?.data?.label || tgtNode?.data?.hostname || tgtNode?.data?.type || 'Target';
  const srcPort = edge.data?.sourcePort || '';
  const tgtPort = edge.data?.targetPort || '';
  const shortPort = (p) => p.replace('FastEthernet','Fa').replace('GigabitEthernet','Gi').replace('Serial','Se');

  const linkEval = evaluateLinkStatus(srcNode, srcPort, tgtNode, tgtPort);

  const btn = {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '10px 14px', border: 'none',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    textAlign: 'left', transition: 'background 0.15s',
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div style={{
        position: 'fixed',
        left: Math.min(menu.x, window.innerWidth - 290),
        top: Math.min(menu.y, window.innerHeight - 420),
        zIndex: 9999, background: '#fff', borderRadius: 14,
        border: '1px solid #E5E7EB',
        boxShadow: '0 12px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        width: 275, overflow: 'hidden', animation: 'fadeIn 0.12s ease',
      }} onClick={e => e.stopPropagation()}>
        {/* Dynamic Cisco Link Status Header */}
        <div style={{
          padding: '12px 14px 10px', borderBottom: '1px solid #E5E7EB',
          background: linkEval.isUp ? 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)' : 'linear-gradient(135deg, #FEF2F2 0%, #FFF1F2 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 14 }}>{linkEval.isUp ? '🟢' : linkEval.status === 'mismatch' ? '⚠️' : '🔴'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: linkEval.isUp ? '#065F46' : '#991B1B' }}>
              {linkEval.isUp ? 'Link Operational' : 'Link Down / Unconfigured'}
            </span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: linkEval.isUp ? '#047857' : '#DC2626', marginBottom: 6, lineHeight: 1.3 }}>
            {linkEval.reason}
          </div>
          <div style={{ fontSize: 11, color: '#4B5563', lineHeight: 1.4 }}>
            <b style={{ color: '#1F2937' }}>{srcName}</b> ({shortPort(srcPort)})
            <span> ⟷ </span>
            <b style={{ color: '#1F2937' }}>{tgtName}</b> ({shortPort(tgtPort)})
          </div>
        </div>

        <div style={{ padding: '6px 0' }}>
          {/* Option 1: Disconnect Right Device, keep Left Device connected & attach to cursor */}
          <button style={{ ...btn, background: 'transparent', color: '#7C5CFC' }}
            onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => startReconnectingCable(edge.id, 'target')}>
            <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>🔌</span>
            <div>
              <div style={{ color: '#1E1B4B', fontWeight: 700 }}>Disconnect Right ({tgtName})</div>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#6B7280', marginTop: 1 }}>
                Keep {srcName} connected — drag cable to cursor
              </div>
            </div>
          </button>

          {/* Option 2: Disconnect Left Device, keep Right Device connected & attach to cursor */}
          <button style={{ ...btn, background: 'transparent', color: '#6366F1' }}
            onMouseEnter={e => e.currentTarget.style.background = '#EEF2FF'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => startReconnectingCable(edge.id, 'source')}>
            <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>🔌</span>
            <div>
              <div style={{ color: '#1E1B4B', fontWeight: 700 }}>Disconnect Left ({srcName})</div>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#6B7280', marginTop: 1 }}>
                Keep {tgtName} connected — drag cable to cursor
              </div>
            </div>
          </button>

          <div style={{ height: 1, background: '#F3F4F6', margin: '4px 14px' }} />

          <div style={{ padding: '8px 14px' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 5 }}>Cable Type</label>
            <select
              value={edge.data?.cableType || 'copper-straight'}
              onChange={e => {
                let val = e.target.value;
                if (val === 'auto') {
                  const sType = srcNode?.data?.type;
                  const tType = tgtNode?.data?.type;
                  val = autoCableType(sType, tType);
                }
                updateEdgeCableType(edge.id, val);
              }}
              style={{
                width: '100%', padding: '7px 10px', fontSize: 12, fontWeight: 500,
                borderRadius: 8, border: '1.5px solid #D1D5DB', outline: 'none',
                background: '#FAFAFA', cursor: 'pointer',
              }}
              onFocus={e => e.target.style.borderColor = '#7C5CFC'}
              onBlur={e => e.target.style.borderColor = '#D1D5DB'}
            >
              <option value="auto">🔄  Auto (Cisco Standard)</option>
              <option value="copper-straight">━  Straight-Through (Copper)</option>
              <option value="copper-cross">╳  Crossover (Copper)</option>
              <option value="fiber">〰  Fiber Optic</option>
              <option value="console">▬  Console Cable</option>
              <option value="serial">⇌  Serial / WAN</option>
            </select>
          </div>

          <div style={{ height: 1, background: '#F3F4F6', margin: '2px 14px' }} />

          <button style={{ ...btn, background: 'transparent', color: '#EF4444' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => removeEdge(edge.id)}>
            <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>🗑️</span>
            <div>
              <div>Delete Wire</div>
              <div style={{ fontSize: 10, fontWeight: 400, color: '#9CA3AF', marginTop: 1 }}>Permanently remove this connection</div>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   Reconnect Floating Banner
   ════════════════════════════════════════════════════════════ */
function ReconnectBanner({ reconnecting, onCancel }) {
  if (!reconnecting) return null;
  return (
    <div style={{
      position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, background: 'linear-gradient(135deg, #7C5CFC, #6366F1)',
      color: 'white', padding: '10px 22px', borderRadius: 28,
      fontSize: 13, fontWeight: 700,
      boxShadow: '0 6px 24px rgba(124,92,252,0.45)',
      display: 'flex', alignItems: 'center', gap: 14,
      pointerEvents: 'all', animation: 'fadeIn 0.2s ease',
    }}>
      <span style={{ fontSize: 18 }}>🔌</span>
      <span>Wire unplugged! Click any device to plug in</span>
      <button onClick={onCancel} style={{
        background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
        color: 'white', borderRadius: 14, padding: '3px 12px',
        cursor: 'pointer', fontSize: 11, fontWeight: 700,
      }}>Cancel · Esc</button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Live Wire SVG Overlay
   ════════════════════════════════════════════════════════════ */
function LiveWireOverlay({ anchorNode, cursorPos, cableType }) {
  const { getViewport } = useReactFlow();
  if (!anchorNode || !cursorPos) return null;

  const { x, y, zoom } = getViewport();

  // Compute center point of anchor device node
  const domNode = typeof document !== 'undefined' ? document.querySelector(`[data-id="${anchorNode.id}"]`) : null;
  const w = domNode ? domNode.offsetWidth : 74;
  const h = domNode ? domNode.offsetHeight : 50;
  const nx = anchorNode.position?.x || 0;
  const ny = anchorNode.position?.y || 0;

  const flowAx = nx + w / 2;
  const flowAy = ny + h / 2;

  // Convert flow coordinates to canvas SVG screen pixels
  const ax = flowAx * zoom + x;
  const ay = flowAy * zoom + y;
  const cx = cursorPos.x * zoom + x;
  const cy = cursorPos.y * zoom + y;

  const color = CABLE_COLORS[cableType] || '#7C5CFC';

  // Smooth bezier curve matching React Flow connection line
  const pathD = `M ${ax} ${ay} C ${ax} ${(ay + cy) / 2}, ${cx} ${(ay + cy) / 2}, ${cx} ${cy}`;

  return (
    <svg style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 999,
      overflow: 'visible',
      filter: `drop-shadow(0 2px 8px ${color}55)`,
    }}>
      {/* Background Soft Glow Line */}
      <path
        d={pathD}
        fill="none" stroke={color} strokeWidth="6"
        strokeOpacity="0.25" strokeLinecap="round"
      />
      {/* Main Animated Bezier Connection Line */}
      <path
        d={pathD}
        fill="none" stroke={color} strokeWidth="3"
        strokeDasharray="7 4" strokeLinecap="round"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-22" dur="0.6s" repeatCount="indefinite" />
      </path>
      {/* Anchor Dot on Connected Device Handle */}
      <circle cx={ax} cy={ay} r="7" fill={color} stroke="#FFFFFF" strokeWidth="2.5" />
      <circle cx={ax} cy={ay} r="3" fill="#FFFFFF" />

      {/* Unplugged Wire Tip Attached to Cursor with Glowing Pulse */}
      <circle cx={cx} cy={cy} r="11" fill={color} fillOpacity="0.2" />
      <circle cx={cx} cy={cy} r="7" fill={color} stroke="#FFFFFF" strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r="3" fill="#FFFFFF" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════
   Inner canvas component — has access to useReactFlow()
   ════════════════════════════════════════════════════════════ */
function CanvasInner() {
  const { screenToFlowPosition } = useReactFlow();
  const nodes = useProjectStore(s => s.nodes);
  const edges = useProjectStore(s => s.edges);
  const onNodesChange = useProjectStore(s => s.onNodesChange);
  const onEdgesChange = useProjectStore(s => s.onEdgesChange);
  const onConnect = useProjectStore(s => s.onConnect);
  const addDevice = useProjectStore(s => s.addDevice);

  const activeEdgeMenu = useProjectStore(s => s.activeEdgeMenu);
  const setActiveEdgeMenu = useProjectStore(s => s.setActiveEdgeMenu);
  const reconnectingCable = useProjectStore(s => s.reconnectingCable);
  const cancelReconnectingCable = useProjectStore(s => s.cancelReconnectingCable);
  const reconnectEdgeToNode = useProjectStore(s => s.reconnectEdgeToNode);

  const cableToolActive = useProjectStore(s => s.cableToolActive);
  const cableToolSourceId = useProjectStore(s => s.cableToolSourceId);
  const cancelCableTool = useProjectStore(s => s.cancelCableTool);

  // Store cursor in FLOW coordinates (same space as node positions)
  const [flowCursor, setFlowCursor] = useState({ x: 0, y: 0 });

  const undo = useProjectStore(s => s.undo);
  const redo = useProjectStore(s => s.redo);

  // ── Ctrl+Z / Cmd+Z (Undo) and Ctrl+Y / Cmd+Shift+Z (Redo) ──
  useEffect(() => {
    const fn = (e) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (!isCmdOrCtrl) return;

      if (e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [undo, redo]);

  // ── Mouse move → convert screen to flow coordinates ──
  const onMouseMove = useCallback((e) => {
    if (!reconnectingCable) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setFlowCursor(pos);
  }, [reconnectingCable, screenToFlowPosition]);

  // ── Drop: use screenToFlowPosition for accurate placement ──
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow-type');
    if (!type) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addDevice(type, { x: pos.x - 65, y: pos.y - 40 });
  }, [addDevice, screenToFlowPosition]);

  // ── Node click: complete reconnection ──
  const onNodeClick = useCallback((event, node) => {
    if (reconnectingCable) {
      event.stopPropagation();
      reconnectEdgeToNode(reconnectingCable.edgeId, node.id, reconnectingCable.side);
    }
  }, [reconnectingCable, reconnectEdgeToNode]);

  // ── Pane click: cancel reconnection if active ──
  const onPaneClick = useCallback(() => {
    if (reconnectingCable) cancelReconnectingCable();
  }, [reconnectingCable, cancelReconnectingCable]);

  const isValidConnection = useCallback((c) => {
    const active = useProjectStore.getState().cableToolActive;
    if (!active) return false;
    return c.source !== c.target;
  }, []);

  // ── Intercept delete-key → delete cable cleanly ──
  const handleEdgesChange = useCallback((changes) => {
    const removeChanges = changes.filter(c => c.type === 'remove');
    const otherChanges = changes.filter(c => c.type !== 'remove');

    if (otherChanges.length > 0) onEdgesChange(otherChanges);

    if (removeChanges.length > 0) {
      removeChanges.forEach(c => {
        useProjectStore.getState().removeEdge(c.id);
      });
    }
  }, [onEdgesChange]);

  function getNodeHandlePoint(node) {
    if (!node) return { x: 0, y: 0 };
    const nx = node.position?.x || 0;
    const ny = node.position?.y || 0;
    const w = 74;
    const h = 50;
    return { x: nx + w / 2, y: ny + h / 2 };
  }

  // ── Compute anchor node & cable type for live wire ──
  const anchorNode = reconnectingCable
    ? nodes.find(n => n.id === reconnectingCable.anchorNodeId)
    : null;

  const reconnectingEdgeObj = reconnectingCable
    ? edges.find(e => e.id === reconnectingCable.edgeId)
    : null;

  // Filter out the reconnecting edge so the old connection unplugs from screen!
  const displayEdges = reconnectingCable
    ? edges.filter(e => e.id !== reconnectingCable.edgeId)
    : edges;

  const anchorPt = anchorNode ? getNodeHandlePoint(anchorNode) : { x: 0, y: 0 };
  const anchorX = anchorPt.x;
  const anchorY = anchorPt.y;

  const currentEdge = activeEdgeMenu
    ? edges.find(e => e.id === activeEdgeMenu.edgeId) : null;

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMouseMove={onMouseMove}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        connectionLineStyle={{ stroke: '#7C5CFC', strokeWidth: 3 }}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{ type: 'cable', animated: false }}
        style={{
          background: '#F8F9FB',
          cursor: reconnectingCable ? 'crosshair' : undefined,
        }}
        deleteKeyCode={['Backspace', 'Delete']}
        edgesReconnectable
      >
        <Background variant="dots" gap={20} size={1} color="#E5E7EB" />
        <Controls style={{
          background: 'white', borderRadius: 10,
          border: '1px solid #E5E7EB',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }} />
        <CollapsibleMiniMap />

        {/* Live Cable Line attached to cursor (old edge unplugs completely!) */}
        {reconnectingCable && anchorNode && (
          <LiveWireOverlay
            anchorNode={anchorNode}
            cursorPos={flowCursor}
            cableType={reconnectingEdgeObj?.data?.cableType || 'copper-straight'}
          />
        )}
      </ReactFlow>

      {/* Overlays rendered outside ReactFlow (fixed position) */}
      <CableToolBanner cableToolActive={cableToolActive} cableToolSourceId={cableToolSourceId} nodes={nodes} onCancel={cancelCableTool} />
      <ReconnectBanner reconnecting={reconnectingCable} onCancel={cancelReconnectingCable} />
      <WireContextMenu
        menu={activeEdgeMenu}
        edge={currentEdge}
        nodes={nodes}
        onClose={() => setActiveEdgeMenu(null)}
      />
      <CiscoPortSelectorModal
        selector={useProjectStore(s => s.portSelector)}
        onSelect={useProjectStore.getState().selectPort}
        onClose={useProjectStore.getState().cancelPortSelector}
      />
    </>
  );
}

function CollapsibleMiniMap() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      right: 12,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      pointerEvents: 'all',
    }}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: isOpen ? '8px 8px 0 0' : 8,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          color: '#334155',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          userSelect: 'none',
          transition: 'all 0.2s ease',
        }}
        title={isOpen ? 'Shrink / Hide Canvas Minimap' : 'Open Canvas Minimap'}
      >
        <span>🗺️ Minimap</span>
        <span style={{ fontSize: 10, color: '#7C5CFC', fontWeight: 800 }}>{isOpen ? '▼ Shrink' : '▲ Open'}</span>
      </button>

      {/* MiniMap Box */}
      {isOpen && (
        <MiniMap
          nodeColor={(n) => {
            const t = n.data?.type;
            if (t === 'router') return '#7C5CFC';
            if (t === 'switch') return '#10B981';
            if (t === 'pc') return '#3B82F6';
            return '#F59E0B';
          }}
          maskColor="rgba(124,92,252,0.08)"
          style={{
            position: 'relative',
            margin: 0,
            background: 'white',
            borderRadius: '8px 0 8px 8px',
            border: '1px solid #CBD5E1',
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          }}
        />
      )}
    </div>
  );
}

function CableToolBanner({ cableToolActive, cableToolSourceId, nodes, onCancel }) {
  if (!cableToolActive) return null;
  const sourceNode = cableToolSourceId ? nodes.find(n => n.id === cableToolSourceId) : null;
  const sourceName = sourceNode?.data?.hostname || sourceNode?.data?.type || 'Device A';

  return (
    <div style={{
      position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, background: '#1E1B4B', color: '#F59E0B',
      padding: '8px 20px', borderRadius: 28, fontSize: 13, fontWeight: 700,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '1.5px solid #F59E0B',
      display: 'flex', alignItems: 'center', gap: 12,
      pointerEvents: 'all', animation: 'fadeIn 0.2s ease',
    }}>
      <span style={{ fontSize: 18, animation: 'pulse 1s infinite' }}>⚡</span>
      <span>
        {cableToolSourceId
          ? `Step 2: Click second device to connect cable to ${sourceName}`
          : 'Step 1: Click first device to start cable connection'}
      </span>
      <button
        onClick={onCancel}
        style={{
          background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
          color: 'white', borderRadius: 14, padding: '3px 12px',
          cursor: 'pointer', fontSize: 11, fontWeight: 700, marginLeft: 6,
        }}
      >
        Cancel (Ctrl+Z)
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Export — LabPage.jsx already wraps with ReactFlowProvider
   ════════════════════════════════════════════════════════════ */
export default function CanvasEngine() {
  return (
    <div style={{ flex: 1, height: '100%', position: 'relative' }}>
      <CanvasInner />
    </div>
  );
}
