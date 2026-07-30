/**
 * Cisco Packet Tracer Link Status & Subnet Evaluator
 */

// Convert IPv4 string (e.g. "192.168.1.1") to 32-bit unsigned integer
export function ipToLong(ip) {
  if (!ip || typeof ip !== 'string') return 0;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255) return 0;
  }
  return parts.reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

// Convert CIDR prefix or subnet mask string to 32-bit subnet mask long
export function maskToLong(mask) {
  if (!mask) return ipToLong('255.255.255.0');
  if (typeof mask === 'number') {
    return ((0xFFFFFFFF << (32 - mask)) >>> 0);
  }
  const str = String(mask).trim();
  if (str.startsWith('/')) {
    const cidr = parseInt(str.slice(1), 10);
    if (!isNaN(cidr) && cidr >= 0 && cidr <= 32) {
      return ((0xFFFFFFFF << (32 - cidr)) >>> 0);
    }
  }
  return ipToLong(str);
}

// Check if two IP addresses with masks reside on the exact same IP subnet
export function areSameSubnet(ipA, maskA, ipB, maskB) {
  const longA = ipToLong(ipA);
  const longB = ipToLong(ipB);
  if (longA === 0 || longB === 0) return false;
  if (longA === longB) return false; // Duplicate IP address on same link is invalid

  const mA = maskToLong(maskA) || maskToLong('255.255.255.0');
  const mB = maskToLong(maskB) || maskToLong('255.255.255.0');

  // Both subnets must match
  const netA = (longA & mA) >>> 0;
  const netB = (longB & mB) >>> 0;

  return netA === netB;
}

/**
 * Evaluates the Cisco dynamic link status for a cable connection.
 * Returns: { isUp, status: 'up'|'down'|'mismatch', srcUp, tgtUp, reason, srcDetails, tgtDetails }
 */
