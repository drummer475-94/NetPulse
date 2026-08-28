# NetPulse

NetPulse is a North Carolina resident dashboard for county electric outages and active National Weather Service alerts.

Power data comes from the North Carolina Department of Public Safety / Emergency Management ReadyNC service. Weather data comes from `api.weather.gov/alerts/active?area=NC`. Power is fresh for 45 minutes and stale after 60; weather is fresh for 5 minutes and stale after 10. The Worker stores only validated last-known-good snapshots in D1, so a failed refresh never turns a source into a fictional all-clear.

`/api/nc/status` returns the versioned normalized snapshot. `/api/health` exposes the deployment version and source freshness. Both are read-only and cached for 60 seconds.

ZIP matching and device-location matching happen in the browser. Coordinates are never transmitted or saved. The optional remembered setting stores only a county FIPS code locally. NetPulse is informational and does not replace Wireless Emergency Alerts, utility reporting, emergency services, or official agency instructions.

Run `npm run data:refresh`, `npm run build`, `npm test`, and `npm run lint` with Node 22.13+.
