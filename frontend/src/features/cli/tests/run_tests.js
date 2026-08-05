import IosDevice from '../IosDevice.js';
import { interpret, createCliContext } from '../CommandParser.js';
import { simulatePing } from '../PacketEngine.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('=== Running Cisco IOS Refactor Test Suite ===\n');

// Test 1: Interface state machine
console.log('1. Testing Interface State Machine...');
const routerNode = {
  id: 'r1',
  type: 'router',
  hostname: 'Router1',
  interfaces: {
    'GigabitEthernet0/0': { ip: '192.168.1.1', mask: '255.255.255.0', commands: ['ip address 192.168.1.1 255.255.255.0', 'shutdown'] },
    'GigabitEthernet0/1': { ip: '10.0.0.1', mask: '255.255.255.0', commands: ['ip address 10.0.0.1 255.255.255.0', 'no shutdown'] }
  },
  running_config: { hostname: 'Router1', global_commands: [], router_sections: { 'router ospf 1': ['network 10.0.0.0 0.0.0.255 area 0'] } }
};
const pcNode = {
  id: 'pc1',
  type: 'pc',
  hostname: 'PC1',
  interfaces: {
    'FastEthernet0': { ip: '10.0.0.2', mask: '255.255.255.0', commands: [] }
  }
};
const edges = [
  { id: 'c1', source: 'r1', sourceHandle: 'GigabitEthernet0/1', target: 'pc1', targetHandle: 'FastEthernet0' }
];

const nodes = [routerNode, pcNode];
const iosRouter = new IosDevice(routerNode, nodes, edges);

assert(iosRouter.interfaceStates['GigabitEthernet0/0'].admin_state === 'down', 'Gi0/0 is administratively down (shutdown)');
assert(iosRouter.interfaceStates['GigabitEthernet0/0'].line_protocol === 'down', 'Gi0/0 line protocol is down');
assert(iosRouter.interfaceStates['GigabitEthernet0/1'].admin_state === 'up', 'Gi0/1 is administratively up (no shutdown)');
assert(iosRouter.interfaceStates['GigabitEthernet0/1'].line_protocol === 'up', 'Gi0/1 line protocol is up when connected to PC1');


// Test 2: Routing table generation & routeLookup
console.log('\n2. Testing Routing Table & Route Lookup...');
const routes = iosRouter.routingTable;
const connectedRoute = routes.find(r => r.type === 'C' && r.network === '10.0.0.0');
const hostRoute = routes.find(r => r.type === 'L' && r.network === '10.0.0.1');

assert(!!connectedRoute, 'Connected C route present for 10.0.0.0/24');
assert(!!hostRoute, 'Local L route present for 10.0.0.1/32');

const lookup = iosRouter.routeLookup('10.0.0.2');
assert(lookup && lookup.exitInterface === 'GigabitEthernet0/1', 'Route lookup for 10.0.0.2 resolves to GigabitEthernet0/1');


// Test 3: Device Restrictions & Cisco Mode Rules
console.log('\n3. Testing Device Restrictions & Cisco Mode Rules...');
let ctxRouter = createCliContext(routerNode);
ctxRouter.iosDevice = iosRouter;
ctxRouter.allNodes = nodes;
ctxRouter.allEdges = edges;

// User EXEC mode: show running-config should fail
ctxRouter.mode = 'user_exec';
let userExecRun = interpret('show running-config', ctxRouter);
assert(userExecRun.output.includes("Invalid input detected"), 'User EXEC mode (Router>) blocks "show running-config"');

// Ambiguous "show i" and incomplete "show ip"
let showAmb = interpret('show i', ctxRouter);
assert(showAmb.output.includes('Ambiguous command'), '"show i" returns % Ambiguous command');

let showInc = interpret('show ip', ctxRouter);
assert(showInc.output.includes('Incomplete command'), '"show ip" returns % Incomplete command');

// Privileged EXEC mode: show running-config works
ctxRouter.mode = 'priv_exec';
let privExecRun = interpret('show running-config', ctxRouter);
assert(privExecRun.output.includes('hostname Router1'), 'Privileged EXEC mode (Router#) allows "show running-config"');

// Global Config mode: plain "show" should FAIL; "do show" should SUCCEED
ctxRouter.mode = 'global_config';

let plainShow = interpret('show ip interface brief', ctxRouter);
assert(plainShow.output.includes("Invalid input detected"), 'Global config mode (config)# rejects plain "show" command without "do"');

let doShowInt = interpret('do show ip interface brief', ctxRouter);
assert(doShowInt.output.includes('GigabitEthernet0/1'), 'Global config mode (config)# executes "do show ip interface brief"');

let doShowOspfNei = interpret('do show ip ospf neighbor', ctxRouter);
assert(doShowOspfNei.output.includes('Neighbor ID'), 'Global config mode executes "do show ip ospf neighbor"');

let doShowOspfShort = interpret('do show ospf neighbor', ctxRouter);
assert(doShowOspfShort.output.includes('Neighbor ID'), 'Global config mode executes "do show ospf neighbor"');


// Test 4: Ping Engine (Hop-by-hop reachability)
console.log('\n4. Testing Packet Forwarding & Ping Engine...');
const pingRes = simulatePing(iosRouter, '10.0.0.2', { nodes, edges }, false);
assert(pingRes.success === true, 'Router1 can successfully ping PC1 (10.0.0.2)');

const unreachRes = simulatePing(iosRouter, '172.16.0.1', { nodes, edges }, false);
assert(unreachRes.success === false, 'Ping to unrouted IP 172.16.0.1 fails cleanly');


console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
