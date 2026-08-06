import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { getDeviceDefaults } from '../features/devices/DeviceRegistry.js';

/**
 * Auto-detect cable type based on Cisco norms:
 *  - Switch ↔ PC/Server     → Straight-Through (copper-straight)
 *  - Switch ↔ Router        → Straight-Through (copper-straight)
 *  - Switch ↔ Switch        → Crossover (copper-cross)
 *  - Router ↔ Router        → Crossover (copper-cross)
 *  - PC ↔ PC                → Crossover (copper-cross)
 *  - PC ↔ Router            → Crossover (copper-cross)
 *  - Anything else           → Straight-Through
 */
function autoCableType(typeA, typeB) {
  const pair = [typeA, typeB].sort().join('-');
  // Same type → crossover
  if (typeA === typeB && (typeA === 'switch' || typeA === 'router' || typeA === 'pc' || typeA === 'server')) {
    return 'copper-cross';
  }
  // PC/Server ↔ Router → crossover (direct connection without switch)
  if (pair === 'pc-router' || pair === 'router-server') {
    return 'copper-cross';
  }
  // Switch ↔ anything else → straight-through
  return 'copper-straight';
}

function getDeviceAvailablePorts(node, edges = [], nodes = []) {
  if (!node) return [];

  const validNodeIds = new Set((nodes || []).map(n => n.id));

  // Used ports on this node (only from valid edges between existing nodes)
  const used = new Set();
  for (const e of edges) {
    if (!validNodeIds.has(e.source) || !validNodeIds.has(e.target)) continue;
    const srcPort = e.data?.sourcePort || e.sourcePort;
    const tgtPort = e.data?.targetPort || e.targetPort;
    if (e.source === node.id && srcPort) used.add(srcPort);
    if (e.target === node.id && tgtPort) used.add(tgtPort);
  }

  const type = node.data?.type || node.type;
  let allPorts = [];

  if (type === 'switch') {
    allPorts.push({ name: 'Console', type: 'console' });
    for (let i = 1; i <= 24; i++) {
      allPorts.push({ name: `FastEthernet0/${i}`, type: 'fast' });
    }
    allPorts.push({ name: 'GigabitEthernet0/1', type: 'giga' });
    allPorts.push({ name: 'GigabitEthernet0/2', type: 'giga' });
  } else if (type === 'router') {
    allPorts.push({ name: 'GigabitEthernet0/0', type: 'giga' });
    allPorts.push({ name: 'GigabitEthernet0/1', type: 'giga' });
    allPorts.push({ name: 'GigabitEthernet0/2', type: 'giga' });
    allPorts.push({ name: 'GigabitEthernet0/3', type: 'giga' });
  } else if (type === 'pc' || type === 'server') {
    allPorts.push({ name: 'FastEthernet0', type: 'fast' });
  } else {
    allPorts.push({ name: 'FastEthernet0/1', type: 'fast' });
  }

  return allPorts.filter(p => !used.has(p.name));
}

export { autoCableType, getDeviceAvailablePorts };

let saveTimer = null;

