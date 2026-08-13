"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FALLBACK_SNAPSHOT,
  OUTAGE_DATA_PATH,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  formatAge,
  type OutageEvent,
  type OutageSeverity,
  type OutageSnapshot,
} from "./outage-data";
import { fetchLiveSnapshot } from "./live-source";
import { nearestState, stateForZip, US_STATES, type UsState } from "./us-geo";
import {
  calculateIpv4Cidr,
  PORT_PROFILES,
  simulateDns,
  simulateLatency,
  simulatePorts,
  type CidrSummary,
  type DnsSimulation,
  type LatencySimulation,
  type PortSimulation,
} from "./diagnostics";

type UserPlace = {
  state?: UsState;
  label: string;
  source: "default" | "zip" | "device";
  approximate?: boolean;
};

const DEFAULT_PLACE: UserPlace = {
  state: US_STATES.find((state) => state.abbr === "MO"),
  label: "Kansas City starting view",
  source: "default",
};

function isSnapshot(value: unknown): value is OutageSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OutageSnapshot>;
  return Boolean(candidate.metadata && Array.isArray(candidate.events));
}

function severityFor(events: OutageEvent[]): OutageSeverity | "none" {
  return events.reduce<OutageSeverity | "none">(
    (highest, event) =>
      highest === "none" || SEVERITY_RANK[event.severity] > SEVERITY_RANK[highest]
        ? event.severity
        : highest,
    "none",
  );
}

function severityClass(severity: OutageSeverity | "none") {
  return severity === "none" ? "none" : severity;
}

function modeLabel(snapshot: OutageSnapshot, liveStatus: "live" | "snapshot") {
  if (snapshot.metadata.mode === "unavailable") return "Source unavailable";
  if (snapshot.metadata.mode === "demo") return "Demonstration data";
  return liveStatus === "live"
    ? "Live · updated just now"
    : `Snapshot · updated ${formatAge(snapshot.metadata.fetchedAt)}`;
}

function StateGrid({
  events,
  homeState,
  focusedState,
  onSelect,
}: {
  events: OutageEvent[];
  homeState?: string;
  focusedState?: string;
  onSelect: (state: string) => void;
}) {
  const byState = useMemo(() => {
    const grouped = new Map<string, OutageEvent[]>();
    for (const event of events) {
      grouped.set(event.state, [...(grouped.get(event.state) ?? []), event]);
    }
    return grouped;
  }, [events]);

  return (
    <section className="card grid-card" aria-labelledby="map-heading">
      <div className="card-head">
        <div>
          <p className="eyebrow">Regional signals</p>
          <h2 id="map-heading">U.S. signal map</h2>
        </div>
        <span className="pill">State-level</span>
      </div>
      <p className="verdict-note">
        Each tile represents a state or DC. Select a tile to focus the signal list.
      </p>
      <div className="map-scroll">
        <div className="state-grid" role="list" aria-label="State outage signal map">
          {US_STATES.map((state) => {
          const stateEvents = byState.get(state.abbr) ?? [];
          const severity = severityFor(stateEvents);
          const selected = focusedState === state.abbr;
          return (
            <button
              className={`state-tile sev-${severityClass(severity)}${homeState === state.abbr ? " is-home" : ""}${selected ? " is-focused" : ""}`}
              key={state.abbr}
              type="button"
              style={{ gridColumn: state.col, gridRow: state.row }}
              onClick={() => onSelect(state.abbr)}
              aria-pressed={selected}
              aria-label={`${state.name}: ${stateEvents.length} ${stateEvents.length === 1 ? "signal" : "signals"}, ${severity === "none" ? "no detected signal" : SEVERITY_LABEL[severity]}`}
            >
              <span className="tile-abbr">{state.abbr}</span>
              <span className="tile-count">{stateEvents.length || "—"}</span>
            </button>
          );
          })}
        </div>
      </div>
      <div className="legend" aria-label="Severity legend">
        <span><i className="dot sev-major" />Major</span>
        <span><i className="dot sev-moderate" />Moderate</span>
        <span><i className="dot sev-recovering" />Recovering</span>
        <span><i className="dot sev-none" />None detected</span>
      </div>
    </section>
  );
}

