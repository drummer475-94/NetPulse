export type PortStatus = "open" | "closed" | "filtered";

export type CidrSummary = {
  input: string;
  network: string;
  broadcast: string;
  netmask: string;
  prefix: number;
  firstHost: string;
  lastHost: string;
  usableHosts: number;
};

export type LatencySimulation = {
  target: string;
  resolvedAddress: string;
  samplesMs: number[];
  averageMs: number;
  packetLossPercent: number;
};

export type DnsSimulation = {
  domain: string;
  recordType: "A" | "AAAA" | "MX" | "TXT";
  resolver: string;
  status: "NOERROR" | "NXDOMAIN";
  responseTimeMs: number;
  records: string[];
};

export type PortSimulation = {
  port: number;
  service: string;
  status: PortStatus;
  responseTimeMs: number;
};

const COMMON_PORTS: Record<number, string> = {
  22: "SSH",
  53: "DNS",
  80: "HTTP",
  443: "HTTPS",
  3389: "RDP",
  8080: "HTTP alternate",
};

function parseIPv4(value: string): number {
  const parts = value.trim().split(".");
  if (parts.length !== 4) throw new Error("Enter an IPv4 address with four octets.");

  let address = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new Error("Each IPv4 octet must be a number from 0 to 255.");
    const octet = Number(part);
    if (octet > 255) throw new Error("Each IPv4 octet must be a number from 0 to 255.");
    address = ((address << 8) | octet) >>> 0;
  }
  return address;
}

function formatIPv4(address: number): string {
  return [address >>> 24, (address >>> 16) & 255, (address >>> 8) & 255, address & 255].join(".");
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value.toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function simulatedAddress(target: string): string {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(target)) return target;
  const hash = stableHash(target);
  return `198.51.100.${(hash % 250) + 1}`;
}

/** Calculates address boundaries locally; it does not contact a network. */
export function calculateIpv4Cidr(input: string): CidrSummary {
  const [rawAddress, rawPrefix, ...extra] = input.trim().split("/");
  if (!rawAddress || rawPrefix === undefined || extra.length) {
    throw new Error("Enter a CIDR such as 192.0.2.10/24.");
  }
  if (!/^\d{1,2}$/.test(rawPrefix)) throw new Error("CIDR prefix must be a number from 0 to 32.");
  const prefix = Number(rawPrefix);
  if (prefix > 32) throw new Error("CIDR prefix must be a number from 0 to 32.");

  const address = parseIPv4(rawAddress);
  const netmask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & netmask) >>> 0;
  const broadcast = (network | (~netmask >>> 0)) >>> 0;
  const totalAddresses = 2 ** (32 - prefix);
  const usableHosts = prefix >= 31 ? totalAddresses : totalAddresses - 2;

  return {
    input: `${formatIPv4(address)}/${prefix}`,
    network: formatIPv4(network),
    broadcast: formatIPv4(broadcast),
    netmask: formatIPv4(netmask),
    prefix,
    firstHost: formatIPv4(prefix >= 31 ? network : network + 1),
    lastHost: formatIPv4(prefix >= 31 ? broadcast : broadcast - 1),
    usableHosts,
  };
}

/** Returns a repeatable illustrative latency trace; it sends no ICMP packets. */
export function simulateLatency(targetInput: string, sampleCount = 4): LatencySimulation {
  const target = targetInput.trim();
  if (!target) throw new Error("Enter a host name or IPv4 address.");
  const count = Math.min(8, Math.max(1, Math.floor(sampleCount)));
  const hash = stableHash(target);
  const base = 12 + (hash % 68);
  const samplesMs = Array.from({ length: count }, (_, index) => Number((base + ((hash >>> (index * 4)) % 9) + index * 0.4).toFixed(1)));
  const averageMs = Number((samplesMs.reduce((total, sample) => total + sample, 0) / samplesMs.length).toFixed(1));
  return { target, resolvedAddress: simulatedAddress(target), samplesMs, averageMs, packetLossPercent: 0 };
}

/** Returns example DNS records from documentation address space; it makes no DNS request. */
export function simulateDns(
  domainInput: string,
  recordTypeInput: string = "A",
  resolverInput: string = "9.9.9.9",
): DnsSimulation {
  const domain = domainInput.trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) throw new Error("Enter a valid domain name.");
  const recordType = recordTypeInput.toUpperCase() as DnsSimulation["recordType"];
  if (!(["A", "AAAA", "MX", "TXT"] as const).includes(recordType)) throw new Error("Choose A, AAAA, MX, or TXT.");
  const resolver = resolverInput.trim() || "9.9.9.9";
  const hash = stableHash(`${domain}:${recordType}:${resolver}`);
  const responseTimeMs = 8 + (hash % 18);
  const status = domain.includes("nxdomain") || domain.endsWith(".invalid") ? "NXDOMAIN" : "NOERROR";
  if (status === "NXDOMAIN") return { domain, recordType, resolver, status, responseTimeMs, records: [] };

  const suffix = (hash % 200) + 10;
  const records = recordType === "A"
    ? [`198.51.100.${suffix}`, `203.0.113.${(suffix % 200) + 10}`]
    : recordType === "AAAA"
      ? [`2001:db8::${suffix.toString(16)}`]
      : recordType === "MX"
        ? [`10 mail.${domain}`]
        : [`v=spf1 include:example.invalid ~all`];
  return { domain, recordType, resolver, status, responseTimeMs, records };
}

/** Returns a deterministic training scenario; it never opens a browser socket. */
export function simulatePorts(targetInput: string, ports: number[]): PortSimulation[] {
  const target = targetInput.trim();
  if (!target) throw new Error("Enter a host name or IPv4 address.");
  const safePorts = ports.filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
  if (!safePorts.length) throw new Error("Choose at least one valid TCP port.");
  const hash = stableHash(target);
  return safePorts.map((port, index) => {
    const selector = (hash + port + index * 17) % 7;
    const status: PortStatus = selector === 0 ? "filtered" : selector <= 2 ? "closed" : "open";
    return {
      port,
      service: COMMON_PORTS[port] ?? "Custom TCP",
      status,
      responseTimeMs: status === "filtered" ? 1000 : 4 + ((hash + port) % 24),
    };
  });
}

export const PORT_PROFILES = {
  web: [80, 443, 8080],
  common: [22, 53, 80, 443, 3389],
} as const;
