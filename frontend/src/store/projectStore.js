import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { getDeviceDefaults } from '../features/devices/DeviceRegistry.js';

let saveTimer = null;

const useProjectStore = create((set, get) => ({
  projectId: null,
  questionId: null,
  questionTitle: '',
  questionText: '',
  evaluationPlan: null,
  nodes: [],
  edges: [],
  selectedDevice: null,
  openTerminals: [],
  saving: false,
  lastSaved: null,
  submitResult: null,
  submitting: false,

  // React Flow callbacks
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    get()._autoSave();
  },
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    get()._autoSave();
  },
  onConnect: (connection) => {
    const { nodes, edges } = get();

    // Find devices
    const srcNode = nodes.find(n => n.id === connection.source);
    const tgtNode = nodes.find(n => n.id === connection.target);
    if (!srcNode || !tgtNode) return;
    if (connection.source === connection.target) return;

    const isEndDevice = (type) => type === 'pc' || type === 'server';

    // If source or target is a PC/Server, replace any existing edge for that PC/Server
    let updatedEdges = [...edges];
    if (isEndDevice(srcNode.data?.type)) {
      updatedEdges = updatedEdges.filter(e => e.source !== srcNode.id && e.target !== srcNode.id);
    }
    if (isEndDevice(tgtNode.data?.type)) {
      updatedEdges = updatedEdges.filter(e => e.source !== tgtNode.id && e.target !== tgtNode.id);
    }

    // Get already-used ports for each device
    const usedPorts = (deviceId) => {
      const used = new Set();
      for (const e of updatedEdges) {
        if (e.source === deviceId) used.add(e.data?.sourcePort || '');
        if (e.target === deviceId) used.add(e.data?.targetPort || '');
      }
      return used;
    };

    // Pick next available port from a device's interfaces
    const pickPort = (node) => {
      const ifaces = Object.keys(node.data?.interfaces || {});
      const used = usedPorts(node.id);
      return ifaces.find(p => !used.has(p)) || ifaces[0] || 'FastEthernet0';
    };

    const sourcePort = pickPort(srcNode);
    const targetPort = pickPort(tgtNode);

    const edge = {
      id: `cable-${Date.now()}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || 'bottom',
      targetHandle: connection.targetHandle || 'top',
      type: 'cable',
      data: {
        cableType: 'copper-straight',
        sourcePort,
        targetPort,
      },
    };

    set({ edges: addEdge(edge, updatedEdges) });
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

    const node = {
      id,
      type: 'device',
      position,
      draggable: true,
      data: { ...defaults, id, hostname, running_config: { ...defaults.running_config, hostname } },
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
        type: 'device',
        position: n.position || { x: 0, y: 0 },
        data: { ...n, id: n.id },
      }));
      const edges = (state.edges || []).map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || '',
        targetHandle: e.targetHandle || '',
        type: 'cable',
        data: {
          cableType: e.cableType || 'copper-straight',
          sourcePort: e.sourcePort || '',
          targetPort: e.targetPort || '',
        },
      }));

      set({
        projectId,
        questionId: project.question_id,
        nodes,
        edges,
        submitResult: null,
      });

      // Load question details
      const qRes = await fetch(`/api/questions/${project.question_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (qRes.ok) {
        const q = await qRes.json();
        set({ questionTitle: q.title, questionText: q.question_text, evaluationPlan: q.evaluation_plan });
      }
    } catch (err) {
      console.error('Load project failed:', err);
    }
  },

  _autoSave: () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => get().saveProject(), 2000);
  },

  saveProject: async () => {
    const { projectId, nodes, edges, saving } = get();
    if (!projectId || saving) return;
    set({ saving: true });
    try {
      const state = {
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.data.type,
          hostname: n.data.hostname,
          position: n.position,
          interfaces: n.data.interfaces,
          running_config: n.data.running_config,
          vlans: n.data.vlans,
          vtp: n.data.vtp,
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
