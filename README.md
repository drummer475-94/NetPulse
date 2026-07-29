# NetPulse

NetPulse is a mobile-first static web app for finding major internet outage
signals near a device location or U.S. ZIP code. It uses a build-time snapshot
of Georgia Tech's Internet Outage Detection and Analysis (IODA) data and is
designed to deploy on GitHub Pages.

The initial checked-in snapshot is intentionally fictional and every example is
marked **Demo** in both the data and interface. Demo items are never described
as live.

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

The Vinext development server supports the existing Sites project. No precise
coordinates are stored: browser geolocation is used only in memory to calculate
distance and bearing. ZIP searches send only the entered ZIP code to
[Zippopotam.us](https://api.zippopotam.us/).

## Build and test

```bash
# Existing Vinext/Sites build
npm run build

# Product checks (includes the Vinext build)
npm test

# GitHub Pages static export to out/
npm run build:pages
```

For a repository project page, set the repository base path before the static
build:

```bash
NEXT_PUBLIC_BASE_PATH=/repository-name npm run build:pages
```

`NEXT_PUBLIC_BASE_PATH` should be empty for a root user or organization Pages
site such as `owner.github.io`. The included Pages workflow calculates this
automatically and supplies `NEXT_PUBLIC_SITE_URL` as the site origin for
absolute social-preview metadata.

## Outage snapshot

Browsers read `public/data/outages.json`; they never call IODA directly. The
build-time refresh script uses only Node built-ins:

```bash
npm run data:refresh
```

The script:

1. Gets U.S. region entities from IODA's `/v2/entities/query` endpoint.
2. Batches recent `/v2/outages/events` requests for those region codes.
3. Maps regional events to representative state centroids.
4. Writes a typed, source-attributed snapshot to
   `public/data/outages.json`.

If IODA is unavailable or its response cannot be mapped safely, the script exits
successfully and preserves the valid checked-in demo snapshot. If no valid
snapshot exists, it writes an empty `unavailable` snapshot. It never converts
demo data into apparently live data.

IODA detects macroscopic internet connectivity disruptions using routing,
active probing, and network telescope measurements. These signals are not
provider confirmations and do not diagnose individual home connections. Learn
more at the [official IODA site](https://ioda.inetintel.cc.gatech.edu/).



## Data model

The `OutageEvent` contract in `app/outage-data.ts` already accepts
`kind: "internet" | "power"`. The interface only activates internet signals in
this prototype; the Power control is deliberately disabled and labeled as
coming soon.