const useProjectStore = create((set, get) => ({
  projectId: null,
  questionId: null,
  questionTitle: '',
  questionText: '',
  evaluationPlan: null,
  questionTimeLimit: 0,
  nodes: [],
  edges: [],
  selectedDevice: null,
  openTerminals: [],
  saving: false,
  lastSaved: null,
  submitResult: null,
  submitting: false,

  // History Stack for Undo / Redo
  historyPast: [],
  historyFuture: [],

  _recordHistory: () => {
    const { nodes, edges, historyPast } = get();
    const snapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    const newPast = [...historyPast, snapshot];
    if (newPast.length > 30) newPast.shift();
    set({ historyPast: newPast, historyFuture: [] });
  },

  undo: () => {
    const { cableToolSourceId, cableToolActive, reconnectingCable, historyPast, historyFuture, nodes, edges } = get();

    if (cableToolSourceId) {
      set({ cableToolSourceId: null });
      return;
    }

    if (cableToolActive) {
      set({ cableToolActive: false });
      return;
    }

    if (reconnectingCable) {
      get().cancelReconnectingCable();
      return;
    }

    if (!historyPast || historyPast.length === 0) return;

    const previousSnapshot = historyPast[historyPast.length - 1];
    const newPast = historyPast.slice(0, -1);
    const currentSnapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };

    set({
      nodes: previousSnapshot.nodes,
      edges: previousSnapshot.edges,
      historyPast: newPast,
      historyFuture: [currentSnapshot, ...historyFuture],
    });
    get()._autoSave();
  },

  redo: () => {
    const { historyPast, historyFuture, nodes, edges } = get();
    if (!historyFuture || historyFuture.length === 0) return;

    const nextSnapshot = historyFuture[0];
    const newFuture = historyFuture.slice(1);
    const currentSnapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };

    set({
      nodes: nextSnapshot.nodes,
      edges: nextSnapshot.edges,
      historyPast: [...historyPast, currentSnapshot],
      historyFuture: newFuture,
    });
    get()._autoSave();
  },

  // React Flow callbacks
  onNodesChange: (changes) => {
    const currentNodes = get().nodes;
    const nextNodes = applyNodeChanges(changes, currentNodes);
    const validNodeIds = new Set(nextNodes.map(n => n.id));
    const cleanEdges = get().edges.filter(e => e.source && e.target && validNodeIds.has(e.source) && validNodeIds.has(e.target));
    set({ nodes: nextNodes, edges: cleanEdges });
    get()._autoSave();
  },
  onEdgesChange: (changes) => {
    const currentEdges = get().edges;
    const nextEdges = applyEdgeChanges(changes, currentEdges);
    const validNodeIds = new Set(get().nodes.map(n => n.id));
    const cleanEdges = nextEdges.filter(e => e.source && e.target && validNodeIds.has(e.source) && validNodeIds.has(e.target));
    set({ edges: cleanEdges });
    get()._autoSave();
  },
  onConnect: (connection) => {
    const { nodes, edges, cableToolActive, openPortSelector } = get();

    if (!cableToolActive) {
      alert("⚡ Cable connection mode is inactive! Please click 'Auto Cable Wire' in the sidebar palette under CONNECTIONS to enable cabling.");
      return;
    }

    const srcNode = nodes.find(n => n.id === connection.source);
    const tgtNode = nodes.find(n => n.id === connection.target);
    if (!srcNode || !tgtNode) return;
    if (connection.source === connection.target) return;

    // If sourcePort and targetPort are already selected (e.g. 2-click mode), complete connection!
    if (connection.sourcePort && connection.targetPort) {
      get()._createCableEdge(srcNode, tgtNode, connection.sourcePort, connection.targetPort);
      return;
    }

    // If drag-connecting via cursor, prompt Cisco Port Selector for Device A then Device B!
    openPortSelector(srcNode.id, null, (chosenSrcPort) => {
      openPortSelector(tgtNode.id, null, (chosenTgtPort) => {
        get()._createCableEdge(srcNode, tgtNode, chosenSrcPort, chosenTgtPort);
      });
    });
  },

  _createCableEdge: (srcNode, tgtNode, sourcePort, targetPort) => {
    const { nodes, edges } = get();
    const isEndDevice = (type) => type === 'pc' || type === 'server';

    const nodeIds = new Set(nodes.map(n => n.id));
    let updatedEdges = edges.filter(e => e.source && e.target && e.source !== e.target && nodeIds.has(e.source) && nodeIds.has(e.target));

    const srcType = srcNode.data?.type || srcNode.type;
    const tgtType = tgtNode.data?.type || tgtNode.type;

    if (isEndDevice(srcType)) {
      updatedEdges = updatedEdges.filter(e => e.source !== srcNode.id && e.target !== srcNode.id);
    }
    if (isEndDevice(tgtType)) {
      updatedEdges = updatedEdges.filter(e => e.source !== tgtNode.id && e.target !== tgtNode.id);
    }

    const cableType = autoCableType(srcType, tgtType);

    get()._recordHistory();

    const edge = {
      id: `cable-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: srcNode.id,
      target: tgtNode.id,
      sourceHandle: 'src-full',
      targetHandle: 'tgt-full',
      type: 'cable',
      data: {
        cableType,
        sourcePort,
        targetPort,
      },
    };

    set({
      edges: [...updatedEdges, edge],
      cableToolActive: true,
      cableToolSourceId: null,
      cableToolSourcePort: null,
    });
    get()._autoSave();
  },

  // Cable / Edge Operations
  activeEdgeMenu: null,
  reconnectingCable: null,
  cableToolActive: false,
  cableToolSourceId: null,
  cableToolSourcePort: null,
  portSelector: null,

  toggleCableTool: () => set(s => ({
    cableToolActive: !s.cableToolActive,
    cableToolSourceId: null,
    cableToolSourcePort: null,
    portSelector: null,
  })),

  cancelCableTool: () => set({
    cableToolActive: false,
    cableToolSourceId: null,
    cableToolSourcePort: null,
    portSelector: null,
  }),

  openPortSelector: (deviceId, mousePos, callback) => {
    const { nodes, edges } = get();
    const node = nodes.find(n => n.id === deviceId);
    if (!node) return;

    const availablePorts = getDeviceAvailablePorts(node, edges, nodes);
    set({
      portSelector: {
        deviceId,
        deviceName: node.data?.hostname || 'Device',
        modelName: node.data?.model || node.data?.hostname || 'Cisco Device',
        availablePorts,
        x: mousePos?.x || (window.innerWidth / 2 - 100),
        y: mousePos?.y || (window.innerHeight / 2 - 150),
        callback,
      },
    });
  },

  selectPort: (portName) => {
    const { portSelector } = get();
    if (portSelector && portSelector.callback) {
      portSelector.callback(portName);
    }
    set({ portSelector: null });
  },

  cancelPortSelector: () => set({ portSelector: null }),

  handleCableToolClickDevice: (deviceId, mousePos) => {
    const { cableToolActive, cableToolSourceId, cableToolSourcePort, onConnect, openPortSelector } = get();
    if (!cableToolActive) return false;

    // Step 1: Click first device -> Open Cisco Port Selector
    if (!cableToolSourceId) {
      openPortSelector(deviceId, mousePos, (chosenPort) => {
        set({ cableToolSourceId: deviceId, cableToolSourcePort: chosenPort });
      });
      return true;
    }

    // Cannot connect device to itself
    if (cableToolSourceId === deviceId) {
      set({ cableToolSourceId: null, cableToolSourcePort: null });
      return true;
    }

    // Step 2: Click second device -> Open Cisco Port Selector -> Connect!
    openPortSelector(deviceId, mousePos, (chosenTargetPort) => {
      onConnect({
        source: cableToolSourceId,
        target: deviceId,
        sourcePort: cableToolSourcePort,
        targetPort: chosenTargetPort,
      });
      set({ cableToolSourceId: null, cableToolSourcePort: null });
    });
    return true;
  },

  setActiveEdgeMenu: (menu) => set({ activeEdgeMenu: menu }),

  removeEdge: (edgeId) => {
    get()._recordHistory();
    set(s => ({
      edges: s.edges.filter(e => e.id !== edgeId),
      activeEdgeMenu: null,
      reconnectingCable: s.reconnectingCable?.edgeId === edgeId ? null : s.reconnectingCable,
    }));
    get()._autoSave();
  },

  startReconnectingCable: (edgeId, side = 'target') => {
    const { edges } = get();
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    const anchorNodeId = side === 'target' ? edge.source : edge.target;

    // Immediately remove old edge from edges list so old connection is disconnected completely
    const remainingEdges = edges.filter(e => e.id !== edgeId);

    set({
      edges: remainingEdges,
      reconnectingCable: {
        edgeId,
        anchorNodeId,
        side,
        originalEdge: edge,
      },
      activeEdgeMenu: null,
    });
    get()._autoSave();
  },

  cancelReconnectingCable: () => {
    const { reconnectingCable, edges } = get();
    if (reconnectingCable && reconnectingCable.originalEdge) {
      set({
        edges: [...edges, reconnectingCable.originalEdge],
        reconnectingCable: null,
        activeEdgeMenu: null,
      });
      get()._autoSave();
    } else {
      set({ reconnectingCable: null, activeEdgeMenu: null });
    }
  },

  reconnectEdgeToNode: (edgeId, newTargetNodeId, side = 'target') => {
    const { nodes, edges, reconnectingCable } = get();
    const originalEdge = reconnectingCable?.originalEdge || edges.find(e => e.id === edgeId);

    const anchorNodeId = reconnectingCable?.anchorNodeId || (side === 'target' ? originalEdge?.source : originalEdge?.target);
    if (!anchorNodeId || anchorNodeId === newTargetNodeId) return;

    const anchorNode = nodes.find(n => n.id === anchorNodeId);
    const targetNode = nodes.find(n => n.id === newTargetNodeId);
    if (!anchorNode || !targetNode) return;

    const isEndDevice = (type) => type === 'pc' || type === 'server';
    let updatedEdges = edges.filter(e => e.id !== edgeId);

    if (isEndDevice(targetNode.data?.type)) {
      updatedEdges = updatedEdges.filter(e => e.source !== newTargetNodeId && e.target !== newTargetNodeId);
    }

    const usedPorts = (deviceId) => {
      const used = new Set();
      for (const e of updatedEdges) {
        if (e.source === deviceId) used.add(e.data?.sourcePort || '');
        if (e.target === deviceId) used.add(e.data?.targetPort || '');
      }
      return used;
    };

    if (targetNode.data?.type === 'switch' && usedPorts(targetNode.id).size >= 24) {
      alert(`% Port capacity exceeded. Switch (${targetNode.data?.hostname || 'Switch'}) supports a maximum of 24 FastEthernet ports.`);
      return;
    }

    const pickPort = (node) => {
      let ifaces = Object.keys(node.data?.interfaces || {});
      if (node.data?.type === 'switch') {
        ifaces = ifaces.filter(p => p.startsWith('FastEthernet0/'));
        if (ifaces.length > 24) ifaces = ifaces.slice(0, 24);
      }
      const used = usedPorts(node.id);
      return ifaces.find(p => !used.has(p)) || ifaces[0] || 'FastEthernet0/1';
    };

    const anchorPort = side === 'target'
      ? (originalEdge?.data?.sourcePort || pickPort(anchorNode))
      : pickPort(anchorNode);
    const targetPort = pickPort(targetNode);

    const cableType = originalEdge?.data?.cableType || autoCableType(anchorNode.data?.type, targetNode.data?.type);

    const newEdge = {
      id: `cable-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: side === 'target' ? anchorNodeId : newTargetNodeId,
      target: side === 'target' ? newTargetNodeId : anchorNodeId,
      sourceHandle: 'src-full',
      targetHandle: 'tgt-full',
      type: 'cable',
      data: {
        cableType,
        sourcePort: side === 'target' ? anchorPort : targetPort,
        targetPort: side === 'target' ? targetPort : anchorPort,
      },
    };

    set({
      edges: [...updatedEdges, newEdge],
      activeEdgeMenu: null,
      reconnectingCable: null,
    });
    get()._autoSave();
  },

  updateEdgeCableType: (edgeId, cableType) => {
    set(s => ({
      edges: s.edges.map(e => e.id === edgeId ? { ...e, data: { ...e.data, cableType } } : e),
      // Keep menu open so user sees the wire color change live
    }));
    get()._autoSave();
  },

  // Device operations
  addDevice: (type, position) => {
    const defaults = getDeviceDefaults(type);
    if (!defaults) return;
    const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Compute next available hostname based on existing devices on canvas
    const existingNodes = get().nodes;
    const label = defaults.type === 'router' ? 'Router' : defaults.type === 'switch' ? 'Switch' : defaults.type === 'pc' ? 'PC' : defaults.type === 'server' ? 'Server' : 'Device';
    const usedNums = new Set();
    for (const n of existingNodes) {
      const h = n.data?.hostname || '';
      const match = h.match(new RegExp(`^${label}(\\d+)$`));
      if (match) usedNums.add(parseInt(match[1], 10));
    }
    let num = 0;
    while (usedNums.has(num)) num++;
    const hostname = `${label}${num}`;

    const isNote = defaults.type === 'note';
    const node = {
      id,
      type: isNote ? 'note' : 'device',
      position,
      draggable: true,
      data: { ...defaults, id, hostname: isNote ? 'Note' : hostname, running_config: { ...defaults.running_config, hostname: isNote ? 'Note' : hostname } },
    };
    set(s => ({ nodes: [...s.nodes, node] }));
    get()._autoSave();
    return id;
  },

  removeDevice: (id) => {
    set(s => ({
      nodes: s.nodes.filter(n => n.id !== id),
      edges: s.edges.filter(e => e.source !== id && e.target !== id),
      selectedDevice: s.selectedDevice === id ? null : s.selectedDevice,
      openTerminals: s.openTerminals.filter(t => t !== id),
    }));
    get()._autoSave();
  },

  updateDeviceConfig: (deviceId, updates) => {
    set(s => ({
      nodes: s.nodes.map(n =>
        n.id === deviceId ? { ...n, data: { ...n.data, ...updates } } : n
      ),
    }));
    get()._autoSave();
  },

  updateDeviceHostname: (deviceId, hostname) => {
    set(s => ({
      nodes: s.nodes.map(n =>
        n.id === deviceId
          ? {
              ...n,
              data: {
                ...n.data,
                hostname,
                running_config: { ...n.data.running_config, hostname },
              },
            }
          : n
      ),
    }));
    get()._autoSave();
  },

  updateInterface: (deviceId, ifaceName, updates) => {
    set(s => ({
      nodes: s.nodes.map(n => {
        if (n.id !== deviceId) return n;
        const ifaces = { ...n.data.interfaces };
        ifaces[ifaceName] = { ...ifaces[ifaceName], ...updates };
        return { ...n, data: { ...n.data, interfaces: ifaces } };
      }),
    }));
    get()._autoSave();
  },

  addVlan: (deviceId, number, name) => {
    set(s => ({
      nodes: s.nodes.map(n => {
        if (n.id !== deviceId) return n;
        const vlans = [...(n.data.vlans || [])];
        if (!vlans.find(v => v.number === number)) {
          vlans.push({ number, name });
        }
        return { ...n, data: { ...n.data, vlans } };
      }),
    }));
    get()._autoSave();
  },

  updateRunningConfig: (deviceId, configUpdates) => {
    set(s => ({
      nodes: s.nodes.map(n => {
        if (n.id !== deviceId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            running_config: { ...n.data.running_config, ...configUpdates },
          },
        };
      }),
    }));
    get()._autoSave();
  },

  // Selection
  selectDevice: (id) => set({ selectedDevice: id }),

  // Terminal management
  openTerminal: (deviceId) =>
    set(s => ({
      openTerminals: [...new Set([...s.openTerminals, deviceId])],
    })),
  closeTerminal: (deviceId) =>
    set(s => ({
      openTerminals: s.openTerminals.filter(id => id !== deviceId),
    })),

  // Get device data
  getDevice: (deviceId) => {
    const node = get().nodes.find(n => n.id === deviceId);
    return node?.data || null;
  },

  // Caching & Auto-Save Helpers
  _saveLocalCache: () => {
    const { projectId, nodes, edges } = get();
    if (!projectId) return null;
    const state = {
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.data?.type || n.type,
        hostname: n.data?.hostname || '',
        position: n.position || { x: 0, y: 0 },
        interfaces: n.data?.interfaces || {},
        running_config: n.data?.running_config || {},
        vlans: n.data?.vlans || [],
        vtp: n.data?.vtp || {},
        text: n.data?.text || '',
        fontSize: n.data?.fontSize,
        bgColor: n.data?.bgColor,
        borderColor: n.data?.borderColor,
        color: n.data?.color,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || '',
        targetHandle: e.targetHandle || '',
        sourcePort: e.data?.sourcePort || '',
        targetPort: e.data?.targetPort || '',
        cableType: e.data?.cableType || 'copper-straight',
      })),
    };
    try {
      localStorage.setItem(`pkt_lab_cache_${projectId}`, JSON.stringify({ state, savedAt: Date.now() }));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
    return state;
  },

  resetStore: () => {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('pkt_lab_cache_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {}

    set({
      projectId: null,
      questionId: null,
      questionTitle: '',
      questionText: '',
      evaluationPlan: null,
      questionTimeLimit: 0,
      nodes: [],
      edges: [],
      selectedDevice: null,
      openTerminals: [],
      saving: false,
      lastSaved: null,
      submitResult: null,
      submitting: false,
      reconnectingCable: null,
      activeEdgeMenu: null,
    });
  },

  // Project operations
  loadProject: async (projectId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load project');
      const project = await res.json();
      const state = project.state || { nodes: [], edges: [] };

      // Convert stored nodes back to React Flow format
      const nodes = (state.nodes || []).map(n => ({
        id: n.id,
        type: n.type === 'note' ? 'note' : 'device',
        position: n.position || { x: 0, y: 0 },
        data: { ...n, id: n.id },
      }));
      const validNodeIds = new Set(nodes.map(n => n.id));
      const edges = (state.edges || [])
        .filter(e => e && e.source && e.target && e.source !== e.target && validNodeIds.has(e.source) && validNodeIds.has(e.target))
        .map(e => ({
          id: e.id || `cable-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle || 'src-full',
          targetHandle: e.targetHandle || 'tgt-full',
          type: 'cable',
          data: {
            cableType: e.cableType || e.data?.cableType || 'copper-straight',
            sourcePort: e.sourcePort || e.data?.sourcePort || '',
            targetPort: e.targetPort || e.data?.targetPort || '',
          },
        }));

      set({
        projectId,
        questionId: project.question_id,
        nodes,
        edges,
        openTerminals: [],
        selectedDevice: null,
        submitResult: null,
      });

      // Load question details
      const qRes = await fetch(`/api/questions/${project.question_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (qRes.ok) {
        const q = await qRes.json();
        set({
          questionTitle: q.title,
          questionText: q.question_text,
          evaluationPlan: q.evaluation_plan,
          questionTimeLimit: q.time_limit_minutes || 0,
        });
      }
    } catch (err) {
      console.error('Load project failed:', err);
    }
  },

  _autoSave: () => {
    get()._saveLocalCache();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      get().saveProject();
    }, 400);
  },

  saveProjectSync: () => {
    const state = get()._saveLocalCache();
    const { projectId } = get();
    if (!projectId || !state) return;
    try {
      const token = localStorage.getItem('token');
      const payload = JSON.stringify({ state });
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(`/api/projects/${projectId}`, blob);
      }
      fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch (e) {
      console.warn('Sync save failed:', e);
    }
  },

  saveProject: async () => {
    const { projectId, nodes, edges, saving } = get();
    if (!projectId || saving) return;
    set({ saving: true });
    try {
      const state = get()._saveLocalCache();
      const token = localStorage.getItem('token');
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      set({ lastSaved: new Date(), saving: false });
    } catch (err) {
      console.error('Save failed:', err);
      set({ saving: false });
    }
  },

  evaluateProject: async () => {
    const { projectId } = get();
    if (!projectId) return;
    await get().saveProject();
    set({ submitting: true, submitResult: null });
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/projects/${projectId}/evaluate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Evaluation failed');
      }
      const result = await res.json();
      set({ submitting: false, submitResult: result });
      return result;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },

  submitProject: async () => {
    return get().evaluateProject();
  },

  finishProject: async () => {
    const { projectId } = get();
    if (!projectId) return;
    await get().saveProject();
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/projects/${projectId}/finish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Finish project failed:', err);
    }
  },

  createProject: async (questionId) => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: questionId }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    const project = await res.json();
    await get().loadProject(project.id);
    return project.id;
  },
}));

export default useProjectStore;
