import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateIpv4Cidr,
  simulateDns,
  simulateLatency,
  simulatePorts,
} from "../app/diagnostics.ts";

test("calculates IPv4 CIDR boundaries, including point-to-point networks", () => {
  const result = calculateIpv4Cidr("192.0.2.10/29");
  assert.deepEqual(result, {
    input: "192.0.2.10/29", network: "192.0.2.8", broadcast: "192.0.2.15",
    netmask: "255.255.255.248", prefix: 29, firstHost: "192.0.2.9", lastHost: "192.0.2.14", usableHosts: 6,
  });
  const pointToPoint = calculateIpv4Cidr("198.51.100.4/31");
  assert.equal(pointToPoint.usableHosts, 2);
  assert.equal(pointToPoint.firstHost, "198.51.100.4");
});

test("diagnostics simulations are deterministic and explicitly offline-friendly", () => {
  const latency = simulateLatency("edge.example");
  const dns = simulateDns("example.com", "A");
  const ports = simulatePorts("edge.example", [22, 443]);
  assert.deepEqual(latency, simulateLatency("edge.example"));
  assert.match(latency.resolvedAddress, /^198\.51\.100\./);
  assert.equal(dns.status, "NOERROR");
  assert.match(dns.records[0], /^(198\.51\.100|203\.0\.113)\./);
  assert.deepEqual(ports, simulatePorts("edge.example", [22, 443]));
  const absent = simulateDns("nxdomain.invalid", "A");
  assert.equal(absent.status, "NXDOMAIN");
  assert.deepEqual(absent.records, []);
});

test("validates malformed local inputs and supports documented record types", () => {
  assert.throws(() => calculateIpv4Cidr("192.0.2.1"), /CIDR/);
  assert.throws(() => calculateIpv4Cidr("300.0.2.1/24"), /0 to 255/);
  assert.throws(() => calculateIpv4Cidr("192.0.2.1/33"), /0 to 32/);
  assert.throws(() => simulateLatency(""), /host name/);
  assert.throws(() => simulateDns("not a domain!", "A"), /valid domain/);
  assert.throws(() => simulateDns("example.com", "CNAME"), /Choose/);
  assert.throws(() => simulatePorts("edge.example", [0, 70000]), /valid TCP port/);
  assert.match(simulateDns("example.com", "AAAA").records[0], /^2001:db8::/);
  assert.match(simulateDns("example.com", "MX").records[0], /^10 mail\./);
  assert.match(simulateDns("example.com", "TXT").records[0], /^v=spf1/);
});