export function evaluateLinkStatus(srcNode, srcPortName, tgtNode, tgtPortName) {
  if (!srcNode || !tgtNode) {
    return { isUp: false, status: 'down', srcUp: false, tgtUp: false, reason: 'Device missing' };
  }

  const srcType = srcNode.data?.type || 'pc';
  const tgtType = tgtNode.data?.type || 'pc';

  const srcIface = srcNode.data?.interfaces?.[srcPortName] || {};
  const tgtIface = tgtNode.data?.interfaces?.[tgtPortName] || {};

  const srcIp = (srcIface.ip || '').trim();
  const srcMask = srcIface.mask || '255.255.255.0';
  const srcStatus = (srcIface.status || 'up').toLowerCase();
  const srcIsUp = srcStatus !== 'down';

  const tgtIp = (tgtIface.ip || '').trim();
  const tgtMask = tgtIface.mask || '255.255.255.0';
  const tgtStatus = (tgtIface.status || 'up').toLowerCase();
  const tgtIsUp = tgtStatus !== 'down';

  const srcName = srcNode.data?.hostname || srcType;
  const tgtName = tgtNode.data?.hostname || tgtType;

  const srcDetails = { name: srcName, port: srcPortName, ip: srcIp, mask: srcMask, isUp: srcIsUp && Boolean(srcIp) };
  const tgtDetails = { name: tgtName, port: tgtPortName, ip: tgtIp, mask: tgtMask, isUp: tgtIsUp && Boolean(tgtIp) };

  // Case 1: Router ↔ Router
  if (srcType === 'router' && tgtType === 'router') {
    if (!srcIsUp && !tgtIsUp) {
      return { isUp: false, status: 'down', srcUp: false, tgtUp: false, reason: `Both router interfaces are shutdown (use 'no shutdown')`, srcDetails, tgtDetails };
    }
    if (!srcIsUp) {
      return { isUp: false, status: 'down', srcUp: false, tgtUp: true, reason: `${srcName} ${srcPortName} is shutdown`, srcDetails, tgtDetails };
    }
    if (!tgtIsUp) {
      return { isUp: false, status: 'down', srcUp: true, tgtUp: false, reason: `${tgtName} ${tgtPortName} is shutdown`, srcDetails, tgtDetails };
    }
    if (!srcIp || !tgtIp) {
      const missing = !srcIp ? srcName : tgtName;
      return { isUp: false, status: 'down', srcUp: Boolean(srcIp), tgtUp: Boolean(tgtIp), reason: `IP unconfigured on ${missing}`, srcDetails, tgtDetails };
    }
    if (srcIp === tgtIp) {
      return { isUp: false, status: 'mismatch', srcUp: true, tgtUp: true, reason: `Duplicate IP address collision (${srcIp})`, srcDetails, tgtDetails };
    }
    if (!areSameSubnet(srcIp, srcMask, tgtIp, tgtMask)) {
      return { isUp: false, status: 'mismatch', srcUp: true, tgtUp: true, reason: `Subnet mismatch: ${srcIp} vs ${tgtIp}`, srcDetails, tgtDetails };
    }
    return { isUp: true, status: 'up', srcUp: true, tgtUp: true, reason: `Link UP & Operational (${srcIp} ⟷ ${tgtIp})`, srcDetails, tgtDetails };
  }

  // Case 2: Router ↔ Switch
  if ((srcType === 'router' && tgtType === 'switch') || (srcType === 'switch' && tgtType === 'router')) {
    const routerIsSrc = srcType === 'router';
    const rNode = routerIsSrc ? srcNode : tgtNode;
    const rPort = routerIsSrc ? srcPortName : tgtPortName;
    const rIface = routerIsSrc ? srcIface : tgtIface;
    const rIp = (rIface.ip || '').trim();
    const rUp = (rIface.status || 'down').toLowerCase() !== 'down';

    const rName = rNode.data?.hostname || 'Router';

    if (!rUp) {
      return { isUp: false, status: 'down', srcUp: routerIsSrc ? false : true, tgtUp: routerIsSrc ? true : false, reason: `${rName} ${rPort} is shutdown`, srcDetails, tgtDetails };
    }
    if (!rIp) {
      return { isUp: false, status: 'down', srcUp: routerIsSrc ? false : true, tgtUp: routerIsSrc ? true : false, reason: `${rName} IP address unconfigured`, srcDetails, tgtDetails };
    }
    return { isUp: true, status: 'up', srcUp: true, tgtUp: true, reason: `Link UP (Router IP: ${rIp})`, srcDetails, tgtDetails };
  }

  // Case 3: Router ↔ PC / Server
  if ((srcType === 'router' && (tgtType === 'pc' || tgtType === 'server')) || ((srcType === 'pc' || srcType === 'server') && tgtType === 'router')) {
    if (!srcIsUp || !tgtIsUp) {
      return { isUp: false, status: 'down', srcUp: srcIsUp, tgtUp: tgtIsUp, reason: 'Interface shutdown', srcDetails, tgtDetails };
    }
    if (!srcIp || !tgtIp) {
      return { isUp: false, status: 'down', srcUp: Boolean(srcIp), tgtUp: Boolean(tgtIp), reason: 'IP Address missing', srcDetails, tgtDetails };
    }
    if (!areSameSubnet(srcIp, srcMask, tgtIp, tgtMask)) {
      return { isUp: false, status: 'mismatch', srcUp: true, tgtUp: true, reason: `Subnet mismatch: ${srcIp} vs ${tgtIp}`, srcDetails, tgtDetails };
    }
    return { isUp: true, status: 'up', srcUp: true, tgtUp: true, reason: `Link UP (${srcIp} ⟷ ${tgtIp})`, srcDetails, tgtDetails };
  }

  // Case 4: Switch ↔ PC / Server
  if ((srcType === 'switch' && (tgtType === 'pc' || tgtType === 'server')) || ((srcType === 'pc' || srcType === 'server') && tgtType === 'switch')) {
    const pcIsSrc = srcType === 'pc' || srcType === 'server';
    const pcIp = pcIsSrc ? srcIp : tgtIp;
    if (!pcIp) {
      return { isUp: false, status: 'down', srcUp: pcIsSrc ? false : true, tgtUp: pcIsSrc ? true : false, reason: 'PC IP unconfigured', srcDetails, tgtDetails };
    }
    return { isUp: true, status: 'up', srcUp: true, tgtUp: true, reason: `Link UP (PC IP: ${pcIp})`, srcDetails, tgtDetails };
  }

  // Case 5: PC ↔ PC
  if ((srcType === 'pc' || srcType === 'server') && (tgtType === 'pc' || tgtType === 'server')) {
    if (!srcIp || !tgtIp) {
      return { isUp: false, status: 'down', srcUp: Boolean(srcIp), tgtUp: Boolean(tgtIp), reason: 'IP Address unconfigured', srcDetails, tgtDetails };
    }
    if (!areSameSubnet(srcIp, srcMask, tgtIp, tgtMask)) {
      return { isUp: false, status: 'mismatch', srcUp: true, tgtUp: true, reason: `Subnet mismatch: ${srcIp} vs ${tgtIp}`, srcDetails, tgtDetails };
    }
    return { isUp: true, status: 'up', srcUp: true, tgtUp: true, reason: `Link UP (${srcIp} ⟷ ${tgtIp})`, srcDetails, tgtDetails };
  }

  // Default Switch ↔ Switch or other
  return { isUp: true, status: 'up', srcUp: true, tgtUp: true, reason: 'Link UP & Connected', srcDetails, tgtDetails };
}
