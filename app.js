const state = {
  window: "1h",
  environment: "production",
  live: true,
  pausedTable: false,
  sortCpuDesc: true,
  query: "",
  hiddenSeries: new Set(),
  events: [],
  tick: 0,
  deferredInstallPrompt: null
};

const palette = {
  cpu: "#15958f",
  memory: "#d9624b",
  disk: "#7760b8",
  network: "#b8791b",
  grid: "#dbe0d7",
  text: "#18201f",
  muted: "#64706a"
};

const hostNames = [
  "api-01", "api-02", "web-01", "web-02", "db-01", "db-02",
  "cache-01", "queue-01", "worker-01", "worker-02", "edge-01", "edge-02"
];

const baseProcesses = [
  ["nginx", "web-01", 18, 412, "healthy"],
  ["postgres", "db-01", 36, 2840, "healthy"],
  ["redis-server", "cache-01", 21, 936, "healthy"],
  ["node-api", "api-01", 42, 1270, "watch"],
  ["python-worker", "worker-01", 31, 982, "healthy"],
  ["log-shipper", "edge-01", 9, 246, "healthy"],
  ["queue-consumer", "queue-01", 28, 812, "watch"],
  ["backup-agent", "db-02", 13, 514, "healthy"]
];

let telemetry = createTelemetry(72);
let hosts = createHosts();
let processes = createProcesses();
let alerts = createAlerts();
let timer = null;

const els = {
  lastUpdated: document.getElementById("lastUpdated"),
  liveToggle: document.getElementById("liveToggle"),
  refreshButton: document.getElementById("refreshButton"),
  environmentSelect: document.getElementById("environmentSelect"),
  searchInput: document.getElementById("searchInput"),
  healthDial: document.getElementById("healthDial"),
  healthScore: document.getElementById("healthScore"),
  hostCount: document.getElementById("hostCount"),
  hostMap: document.getElementById("hostMap"),
  alertsList: document.getElementById("alertsList"),
  clearAlertsButton: document.getElementById("clearAlertsButton"),
  installButton: document.getElementById("installButton"),
  appStatus: document.getElementById("appStatus"),
  toast: document.getElementById("toast"),
  processTable: document.getElementById("processTable"),
  activityLog: document.getElementById("activityLog"),
  eventCount: document.getElementById("eventCount"),
  sortCpuButton: document.getElementById("sortCpuButton"),
  pauseButton: document.getElementById("pauseButton"),
  chart: document.getElementById("mainChart"),
  tooltip: document.getElementById("chartTooltip"),
  values: {
    cpu: document.getElementById("cpuValue"),
    memory: document.getElementById("memoryValue"),
    disk: document.getElementById("diskValue"),
    network: document.getElementById("networkValue")
  },
  deltas: {
    cpu: document.getElementById("cpuDelta"),
    memory: document.getElementById("memoryDelta"),
    disk: document.getElementById("diskDelta"),
    network: document.getElementById("networkDelta")
  },
  sparklines: {
    cpu: document.getElementById("cpuSparkline"),
    memory: document.getElementById("memorySparkline"),
    disk: document.getElementById("diskSparkline"),
    network: document.getElementById("networkSparkline")
  }
};

function createTelemetry(points) {
  return Array.from({ length: points }, (_, index) => {
    const wave = index / 6;
    return {
      label: index,
      cpu: clamp(42 + Math.sin(wave) * 13 + noise(9), 10, 95),
      memory: clamp(61 + Math.cos(wave / 1.3) * 9 + noise(6), 20, 96),
      disk: clamp(54 + Math.sin(wave / 1.9) * 6 + noise(3), 25, 92),
      network: clamp(2.1 + Math.sin(wave / 1.7) * 0.48 + Math.random() * 0.56, 0.35, 4.8)
    };
  });
}

function createHosts() {
  return hostNames.map((name, index) => {
    const critical = index === 4;
    const warning = index === 7 || index === 10;
    return {
      name,
      region: index % 3 === 0 ? "us-east" : index % 3 === 1 ? "us-west" : "eu-core",
      cpu: critical ? 88 : warning ? 72 : Math.round(24 + Math.random() * 38),
      memory: critical ? 84 : warning ? 76 : Math.round(30 + Math.random() * 34),
      disk: critical ? 79 : warning ? 68 : Math.round(25 + Math.random() * 36),
      status: critical ? "critical" : warning ? "warning" : "healthy"
    };
  });
}

