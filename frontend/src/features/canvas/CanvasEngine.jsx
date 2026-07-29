import { useCallback, useRef } from 'react';
import { ReactFlow, MiniMap, Controls, Background, ConnectionMode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DeviceNode from '../devices/DeviceNode.jsx';
import TextNoteNode from '../devices/TextNoteNode.jsx';
import CableEdge from './CableEdge.jsx';
import useProjectStore from '../../store/projectStore.js';

const nodeTypes = { device: DeviceNode, note: TextNoteNode };
const edgeTypes = { cable: CableEdge };

export default function CanvasEngine() {
  const reactFlowRef = useRef(null);
  const nodes = useProjectStore(s => s.nodes);
  const edges = useProjectStore(s => s.edges);
  const onNodesChange = useProjectStore(s => s.onNodesChange);
  const onEdgesChange = useProjectStore(s => s.onEdgesChange);
  const onConnect = useProjectStore(s => s.onConnect);
  const addDevice = useProjectStore(s => s.addDevice);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow-type');
    if (!type) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const position = {
      x: e.clientX - bounds.left - 65,
      y: e.clientY - bounds.top - 40,
    };
    addDevice(type, position);
  }, [addDevice]);

  const isValidConnection = useCallback((connection) => {
    return connection.source !== connection.target;
  }, []);

  return (
    <div style={{ flex: 1, height: '100%' }} ref={reactFlowRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: 'cable',
          animated: false,
          style: { stroke: '#7C5CFC', strokeWidth: 2 },
        }}
        style={{ background: '#F8F9FB' }}
        deleteKeyCode={['Backspace', 'Delete']}
        edgesReconnectable
      >
        <Background variant="dots" gap={20} size={1} color="#E5E7EB" />
        <Controls
          style={{ background: 'white', borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        />
        <MiniMap
          nodeColor={(n) => {
            const t = n.data?.type;
            return t === 'router' ? '#7C5CFC' : t === 'switch' ? '#10B981' : t === 'pc' ? '#3B82F6' : '#F59E0B';
          }}
          maskColor="rgba(124,92,252,0.08)"
          style={{ background: 'white', borderRadius: 10, border: '1px solid #E5E7EB' }}
        />
      </ReactFlow>
    </div>
  );
}
