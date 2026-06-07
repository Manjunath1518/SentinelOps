# SentinelOps

A self-contained system monitoring dashboard application for system health, host status, resource utilization, alerts, processes, and activity events.

## Run

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## App mode

For the best app-like experience, run it from `http://localhost:4173` instead of `file://`. The localhost version enables:

- installable web app metadata
- app icon and standalone window mode
- offline caching through the service worker
- connection status feedback inside the dashboard

## Notes

- The current build uses simulated telemetry so it can run without a backend service.
- Replace the simulator functions in `app.js` (`createTelemetry`, `updateHosts`, `updateProcesses`, and `maybeAddEvent`) with API calls when a real monitoring agent is available.
- The UI is responsive and includes live updates, time windows, filtering, sortable process metrics, alert acknowledgement, and chart hover details.