function createProcesses() {
  return baseProcesses.map(([name, host, cpu, memory, status], index) => ({
    id: `${name}-${index}`,
    name,
    host,
    cpu,
    memory,
    status
  }));
}

function createAlerts() {
  return [
    {
      id: "disk-db-01",
      severity: "critical",
      title: "db-01 disk pressure",
      detail: "Volume /data above 82%",
      time: "2m ago"
    },
    {
      id: "queue-lag",
      severity: "warning",
      title: "Queue latency rising",
      detail: "p95 delay reached 420 ms",
      time: "9m ago"
    },
    {
      id: "edge-restart",
      severity: "info",
      title: "edge-02 recovered",
      detail: "Health check stable for 15m",
      time: "17m ago"
    }
  ];
}

function noise(amount) {
  return (Math.random() - 0.5) * amount;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function latest() {
  return telemetry[telemetry.length - 1];
}

function previous() {
  return telemetry[telemetry.length - 2] || latest();
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function formatDelta(current, prior, suffix = "%") {
  const diff = current - prior;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}${suffix}`;
}

function formatMemory(value) {
  return value > 999 ? `${(value / 1024).toFixed(1)} GB` : `${Math.round(value)} MB`;
}

function render() {
  renderMetrics();
  renderHealth();
  renderHostMap();
  renderAlerts();
  renderProcesses();
  renderEvents();
  drawMainChart();
  Object.keys(els.sparklines).forEach(drawSparkline);
  els.lastUpdated.textContent = new Date().toLocaleTimeString([], { hour12: false });
  updateAppStatus();
}

function renderMetrics() {
  const now = latest();
  const then = previous();

  els.values.cpu.textContent = formatPercent(now.cpu);
  els.values.memory.textContent = formatPercent(now.memory);
  els.values.disk.textContent = formatPercent(now.disk);
  els.values.network.textContent = `${now.network.toFixed(1)} GB/s`;

  els.deltas.cpu.textContent = formatDelta(now.cpu, then.cpu);
  els.deltas.memory.textContent = formatDelta(now.memory, then.memory);
  els.deltas.disk.textContent = formatDelta(now.disk, then.disk);
  els.deltas.network.textContent = formatDelta(now.network, then.network, " GB/s");

  Object.entries(els.deltas).forEach(([metric, node]) => {
    const current = metric === "network" ? now.network : now[metric];
    const prior = metric === "network" ? then.network : then[metric];
    node.classList.toggle("stable", current <= prior);
  });
}

function renderHealth() {
  const criticalPenalty = hosts.filter((host) => host.status === "critical").length * 9;
  const warningPenalty = hosts.filter((host) => host.status === "warning").length * 4;
  const averageLoad = hosts.reduce((sum, host) => sum + host.cpu + host.memory + host.disk, 0) / (hosts.length * 3);
  const score = Math.round(clamp(104 - criticalPenalty - warningPenalty - averageLoad / 5, 54, 99));
  const circumference = 2 * Math.PI * 46;
  els.healthDial.style.strokeDasharray = String(circumference);
  els.healthDial.style.strokeDashoffset = String(circumference * (1 - score / 100));
  els.healthScore.textContent = `${score}%`;
}

function renderHostMap() {
  const filteredHosts = hosts.filter((host) => matchesQuery([host.name, host.region, host.status]));
  els.hostCount.textContent = filteredHosts.length;

  if (!filteredHosts.length) {
    els.hostMap.innerHTML = `<p class="empty-state">No hosts match this filter.</p>`;
    return;
  }

  els.hostMap.innerHTML = filteredHosts.map((host) => `
    <button class="host-tile ${host.status}" type="button" aria-label="${host.name}, ${host.status}">
      <strong>${host.name}</strong>
      <span>${host.region} / ${host.status}</span>
      <div class="host-bars" aria-hidden="true">
        <div class="mini-bar"><i style="width: ${host.cpu}%"></i></div>
        <div class="mini-bar"><i style="width: ${host.memory}%"></i></div>
        <div class="mini-bar"><i style="width: ${host.disk}%"></i></div>
      </div>
    </button>
  `).join("");
}

function renderAlerts() {
  const filteredAlerts = alerts.filter((alert) => matchesQuery([alert.title, alert.detail, alert.severity]));

  if (!filteredAlerts.length) {
    els.alertsList.innerHTML = `<p class="empty-state">No active alerts.</p>`;
    return;
  }

  els.alertsList.innerHTML = filteredAlerts.map((alert) => `
    <article class="alert-item ${alert.severity}">
      <span class="alert-severity" aria-hidden="true"></span>
      <div>
        <strong>${alert.title}</strong>
        <small>${alert.detail} / ${alert.time}</small>
      </div>
      <button class="alert-action" type="button" data-alert-id="${alert.id}" aria-label="Acknowledge ${alert.title}" title="Acknowledge">
        <span class="icon icon-check" aria-hidden="true"></span>
      </button>
    </article>
  `).join("");
}

function renderProcesses() {
  let rows = processes.filter((process) => matchesQuery([process.name, process.host, process.status]));
  rows = rows.sort((a, b) => state.sortCpuDesc ? b.cpu - a.cpu : a.cpu - b.cpu);

  if (!rows.length) {
    els.processTable.innerHTML = `<tr><td colspan="5">No processes match this filter.</td></tr>`;
    return;
  }

  els.processTable.innerHTML = rows.map((process) => `
    <tr>
      <td>
        <span class="process-name">
          <span class="process-icon" aria-hidden="true">${process.name.slice(0, 2).toUpperCase()}</span>
          ${process.name}
        </span>
      </td>
      <td>${process.host}</td>
      <td>${process.cpu.toFixed(1)}%</td>
      <td>${formatMemory(process.memory)}</td>
      <td><span class="status-chip ${process.status === "watch" ? "warn" : ""}">${process.status}</span></td>
    </tr>
  `).join("");
}

function renderEvents() {
  els.eventCount.textContent = state.events.length;
  els.activityLog.innerHTML = state.events.slice(0, 12).map((event) => `
    <li>
      <time>${event.time}</time>
      <p>${event.message}<br><small>${event.source}</small></p>
    </li>
  `).join("");
}

function updateAppStatus() {
  if (!els.appStatus) {
    return;
  }

  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  const offline = !navigator.onLine;
  els.appStatus.classList.toggle("is-offline", offline);
  els.appStatus.classList.toggle("is-installed", standalone && !offline);
  els.appStatus.lastChild.textContent = offline ? " Offline mode" : standalone ? " App installed" : " App ready";
}

function showToast(message) {
  if (!els.toast) {
    return;
  }

  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function matchesQuery(values) {
  if (!state.query) {
    return true;
  }
  const needle = state.query.toLowerCase();
  return values.some((value) => String(value).toLowerCase().includes(needle));
}

function drawSparkline(metric) {
  const canvas = els.sparklines[metric];
  const ctx = prepareCanvas(canvas);
  const points = telemetry.slice(-30).map((point) => point[metric]);
  const max = metric === "network" ? 5 : 100;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const color = palette[metric];

  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  points.forEach((value, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
    const y = height - (value / max) * (height - 6) - 3;
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  ctx.stroke();

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `${color}2b`);
  gradient.addColorStop(1, `${color}00`);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
}

function drawMainChart() {
  const canvas = els.chart;
  const ctx = prepareCanvas(canvas);
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const padding = { top: 22, right: 22, bottom: 38, left: 44 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, padding, plotW, plotH);
  ["cpu", "memory", "disk"].forEach((series) => {
    if (!state.hiddenSeries.has(series)) {
      drawSeries(ctx, series, padding, plotW, plotH);
    }
  });
}

function prepareCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

function drawGrid(ctx, padding, plotW, plotH) {
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = palette.muted;
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let step = 0; step <= 4; step += 1) {
    const y = padding.top + (plotH / 4) * step;
    const value = 100 - step * 25;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
    ctx.fillText(`${value}%`, padding.left - 10, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labels = windowLabels[state.window];
  labels.forEach((label, index) => {
    const x = padding.left + (plotW / (labels.length - 1)) * index;
    ctx.fillText(label, x, padding.top + plotH + 14);
  });
}

const windowLabels = {
  "1h": ["-60m", "-45m", "-30m", "-15m", "Now"],
  "6h": ["-6h", "-4.5h", "-3h", "-1.5h", "Now"],
  "24h": ["-24h", "-18h", "-12h", "-6h", "Now"]
};

function drawSeries(ctx, series, padding, plotW, plotH) {
  const points = telemetry.map((point) => point[series]);
  ctx.beginPath();
  points.forEach((value, index) => {
    const x = padding.left + (index / (points.length - 1)) * plotW;
    const y = padding.top + plotH - (value / 100) * plotH;
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  ctx.lineWidth = 3;
  ctx.strokeStyle = palette[series];
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function pushTelemetry() {
  const prev = latest();
  const loadShift = state.environment === "production" ? 1 : state.environment === "staging" ? -8 : 5;
  telemetry.push({
    label: state.tick,
    cpu: clamp(prev.cpu + noise(7) + loadShift / 8, 8, 96),
    memory: clamp(prev.memory + noise(4) + loadShift / 12, 18, 98),
    disk: clamp(prev.disk + noise(2), 24, 94),
    network: clamp(prev.network + noise(0.34) + loadShift / 70, 0.2, 5)
  });
  telemetry = telemetry.slice(-72);
}

function updateHosts() {
  hosts = hosts.map((host) => {
    const cpu = Math.round(clamp(host.cpu + noise(9), 8, 96));
    const memory = Math.round(clamp(host.memory + noise(6), 16, 96));
    const disk = Math.round(clamp(host.disk + noise(3), 18, 96));
    const peak = Math.max(cpu, memory, disk);
    return {
      ...host,
      cpu,
      memory,
      disk,
      status: peak > 86 ? "critical" : peak > 70 ? "warning" : "healthy"
    };
  });
}

function updateProcesses() {
  if (state.pausedTable) {
    return;
  }

  processes = processes.map((process) => ({
    ...process,
    cpu: clamp(process.cpu + noise(8), 1, 92),
    memory: clamp(process.memory + noise(120), 96, 3800),
    status: process.cpu > 64 ? "watch" : "healthy"
  }));
}

function maybeAddEvent() {
  const latestPoint = latest();
  const candidates = [
    {
      condition: latestPoint.cpu > 72,
      message: `CPU crossed ${Math.round(latestPoint.cpu)}%`,
      source: "scheduler"
    },
    {
      condition: latestPoint.memory > 76,
      message: `Memory pressure at ${Math.round(latestPoint.memory)}%`,
      source: "node-agent"
    },
    {
      condition: Math.random() > 0.72,
      message: "Autoscaler sampled cluster capacity",
      source: "control-plane"
    },
    {
      condition: Math.random() > 0.82,
      message: "Health checks completed successfully",
      source: "probe-runner"
    }
  ];

  const event = candidates.find((candidate) => candidate.condition);
  if (!event) {
    return;
  }

  state.events.unshift({
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    message: event.message,
    source: event.source
  });
  state.events = state.events.slice(0, 36);
}

function tick() {
  state.tick += 1;
  pushTelemetry();
  updateHosts();
  updateProcesses();
  maybeAddEvent();
  render();
}

function installEventHandlers() {
  els.liveToggle.addEventListener("change", () => {
    state.live = els.liveToggle.checked;
    state.live ? startTimer() : stopTimer();
  });

  els.refreshButton.addEventListener("click", () => {
    tick();
  });

  els.environmentSelect.addEventListener("change", () => {
    state.environment = els.environmentSelect.value;
    telemetry = createTelemetry(state.window === "24h" ? 120 : 72);
    hosts = createHosts();
    processes = createProcesses();
    state.events.unshift({
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      message: `Switched to ${state.environment}`,
      source: "dashboard"
    });
    render();
  });

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    renderHostMap();
    renderAlerts();
    renderProcesses();
  });

  document.querySelectorAll("[data-window]").forEach((button) => {
    button.addEventListener("click", () => {
      state.window = button.dataset.window;
      document.querySelectorAll("[data-window]").forEach((item) => item.classList.toggle("is-active", item === button));
      telemetry = createTelemetry(state.window === "24h" ? 120 : state.window === "6h" ? 96 : 72);
      render();
    });
  });

  document.querySelectorAll("[data-series]").forEach((button) => {
    button.addEventListener("click", () => {
      const series = button.dataset.series;
      state.hiddenSeries.has(series) ? state.hiddenSeries.delete(series) : state.hiddenSeries.add(series);
      button.classList.toggle("is-active", !state.hiddenSeries.has(series));
      drawMainChart();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-active", item === button));
      const view = button.dataset.view;
      const targets = {
        overview: ".topbar",
        hosts: "#hostsTitle",
        network: "[data-metric-card='network']",
        incidents: "#alertsTitle"
      };
      document.querySelector(targets[view])?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  els.clearAlertsButton.addEventListener("click", () => {
    alerts = alerts.filter((alert) => alert.severity === "critical");
    state.events.unshift({
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      message: "Warnings acknowledged",
      source: "operator"
    });
    render();
  });

  els.alertsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-alert-id]");
    if (!button) {
      return;
    }
    alerts = alerts.filter((alert) => alert.id !== button.dataset.alertId);
    render();
  });

  els.sortCpuButton.addEventListener("click", () => {
    state.sortCpuDesc = !state.sortCpuDesc;
    renderProcesses();
  });

  els.pauseButton.addEventListener("click", () => {
    state.pausedTable = !state.pausedTable;
    els.pauseButton.classList.toggle("is-active", state.pausedTable);
  });

  els.installButton.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) {
      showToast("Run from localhost to install SentinelOps as an app.");
      return;
    }

    state.deferredInstallPrompt.prompt();
    const choice = await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installButton.hidden = true;
    showToast(choice.outcome === "accepted" ? "SentinelOps is installing." : "Install dismissed.");
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installButton.hidden = false;
    showToast("SentinelOps can be installed from this browser.");
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    els.installButton.hidden = true;
    showToast("SentinelOps installed.");
    updateAppStatus();
  });

  window.addEventListener("online", () => {
    showToast("Telemetry connection restored.");
    updateAppStatus();
  });

  window.addEventListener("offline", () => {
    showToast("Offline mode active. Cached dashboard is available.");
    updateAppStatus();
  });

  window.addEventListener("resize", () => {
    drawMainChart();
    Object.keys(els.sparklines).forEach(drawSparkline);
  });

  els.chart.addEventListener("mousemove", handleChartPointer);
  els.chart.addEventListener("mouseleave", () => {
    els.tooltip.hidden = true;
  });
}

function handleChartPointer(event) {
  const rect = els.chart.getBoundingClientRect();
  const padding = { left: 44, right: 22 };
  const plotW = rect.width - padding.left - padding.right;
  const x = clamp(event.clientX - rect.left - padding.left, 0, plotW);
  const index = Math.round((x / plotW) * (telemetry.length - 1));
  const point = telemetry[index];
  if (!point) {
    return;
  }

  els.tooltip.hidden = false;
  els.tooltip.style.left = `${Math.min(rect.width - 160, event.clientX - rect.left + 12)}px`;
  els.tooltip.style.top = `${Math.max(12, event.clientY - rect.top - 72)}px`;
  els.tooltip.innerHTML = `
    <strong>${windowLabels[state.window][Math.min(4, Math.floor(index / Math.max(1, telemetry.length / 5)))]}</strong><br>
    CPU ${formatPercent(point.cpu)} / Memory ${formatPercent(point.memory)} / Disk ${formatPercent(point.disk)}
  `;
}

function startTimer() {
  stopTimer();
  timer = window.setInterval(tick, 2600);
}

function stopTimer() {
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("./service-worker.js")
    .then(() => {
      showToast("App shell cached for offline use.");
      updateAppStatus();
    })
    .catch(() => {
      showToast("Offline cache needs localhost or HTTPS.");
    });
}

installEventHandlers();
registerServiceWorker();
state.events = [
  {
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    message: "Dashboard connected to telemetry stream",
    source: "dashboard"
  }
];
render();
startTimer();
