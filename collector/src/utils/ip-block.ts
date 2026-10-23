/**
 * IP address blocking for SSRF protection.
 * Blocks private, reserved, and special-use IP ranges per RFC 1918, RFC 6598, RFC 5735, RFC 4291.
 */

const BLOCKED_IPV4_CIDRS = [
  "10.0.0.0/8",           // RFC 1918 private Class A
  "172.16.0.0/12",        // RFC 1918 private Class B
  "192.168.0.0/16",       // RFC 1918 private Class C
  "127.0.0.0/8",          // Loopback
  "169.254.0.0/16",       // Link-local (cloud metadata services)
  "100.64.0.0/10",        // RFC 6598 CGNAT
  "0.0.0.0/8",            // "This network"
  "192.0.0.0/24",         // IETF protocol assignments
  "192.0.2.0/24",         // TEST-NET-1 (RFC 5737)
  "198.51.100.0/24",      // TEST-NET-2
  "203.0.113.0/24",       // TEST-NET-3
  "224.0.0.0/4",          // Multicast
  "240.0.0.0/4",          // Reserved
  "255.255.255.255/32",   // Broadcast
];

const BLOCKED_IPV6_CIDRS = [
  "::1/128",              // Loopback
  "fe80::/10",            // Link-local
  "fc00::/7",             // Unique Local Address (ULA)
  "::/128",               // Unspecified
  "::ffff:0:0/96",        // IPv4-mapped
  "64:ff9b::/96",         // NAT64 prefix
  "2001:db8::/32",        // Documentation
  "ff00::/8",             // Multicast
];

interface ParsedCIDR {
  ip: bigint;
  mask: bigint;
  bits: number;
  isIPv4: boolean;
}

function parseCIDR(cidr: string): ParsedCIDR | null {
  const [ipStr, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  if (!Number.isFinite(bits)) return null;

  const isIPv4 = ipStr.includes(".");
  let ip: bigint;

  if (isIPv4) {
    const parts = ipStr.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255)) return null;
    ip = (BigInt(parts[0]) << 24n) | (BigInt(parts[1]) << 16n) | (BigInt(parts[2]) << 8n) | BigInt(parts[3]);
    // Extend to 128 bits for unified comparison
    ip = ip << 96n;
  } else {
    // Simplified IPv6 parsing - handles full uncompressed form
    const expanded = expandIPv6(ipStr);
    if (!expanded) return null;
    ip = ipv6ToBigInt(expanded);
  }

  const mask = ~0n << (128n - BigInt(bits));
  return { ip: ip & mask, mask, bits, isIPv4 };
}

function expandIPv6(addr: string): string | null {
  // Handle IPv4-mapped
  if (addr.startsWith("::ffff:")) {
    const ipv4 = addr.slice(7);
    const parts = ipv4.split(".").map(Number);
    if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) {
      return `0000:0000:0000:0000:0000:ffff:${(parts[0] << 8 | parts[1]).toString(16).padStart(4, "0")}:${(parts[2] << 8 | parts[3]).toString(16).padStart(4, "0")}`;
    }
  }

  const parts = addr.split(":");
  if (parts.length > 8) return null;

  const expanded: string[] = [];
  let zeroFillIndex = -1;

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") {
      zeroFillIndex = expanded.length;
      continue;
    }
    expanded.push(parts[i].padStart(4, "0"));
  }

  if (zeroFillIndex >= 0) {
    const zerosNeeded = 8 - expanded.length;
    const zeros = new Array<string>(zerosNeeded).fill("0000");
    expanded.splice(zeroFillIndex, 0, ...zeros);
  }

  if (expanded.length !== 8) return null;
  return expanded.join(":");
}

function ipv6ToBigInt(expanded: string): bigint {
  const parts = expanded.split(":");
  let result = 0n;
  for (const part of parts) {
    result = (result << 16n) | BigInt(`0x${part}`);
  }
  return result;
}

function parseIP(addr: string): { ip: bigint; isIPv4: boolean } | null {
  if (addr.includes(".")) {
    const parts = addr.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255)) return null;
    let ip = (BigInt(parts[0]) << 24n) | (BigInt(parts[1]) << 16n) | (BigInt(parts[2]) << 8n) | BigInt(parts[3]);
    ip = ip << 96n;
    return { ip, isIPv4: true };
  }
  if (addr.includes(":")) {
    const expanded = expandIPv6(addr);
    if (!expanded) return null;
    return { ip: ipv6ToBigInt(expanded), isIPv4: false };
  }
  return null;
}

// Pre-parse CIDRs at load time
const PARSED_IPV4_CIDRS = BLOCKED_IPV4_CIDRS.map(parseCIDR).filter((c): c is ParsedCIDR => c !== null);
const PARSED_IPV6_CIDRS = BLOCKED_IPV6_CIDRS.map(parseCIDR).filter((c): c is ParsedCIDR => c !== null);

function isIPBlocked(ip: bigint, isIPv4: boolean): boolean {
  const cidrs = isIPv4 ? PARSED_IPV4_CIDRS : PARSED_IPV6_CIDRS;
  for (const cidr of cidrs) {
    if ((ip & cidr.mask) === cidr.ip) {
      return true;
    }
  }
  return false;
}

let allowPrivateIPs: boolean | null = null;

function getAllowPrivateIPs(): boolean {
  if (allowPrivateIPs === null) {
    allowPrivateIPs = process.env.VERIFIER_ALLOW_PRIVATE_IPS === "1";
  }
  return allowPrivateIPs;
}

const dnsCache = new Map<string, { ips: string[]; expires: number }>();
const DNS_CACHE_TTL = 60_000; // 60 seconds

export async function isBlockedIp(hostname: string): Promise<boolean> {
  if (getAllowPrivateIPs()) {
    return false;
  }

  // Check cache
  const cached = dnsCache.get(hostname);
  if (cached && cached.expires > Date.now()) {
    for (const addr of cached.ips) {
      const parsed = parseIP(addr);
      if (parsed && isIPBlocked(parsed.ip, parsed.isIPv4)) {
        return true;
      }
    }
    return false;
  }

  // Resolve
  let addresses: string[];
  try {
    const { lookup } = await import("node:dns/promises");
    const [v4, v6] = await Promise.allSettled([
      lookup(hostname, { all: true, family: 4 }),
      lookup(hostname, { all: true, family: 6 }),
    ]);
    addresses = [
      ...(v4.status === "fulfilled" ? v4.value.map((r) => r.address) : []),
      ...(v6.status === "fulfilled" ? v6.value.map((r) => r.address) : []),
    ];
  } catch {
    // DNS failure - fail open (allow) to not break legitimate fetches on DNS issues
    return false;
  }

  // Cache
  dnsCache.set(hostname, { ips: addresses, expires: Date.now() + DNS_CACHE_TTL });

  // Check each IP
  for (const addr of addresses) {
    const parsed = parseIP(addr);
    if (parsed && isIPBlocked(parsed.ip, parsed.isIPv4)) {
      return true;
    }
  }
  return false;
}

// Export for testing
export { parseCIDR, parseIP, expandIPv6, ipv6ToBigInt, isIPBlocked, BLOCKED_IPV4_CIDRS, BLOCKED_IPV6_CIDRS };