function DiagnosticsWorkbench() {
  const [cidr, setCidr] = useState("192.0.2.10/29");
  const [cidrResult, setCidrResult] = useState<CidrSummary>(() => calculateIpv4Cidr("192.0.2.10/29"));
  const [cidrError, setCidrError] = useState("");
  const [target, setTarget] = useState("edge.example");
  const [latencyResult, setLatencyResult] = useState<LatencySimulation>(() => simulateLatency("edge.example"));
  const [latencyError, setLatencyError] = useState("");
  const [domain, setDomain] = useState("example.com");
  const [recordType, setRecordType] = useState("A");
  const [dnsResult, setDnsResult] = useState<DnsSimulation>(() => simulateDns("example.com", "A"));
  const [dnsError, setDnsError] = useState("");
  const [portProfile, setPortProfile] = useState<keyof typeof PORT_PROFILES>("common");
  const [portResult, setPortResult] = useState<PortSimulation[]>(() => simulatePorts("edge.example", [...PORT_PROFILES.common]));
  const [portError, setPortError] = useState("");

  const runCidr = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setCidrResult(calculateIpv4Cidr(cidr));
      setCidrError("");
    } catch (error) {
      setCidrError(error instanceof Error ? error.message : "Unable to calculate this CIDR.");
    }
  };

  const runLatency = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLatencyResult(simulateLatency(target));
      setLatencyError("");
    } catch (error) {
      setLatencyError(error instanceof Error ? error.message : "Unable to create this simulation.");
    }
  };

  const runDns = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setDnsResult(simulateDns(domain, recordType));
      setDnsError("");
    } catch (error) {
      setDnsError(error instanceof Error ? error.message : "Unable to create this simulation.");
    }
  };

  const runPorts = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setPortResult(simulatePorts(target, [...PORT_PROFILES[portProfile]]));
      setPortError("");
    } catch (error) {
      setPortError(error instanceof Error ? error.message : "Unable to create this simulation.");
    }
  };

  return (
    <section className="diagnostics" aria-labelledby="diagnostics-heading">
      <div className="diagnostics-intro">
        <div>
          <p className="eyebrow">Training workbench</p>
          <h1 id="diagnostics-heading">NOC diagnostics</h1>
          <p>Calculate IPv4 ranges and rehearse a troubleshooting conversation with stable example results.</p>
        </div>
        <p className="simulation-disclosure" id="simulation-disclosure"><strong>Simulation only.</strong> These tools run entirely in this page. They do not send ICMP, DNS, TCP, or socket traffic, and their results are not observations of the target.</p>
      </div>

      <div className="diagnostic-grid">
        <section className="card diagnostic-card" aria-labelledby="cidr-heading">
          <div className="card-head"><div><p className="eyebrow">Local calculation</p><h2 id="cidr-heading">IPv4 CIDR calculator</h2></div><span className="pill">No network request</span></div>
          <form className="tool-form" onSubmit={runCidr}>
            <label htmlFor="cidr">Address and prefix</label>
            <div className="tool-row"><input id="cidr" value={cidr} onChange={(event) => setCidr(event.target.value)} inputMode="text" placeholder="192.0.2.10/24" aria-describedby="cidr-help" /><button className="primary-button" type="submit">Calculate</button></div>
            <p id="cidr-help" className="field-help">Example documentation range: 192.0.2.10/29.</p>
          </form>
          {cidrError ? <p className="tool-error" role="alert">{cidrError}</p> : <dl className="diagnostic-results" aria-live="polite"><div><dt>Network</dt><dd>{cidrResult.network}/{cidrResult.prefix}</dd></div><div><dt>Broadcast</dt><dd>{cidrResult.broadcast}</dd></div><div><dt>Netmask</dt><dd>{cidrResult.netmask}</dd></div><div><dt>Usable hosts</dt><dd>{cidrResult.usableHosts.toLocaleString()}</dd></div><div><dt>Host range</dt><dd>{cidrResult.firstHost} – {cidrResult.lastHost}</dd></div></dl>}
        </section>

        <section className="card diagnostic-card" aria-labelledby="latency-heading">
          <div className="card-head"><div><p className="eyebrow">Repeatable scenario</p><h2 id="latency-heading">Latency trace</h2></div><span className="pill">Simulated</span></div>
          <form className="tool-form" onSubmit={runLatency}>
            <label htmlFor="latency-target">Host or IPv4 address</label>
            <div className="tool-row"><input id="latency-target" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="edge.example" aria-describedby="simulation-disclosure" /><button className="primary-button" type="submit">Run scenario</button></div>
          </form>
          {latencyError ? <p className="tool-error" role="alert">{latencyError}</p> : <div className="console-output" aria-live="polite"><p>Simulated resolution: {latencyResult.resolvedAddress}</p><p>{latencyResult.samplesMs.map((sample, index) => `seq=${index + 1} time=${sample} ms`).join(" · ")}</p><p>Average: {latencyResult.averageMs} ms · Simulated loss: {latencyResult.packetLossPercent}%</p></div>}
        </section>

        <section className="card diagnostic-card" aria-labelledby="dns-heading">
          <div className="card-head"><div><p className="eyebrow">Documentation data</p><h2 id="dns-heading">DNS response</h2></div><span className="pill">Simulated</span></div>
          <form className="tool-form" onSubmit={runDns}>
            <label htmlFor="dns-domain">Domain</label>
            <div className="tool-row"><input id="dns-domain" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" aria-describedby="simulation-disclosure" /><select aria-label="DNS record type" value={recordType} onChange={(event) => setRecordType(event.target.value)}><option>A</option><option>AAAA</option><option>MX</option><option>TXT</option></select><button className="primary-button" type="submit">Resolve</button></div>
          </form>
          {dnsError ? <p className="tool-error" role="alert">{dnsError}</p> : <div className="console-output" aria-live="polite"><p>{dnsResult.status} from simulated resolver {dnsResult.resolver} in {dnsResult.responseTimeMs} ms</p><p>{dnsResult.records.length ? dnsResult.records.join(" · ") : "No simulated records returned."}</p></div>}
        </section>

        <section className="card diagnostic-card" aria-labelledby="ports-heading">
          <div className="card-head"><div><p className="eyebrow">Training scenario</p><h2 id="ports-heading">TCP port matrix</h2></div><span className="pill">Simulated</span></div>
          <form className="tool-form" onSubmit={runPorts}>
            <label htmlFor="port-profile">Port profile</label>
            <div className="tool-row"><select id="port-profile" value={portProfile} onChange={(event) => setPortProfile(event.target.value as keyof typeof PORT_PROFILES)} aria-describedby="simulation-disclosure"><option value="common">Common operations ports</option><option value="web">Web services</option></select><button className="primary-button" type="submit">Run scenario</button></div>
          </form>
          {portError ? <p className="tool-error" role="alert">{portError}</p> : <div className="port-table-wrap"><table><caption className="sr-only">Simulated TCP port results</caption><thead><tr><th scope="col">Port</th><th scope="col">Service</th><th scope="col">Scenario</th><th scope="col">Time</th></tr></thead><tbody>{portResult.map((result) => <tr key={result.port}><td>{result.port}</td><td>{result.service}</td><td><span className={`port-status port-${result.status}`}>Simulated {result.status}</span></td><td>{result.responseTimeMs} ms</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </section>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState<"signals" | "diagnostics">("signals");
  const [snapshot, setSnapshot] = useState<OutageSnapshot>(FALLBACK_SNAPSHOT);
  const [liveStatus, setLiveStatus] = useState<"live" | "snapshot">("snapshot");
  const [place, setPlace] = useState<UserPlace>(DEFAULT_PLACE);
  const [zip, setZip] = useState("");
  const [lookupStatus, setLookupStatus] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [locating, setLocating] = useState(false);
  const [focusedState, setFocusedState] = useState<string | undefined>();
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const listRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let disposed = false;

    const loadStaticSnapshot = async () => {
      try {
        const response = await fetch(OUTAGE_DATA_PATH, { cache: "no-store" });
        const nextSnapshot: unknown = await response.json();
        if (!disposed && response.ok && isSnapshot(nextSnapshot)) {
          setSnapshot(nextSnapshot);
          setLiveStatus("snapshot");
        }
      } catch {
        // The visible fallback explicitly identifies itself as demonstration data.
      }
    };

    const refreshLive = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const liveSnapshot = await fetchLiveSnapshot();
        if (!disposed) {
          setSnapshot(liveSnapshot);
          setLiveStatus("live");
        }
      } catch {
        // Keep the most recently loaded snapshot and its truthful age.
      }
    };

    void loadStaticSnapshot().then(refreshLive);
    const interval = window.setInterval(refreshLive, 5 * 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshLive();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const events = useMemo(
    () => [...snapshot.events].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]),
    [snapshot.events],
  );
  const displayedEvents = focusedState ? events.filter((event) => event.state === focusedState) : events;
  const homeEvents = place.state ? events.filter((event) => event.state === place.state?.abbr) : [];
  const homeSeverity = severityFor(homeEvents);
  const homeName = place.state?.name ?? "your selected area";
  const verdictTone = homeSeverity === "none" ? "clear" : homeSeverity === "major" ? "major" : "moderate";

  const selectState = (state: string) => {
    setFocusedState((current) => (current === state ? undefined : state));
    window.setTimeout(() => listRef.current?.focus({ preventScroll: true }), 0);
    window.setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const submitZip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = zip.trim();
    if (!/^\d{5}(?:-\d{4})?$/.test(value)) {
      setLookupStatus("Enter a five-digit U.S. ZIP code.");
      return;
    }
    if (value.slice(0, 5) === "00601") {
      setLookupStatus("00601 is outside the 50 states and DC, so NetPulse cannot map it to a state tile.");
      return;
    }
    setLookingUp(true);
    try {
      const response = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(value.slice(0, 5))}`);
      const payload = await response.json() as { places?: Array<{ latitude?: string; longitude?: string; "place name"?: string }> };
      const match = payload.places?.[0];
      const state = match && nearestState(Number(match.latitude), Number(match.longitude));
      if (!response.ok || !state) throw new Error("ZIP could not be mapped");
      setPlace({ state, label: `${match?.["place name"] ?? value}, ${state.abbr}`, source: "zip" });
      setFocusedState(state.abbr);
      setLookupStatus(`Showing ${state.name} for ZIP ${value.slice(0, 5)}.`);
    } catch {
      const state = stateForZip(value);
      if (!state) {
        setLookupStatus("That ZIP is not supported by the state-level map.");
      } else {
        setPlace({ state, label: `${state.name} (approximate)`, source: "zip", approximate: true });
        setFocusedState(state.abbr);
        setLookupStatus(`Showing ${state.name} approximately from its ZIP prefix.`);
      }
    } finally {
      setLookingUp(false);
    }
  };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setLookupStatus("Device location is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const state = nearestState(coords.latitude, coords.longitude);
        if (state) {
          setPlace({ state, label: `${state.name} from device location`, source: "device" });
          setFocusedState(state.abbr);
          setLookupStatus(`Showing the state nearest your device location: ${state.name}.`);
        } else {
          setLookupStatus("Your device location could not be mapped to a state tile.");
        }
        setLocating(false);
      },
      () => {
        setLookupStatus("Location permission was not granted. Your coordinates stay in this browser.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <main className="app">
      <header className="topbar">
        <a className="brand" href="#main-content" aria-label="NetPulse home">
          <span className="mark" aria-hidden="true">N</span> NetPulse
        </a>
        <span className={`mode-chip mode-${snapshot.metadata.mode}`}>{modeLabel(snapshot, liveStatus)}</span>
        <a className="ghost-button" href="#method">How it works</a>
      </header>

      <div className="view-tabs" role="tablist" aria-label="NetPulse workspace">
        <button id="signals-tab" role="tab" type="button" aria-selected={activeView === "signals"} aria-controls="signals-panel" className={activeView === "signals" ? "is-active" : ""} onClick={() => setActiveView("signals")}>Regional signals</button>
        <button id="diagnostics-tab" role="tab" type="button" aria-selected={activeView === "diagnostics"} aria-controls="diagnostics-panel" className={activeView === "diagnostics" ? "is-active" : ""} onClick={() => setActiveView("diagnostics")}>NOC diagnostics</button>
      </div>

      <section id="signals-panel" role="tabpanel" aria-labelledby="signals-tab" hidden={activeView !== "signals"}>
      <div id="main-content" className="hero">
        <div>
          <p className="eyebrow">Internet health, at state resolution</p>
          <h1>See broad connectivity signals without pretending they are street-level outages.</h1>
          <p className="hero-sub">NetPulse surfaces U.S. regional measurements from Georgia Tech&apos;s IODA project. A signal is a reason to look closer, not confirmation that your service is down.</p>
        </div>
        <section className="card lookup" aria-labelledby="lookup-heading">
          <h2 id="lookup-heading">Find your state</h2>
          <form className="zip-form" onSubmit={submitZip}>
            <label htmlFor="zip">U.S. ZIP code</label>
            <div className="zip-row">
              <input id="zip" value={zip} onChange={(event) => setZip(event.target.value)} inputMode="numeric" autoComplete="postal-code" placeholder="e.g. 30308" />
              <button className="primary-button" type="submit" disabled={lookingUp}>{lookingUp ? "Finding…" : "Find"}</button>
            </div>
          </form>
          <div className="segment" aria-label="Location methods">
            <span className="segment-item">ZIP is mapped to a state</span>
            <button className="secondary-button" type="button" onClick={useDeviceLocation} disabled={locating}>{locating ? "Locating…" : "Use device location"}</button>
          </div>
          <p className="lookup-status" role="status">{lookupStatus || `Currently centered on ${place.label}${place.approximate ? "; approximate" : ""}.`}</p>
        </section>
      </div>

      <section className={`card verdict tone-${verdictTone}`} aria-live="polite">
        <div className="verdict-main">
          <p className="eyebrow">{homeName}</p>
          <h2>{homeSeverity === "none" ? "No broad signal detected" : `${SEVERITY_LABEL[homeSeverity]} regional signal`}</h2>
        </div>
        <div className="verdict-stats"><strong>{homeEvents.length}</strong><span>{homeEvents.length === 1 ? "signal" : "signals"} in this state</span></div>
        <p className="verdict-detail">IODA aggregates at region level. It cannot tell whether a particular address or provider is affected.</p>
        <p className="verdict-note">{place.approximate ? "Location is approximate because the ZIP lookup was unavailable." : "State selected from ZIP, device location, or the map."}</p>
      </section>

      <div className="radius">
        <span>Coverage</span>
        <div className="radius-options"><span className="chip">50 states + DC</span><span className="chip">No distance radius</span><span className="chip">Regional only</span></div>
      </div>

      <div className="signal-layout">
        <StateGrid events={events} homeState={place.state?.abbr} focusedState={focusedState} onSelect={selectState} />
        <section className="card list-card" ref={listRef} tabIndex={-1} aria-labelledby="signals-heading">
          <div className="card-head">
            <div><p className="eyebrow">IODA summary</p><h2 id="signals-heading">Signals in the last 24 hours</h2></div>
            <span className="count-badge">{displayedEvents.length}</span>
          </div>
          {focusedState && <button type="button" className="ghost-button" onClick={() => setFocusedState(undefined)}>Show all states</button>}
          {displayedEvents.length ? <div>{displayedEvents.map((signal) => {
            const expanded = expandedId === signal.id;
            return <article className="signal" key={signal.id}>
              <button className="signal-summary" type="button" onClick={() => setExpandedId(expanded ? undefined : signal.id)} aria-expanded={expanded}>
                <span className={`signal-bar sev-${signal.severity}`} aria-hidden="true" />
                <span><strong className="signal-title">{signal.title}</strong><span className="signal-where">{signal.region || signal.name} · {signal.state}</span></span>
                <span className="signal-chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
              </button>
              {expanded && <div className="signal-detail"><p>{signal.summary || "IODA detected a regional connectivity anomaly in its aggregate summary."}</p><dl className="signal-facts"><div><dt>Severity</dt><dd>{SEVERITY_LABEL[signal.severity]}</dd></div><div><dt>Status</dt><dd>{signal.status || "Reported by IODA"}</dd></div><div><dt>Source</dt><dd>{signal.detectionSource || "IODA aggregate"}</dd></div></dl><p className="signal-caveat">This summary does not provide reliable event timing or a customer-level outage boundary.</p>{signal.demo && <span className="tag-demo">Demonstration data</span>}</div>}
            </article>;
          })}</div> : <div className="empty"><h3 className="empty-title">No signals detected</h3><p>{focusedState ? "No IODA summary signals match this state." : "IODA did not report broad U.S. signals in the last 24 hours."}</p></div>}
        </section>
      </div>

      <section id="method" className="source">
        <div><p className="eyebrow">Methodology</p><h2>What NetPulse is showing</h2></div>
        <div className="source-facts"><p>NetPulse starts with a static IODA snapshot so the page can load on GitHub Pages, then refreshes directly from Georgia Tech while this tab is visible.</p><p>Live refresh means your browser contacts Georgia Tech directly, so IODA can see your visitor IP address. The static snapshot path does not make that direct connection. Device coordinates stay local in your browser.</p><p className="disclosure">When live refresh fails, NetPulse keeps the last snapshot and shows its real age instead of fabricating a current result.</p><a className="text-link" href={snapshot.metadata.sourceUrl} target="_blank" rel="noreferrer">About Georgia Tech IODA</a></div>
      </section>
      </section>
      <section id="diagnostics-panel" role="tabpanel" aria-labelledby="diagnostics-tab" hidden={activeView !== "diagnostics"}>
        <DiagnosticsWorkbench />
      </section>
      <footer>NetPulse is an independent interface for regional internet-health signals. <a className="text-link" href="#main-content">Back to top</a></footer>
    </main>
  );
}
