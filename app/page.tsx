"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  FALLBACK_SNAPSHOT,
  OUTAGE_DATA_PATH,
  bearingDegrees,
  bearingLabel,
  formatSnapshotTime,
  haversineMiles,
  type OutageEvent,
  type OutageSnapshot,
} from "./outage-data";

type UserPlace = {
  lat: number;
  lon: number;
  label: string;
  source: "default" | "device" | "zip";
};

type NearbyEvent = OutageEvent & {
  distanceMiles: number;
  bearing: number;
};

const DEFAULT_PLACE: UserPlace = {
  lat: 39.0997,
  lon: -94.5786,
  label: "Kansas City starting view",
  source: "default",
};

const RADII = [100, 250, 500] as const;

function isSnapshot(value: unknown): value is OutageSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OutageSnapshot>;
  return Boolean(
    candidate.metadata &&
      Array.isArray(candidate.events) &&
      candidate.events.every(
        (event) =>
          event &&
          typeof event.id === "string" &&
          (event.kind === "internet" || event.kind === "power") &&
          typeof event.lat === "number" &&
          typeof event.lon === "number",
      ),
  );
}

function Radar({
  events,
  radius,
  place,
  selectedId,
  onSelect,
}: {
  events: NearbyEvent[];
  radius: number;
  place: UserPlace;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const radarSummary =
    events.length === 0
      ? `No outage signals are plotted within ${radius} miles of ${place.label}.`
      : `${events.length} outage ${events.length === 1 ? "signal" : "signals"} plotted within ${radius} miles of ${place.label}: ${events
          .map(
            (event) =>
              `${event.name}, ${Math.round(event.distanceMiles)} miles ${bearingLabel(event.bearing)}`,
          )
          .join("; ")}.`;

  return (
    <section className="radar-panel" aria-labelledby="radar-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Proximity view</p>
          <h2 id="radar-title">Signals around you</h2>
        </div>
        <span className="range-label">{radius} mi</span>
      </div>

      <p className="radar-place">
        <span className="location-pip" aria-hidden="true" />
        Centered on {place.label}
      </p>

      <div
        className="radar"
        role="group"
        aria-label={radarSummary}
        aria-describedby="radar-description"
      >
        <span className="radar-axis radar-axis-horizontal" aria-hidden="true" />
        <span className="radar-axis radar-axis-vertical" aria-hidden="true" />
        <span className="radar-ring radar-ring-one" aria-hidden="true" />
        <span className="radar-ring radar-ring-two" aria-hidden="true" />
        <span className="radar-ring radar-ring-three" aria-hidden="true" />
        <span className="radar-north" aria-hidden="true">
          N
        </span>
        <span className="radar-center" aria-hidden="true">
          <span />
        </span>

        {events.map((event) => {
          const angle = (event.bearing * Math.PI) / 180;
          const radialDistance = Math.min(event.distanceMiles / radius, 1) * 42;
          const x = 50 + Math.sin(angle) * radialDistance;
          const y = 50 - Math.cos(angle) * radialDistance;
          const isSelected = selectedId === event.id;

          return (
            <button
              className={`radar-marker severity-${event.severity}${isSelected ? " is-selected" : ""}`}
              key={event.id}
              type="button"
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={`Select ${event.title}, ${Math.round(event.distanceMiles)} miles ${bearingLabel(event.bearing)}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(event.id)}
            >
              <span aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <p className="sr-only" id="radar-description">
        Marker positions use each signal&apos;s actual distance and bearing from
        the selected location. The center dot represents your search location.
      </p>

      <div className="legend" aria-label="Signal severity legend">
        <span>
          <i className="legend-dot legend-major" /> Major
        </span>
        <span>
          <i className="legend-dot legend-moderate" /> Moderate
        </span>
        <span>
          <i className="legend-dot legend-recovering" /> Recovering
        </span>
      </div>
    </section>
  );
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<OutageSnapshot>(FALLBACK_SNAPSHOT);
  const [snapshotState, setSnapshotState] = useState("Checking the latest snapshot…");
  const [place, setPlace] = useState<UserPlace>(DEFAULT_PLACE);
  const [radius, setRadius] = useState<(typeof RADII)[number]>(500);
  const [zip, setZip] = useState("");
  const [lookupState, setLookupState] = useState(
    "Enter a ZIP code or use your device location.",
  );
  const [isLocating, setIsLocating] = useState(false);
  const [isZipLoading, setIsZipLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    FALLBACK_SNAPSHOT.events[0]?.id ?? null,
  );

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      try {
        const response = await fetch(OUTAGE_DATA_PATH, { cache: "no-store" });
        if (!response.ok) throw new Error("Snapshot request failed");
        const data: unknown = await response.json();
        if (!isSnapshot(data)) throw new Error("Snapshot format was invalid");
        if (!active) return;
        setSnapshot(data);
        setSelectedId(data.events[0]?.id ?? null);
        setSnapshotState(
          data.metadata.mode === "live"
            ? "Latest IODA snapshot loaded."
            : data.metadata.mode === "demo"
              ? "Demo snapshot loaded. These examples are not live."
              : "Live signals are currently unavailable.",
        );
      } catch {
        if (!active) return;
        setSnapshot(FALLBACK_SNAPSHOT);
        setSnapshotState(
          "Live signals are unavailable. Showing clearly marked demo data.",
        );
      }
    }

    loadSnapshot();
    return () => {
      active = false;
    };
  }, []);

  const nearbyEvents = useMemo<NearbyEvent[]>(() => {
    return snapshot.events
      .filter((event) => event.kind === "internet")
      .map((event) => ({
        ...event,
        distanceMiles: haversineMiles(place, event),
        bearing: bearingDegrees(place, event),
      }))
      .filter((event) => event.distanceMiles <= radius)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }, [place, radius, snapshot]);

  const majorCount = nearbyEvents.filter(
    (event) => event.severity === "major",
  ).length;

  function updatePlace(nextPlace: UserPlace) {
    setPlace(nextPlace);
    const nearest = snapshot.events
      .map((event) => ({
        id: event.id,
        distance: haversineMiles(nextPlace, event),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    setSelectedId(nearest?.distance <= radius ? nearest.id : null);
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setLookupState(
        "This browser does not support location. ZIP lookup is still available.",
      );
      return;
    }

    setIsLocating(true);
    setLookupState("Requesting your device location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updatePlace({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: "your current location",
          source: "device",
        });
        setLookupState(
          "Location found. Your coordinates stay in this browser and are only used for distance calculations.",
        );
        setIsLocating(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location access was declined. Enter a ZIP code instead."
            : "We could not determine your location. Enter a ZIP code instead.";
        setLookupState(message);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  async function lookupZip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedZip = zip.trim();
    if (!/^\d{5}$/.test(cleanedZip)) {
      setLookupState("Enter a valid 5-digit U.S. ZIP code.");
      return;
    }

    setIsZipLoading(true);
    setLookupState(`Looking up ${cleanedZip}…`);

    try {
      const response = await fetch(
        `https://api.zippopotam.us/us/${encodeURIComponent(cleanedZip)}`,
      );
      if (response.status === 404) throw new Error("not-found");
      if (!response.ok) throw new Error("service");
      const result = (await response.json()) as {
        places?: Array<{
          "place name"?: string;
          state?: string;
          latitude?: string;
          longitude?: string;
        }>;
      };
      const match = result.places?.[0];
      const lat = Number(match?.latitude);
      const lon = Number(match?.longitude);
      if (!match || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error("not-found");
      }

      const label = `${match["place name"] ?? cleanedZip}, ${match.state ?? cleanedZip}`;
      updatePlace({ lat, lon, label, source: "zip" });
      setLookupState(`Showing signals near ${label}.`);
    } catch (error) {
      setLookupState(
        error instanceof Error && error.message === "not-found"
          ? `We could not find ZIP code ${cleanedZip}. Check it and try again.`
          : "ZIP lookup is temporarily unavailable. Your current view has not changed.",
      );
    } finally {
      setIsZipLoading(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="NetPulse home">
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          NetPulse
        </a>
        <div className="freshness">
          <span
            className={`freshness-dot mode-${snapshot.metadata.mode}`}
            aria-hidden="true"
          />
          <span>
            {snapshot.metadata.mode === "live"
              ? "IODA snapshot"
              : snapshot.metadata.mode === "demo"
                ? "Demo mode"
                : "Data unavailable"}
            <small>{formatSnapshotTime(snapshot.metadata.fetchedAt)}</small>
          </span>
        </div>
      </header>

      <div className="page-shell" id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Local internet signal monitor</p>
            <h1 id="hero-title">Know when the internet goes quiet.</h1>
            <p className="hero-intro">
              See large-scale connectivity disruptions near the place you care
              about—without sending us your precise location.
            </p>
          </div>

          <div className="lookup-card">
            <div className="service-tabs" aria-label="Service type">
              <button type="button" className="service-tab is-active" aria-pressed="true">
                <span className="internet-glyph" aria-hidden="true" />
                Internet
              </button>
              <button
                type="button"
                className="service-tab"
                disabled
                aria-disabled="true"
                title="Power outage monitoring is coming soon"
              >
                <span className="power-glyph" aria-hidden="true">
                  ↯
                </span>
                Power
                <small>Coming soon</small>
              </button>
            </div>

            <form className="zip-form" onSubmit={lookupZip} noValidate>
              <label htmlFor="zip">U.S. ZIP code</label>
              <div className="zip-row">
                <input
                  id="zip"
                  name="zip"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="e.g. 30308"
                  maxLength={5}
                  value={zip}
                  onChange={(event) =>
                    setZip(event.target.value.replace(/\D/g, "").slice(0, 5))
                  }
                  aria-describedby="lookup-status"
                />
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isZipLoading}
                >
                  {isZipLoading ? "Finding…" : "Check area"}
                </button>
              </div>
            </form>

            <div className="or-divider" aria-hidden="true">
              <span />
              or
              <span />
            </div>

            <button
              type="button"
              className="location-button"
              onClick={useDeviceLocation}
              disabled={isLocating}
            >
              <span className="crosshair" aria-hidden="true" />
              {isLocating ? "Finding your location…" : "Use my location"}
            </button>

            <p
              className="lookup-status"
              id="lookup-status"
              role="status"
              aria-live="polite"
            >
              {lookupState}
            </p>
          </div>
        </section>

        <section className="status-strip" aria-labelledby="status-title">
          <div className="status-icon" aria-hidden="true">
            <span />
          </div>
          <div className="status-copy">
            <p className="eyebrow" id="status-title">
              Area status
            </p>
            <strong>
              {nearbyEvents.length === 0
                ? "No major signals nearby"
                : majorCount > 0
                  ? `${majorCount} major ${majorCount === 1 ? "signal" : "signals"} nearby`
                  : `${nearbyEvents.length} ${nearbyEvents.length === 1 ? "signal" : "signals"} nearby`}
            </strong>
            <p>
              {nearbyEvents.length === 0
                ? `No ${snapshot.metadata.mode === "demo" ? "demo " : ""}events within ${radius} miles of ${place.label}.`
                : `${nearbyEvents.length} total within ${radius} miles of ${place.label}.`}
            </p>
          </div>
          <div className="radius-control">
            <span id="radius-label">Nearby radius</span>
            <div role="radiogroup" aria-labelledby="radius-label">
              {RADII.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={radius === option}
                  className={radius === option ? "is-active" : ""}
                  onClick={() => {
                    setRadius(option);
                    const selected = snapshot.events.find(
                      (item) => item.id === selectedId,
                    );
                    if (
                      selected &&
                      haversineMiles(place, selected) > option
                    ) {
                      setSelectedId(null);
                    }
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="signal-grid">
          <Radar
            events={nearbyEvents}
            radius={radius}
            place={place}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <section className="events-panel" aria-labelledby="events-title">
            <div className="panel-heading events-heading">
              <div>
                <p className="eyebrow">Nearby activity</p>
                <h2 id="events-title">Internet signals</h2>
              </div>
              <span className="event-count">{nearbyEvents.length}</span>
            </div>

            {nearbyEvents.length > 0 ? (
              <div className="event-list">
                {nearbyEvents.map((event) => {
                  const selected = event.id === selectedId;
                  return (
                    <article
                      className={`event-card${selected ? " is-selected" : ""}`}
                      key={event.id}
                    >
                      <button
                        type="button"
                        className="event-select"
                        onClick={() => setSelectedId(event.id)}
                        aria-pressed={selected}
                      >
                        <span
                          className={`severity-mark severity-${event.severity}`}
                          aria-hidden="true"
                        />
                        <span className="event-main">
                          <span className="event-topline">
                            <strong>{event.title}</strong>
                            {event.demo && <em>Demo</em>}
                          </span>
                          <span className="event-region">
                            {event.name}, {event.state}
                          </span>
                          <span className="event-summary">{event.summary}</span>
                          <span className="event-meta">
                            <span>
                              {Math.round(event.distanceMiles)} mi ·{" "}
                              {bearingLabel(event.bearing)}
                            </span>
                            <span>
                              {event.status} · {event.detectionSource}
                            </span>
                          </span>
                        </span>
                        <span className="event-arrow" aria-hidden="true">
                          →
                        </span>
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-rings" aria-hidden="true">
                  <i />
                </span>
                <h3>No major signals nearby</h3>
                <p>
                  Try a wider radius or another ZIP code. An empty live result
                  means IODA has no macroscopic regional events in this snapshot,
                  not that every connection is working.
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="source-note" aria-labelledby="source-title">
          <div>
            <p className="eyebrow" id="source-title">
              Source &amp; methodology
            </p>
            <h2>Signals, not provider confirmations.</h2>
          </div>
          <div className="source-copy">
            <p>
              NetPulse displays macroscopic connectivity signals from{" "}
              <a
                href="https://ioda.inetintel.cc.gatech.edu/"
                target="_blank"
                rel="noreferrer"
              >
                Georgia Tech&apos;s IODA project
              </a>
              . IODA combines routing, active probing, and network telescope
              measurements. A signal can indicate broad disruption, but it is
              not confirmation from an internet provider.
            </p>
            <p className="source-disclosure" role="status" aria-live="polite">
              <strong>
                {snapshot.metadata.mode === "demo"
                  ? "Demo data—never presented as live."
                  : snapshot.metadata.mode === "live"
                    ? "Live build-time snapshot."
                    : "Live data currently unavailable."}
              </strong>{" "}
              {snapshot.metadata.note} Source: {snapshot.metadata.sourceName}.
              Captured {formatSnapshotTime(snapshot.metadata.fetchedAt)}.
              <span className="sr-only">{snapshotState}</span>
            </p>
          </div>
        </section>
      </div>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          NetPulse
        </a>
        <p>Private by design. Precise coordinates stay on your device.</p>
        <a href="https://ioda.inetintel.cc.gatech.edu/about" target="_blank" rel="noreferrer">
          How IODA works <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}
