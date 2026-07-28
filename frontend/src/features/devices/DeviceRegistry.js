export const DEVICE_CATALOG = [
  {
    type: 'router', label: 'Router', icon: '🔀', category: 'Network',
    defaultPorts: ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'Serial0/0/0', 'Serial0/0/1'],
    model: '2911', color: '#7C5CFC',
  },
  {
    type: 'switch', label: 'Switch', icon: '🔃', category: 'Network',
    defaultPorts: [
      ...Array.from({ length: 24 }, (_, i) => `FastEthernet0/${i + 1}`),
      'GigabitEthernet0/1', 'GigabitEthernet0/2',
    ],
    model: '2960-24TT', color: '#10B981',
  },
  {
    type: 'pc', label: 'PC', icon: '🖥️', category: 'End Device',
    defaultPorts: ['FastEthernet0'],
    model: 'PC-PT', color: '#3B82F6',
  },
  {
    type: 'server', label: 'Server', icon: '🖧', category: 'End Device',
    defaultPorts: ['FastEthernet0'],
    model: 'Server-PT', color: '#F59E0B',
  },
];

let deviceCounters = {};

export function resetCounters() {
  deviceCounters = {};
}

export function getDeviceDefaults(type) {
  const def = DEVICE_CATALOG.find(d => d.type === type);
  if (!def) return null;
  const interfaces = {};
  def.defaultPorts.forEach(port => {
    interfaces[port] = { ip: '', mask: '', status: 'down', vlan: null, trunk_allowed_vlans: null, commands: [] };
  });
  return {
    type: def.type,
    hostname: `${def.label}0`,
    model: def.model,
    interfaces,
    running_config: { hostname: `${def.label}0`, global_commands: [], router_sections: {} },
    vlans: type === 'switch' ? [{ number: 1, name: 'default' }] : [],
    vtp: type === 'switch' ? { domain: '', mode: 0, version: 1 } : null,
  };
}

export function getDeviceDef(type) {
  return DEVICE_CATALOG.find(d => d.type === type);
}
