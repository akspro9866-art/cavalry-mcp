import type { PresetDef } from "../types.js";

export const CAT11_CLOUD_DEVOPS: PresetDef[] = [
  {
    id: "deploy_pipeline",
    title: "Deploy Pipeline",
    category: "cloud_devops",
    description: "Four pipeline stages spin, check off and feed a live deploy log while the release progress bar fills.",
    params: {
      branch: { type: "string", default: "main", description: "Deploy branch" },
      duration: { type: "int", default: 42, description: "Duration in seconds" },
      accentColor: { type: "color", default: "#10B981", description: "Success colour" },
    },
    code: `
const panel = _rb.rect("Deploy Panel", 940, 580, { fill: "#0B0F14", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Deployment", 22, -430, 250, { color: "#F8FAFC" });
const branch = _rb.badge("Branch Badge", "branch: " + __o.branch, -278, 250, { fill: "#111827", color: "#94A3B8", fontSize: 11, height: 26, stroke: true, strokeColor: "#27303F" });
_rb.textRight("#4821", 12, 430, 256, { color: "#475569" });
const dur = _rb.textRight("0s", 20, 430, 214, { color: "#F8FAFC" });
_rb.counter(dur, { from: 0, to: __o.duration, suffix: "s", start: 8, duration: 58, ease: "SlowInOut", length: 1 });
track("duration", dur);
_rb.textRight("elapsed", 10, 430, 190, { color: "#475569" });
const stages = [
  { name: "Install", sub: "pnpm install --frozen-lockfile" },
  { name: "Build", sub: "vite build --mode production" },
  { name: "Test", sub: "vitest run --coverage" },
  { name: "Deploy", sub: "fly deploy --strategy rolling" }
];
for (let i = 0; i < stages.length; i++) {
  const y = 120 - i * 82;
  const row = _rb.rect("Stage Row " + i, 520, 70, { fill: i === 3 ? "#101B18" : "#111827", radius: 14, x: -170, y: y, stroke: true, strokeColor: i === 3 ? "#1E3A33" : "#1B2330", strokeWidth: 1 });
  const ring = _rb.circle("Stage Spinner " + i, 17, { fill: "#000000", alpha: 0, x: -392, y: y });
  const spinner = _rb.stroke(ring, i === 3 ? __o.accentColor : "#38BDF8", 3, { capStyle: 1, trim: [0, 24] });
  _rb.kf(ring, "rotation", [[8 + i * 14, 0], [24 + i * 14, 360]], "Linear");
  _rb.fade(ring, 24 + i * 14, 4, 100, 0, "SlowOut");
  const check = _rb.checkBadge("Stage Check " + i, -392, y, 36, __o.accentColor, { glow: 12 });
  _rb.pop(check.circle, 24 + i * 14, 14, { from: 0.001, ease: "SpringOut" });
  _rb.pop(check.check, 24 + i * 14, 14, { from: 0.001, ease: "SpringOut" });
  const name = _rb.textLeft(stages[i].name, 17, -360, y + 12, { color: "#E2E8F0" });
  const sub = _rb.textLeft(stages[i].sub, 11, -360, y - 12, { color: "#64748B" });
  _rb.fade(row, 2 + i * 5, 12, 0, 100, "SlowOut");
  _rb.fade(name, 4 + i * 5, 12, 0, 100, "SlowOut");
  _rb.fade(sub, 4 + i * 5, 12, 0, 100, "SlowOut");
  if (i === 0) track("stage", row);
  if (i === 3) track("deployCheck", check.circle);
}
const term = _rb.rect("Deploy Terminal", 340, 396, { fill: "#05080C", radius: 16, x: 250, y: 20, stroke: true, strokeColor: "#1F2937", strokeWidth: 1 });
const termBar = _rb.rect("Terminal Bar", 340, 32, { fill: "#111827", radius: 16, x: 250, y: 198 });
_rb.circle("Term Dot A", 4, { fill: "#F87171", x: 108, y: 198 });
_rb.circle("Term Dot B", 4, { fill: "#FBBF24", x: 122, y: 198 });
_rb.circle("Term Dot C", 4, { fill: "#34D399", x: 136, y: 198 });
_rb.textLeft("deploy.log", 10, 152, 198, { color: "#475569" });
const logs = [
  "> installing dependencies",
  "  resolved 428 packages",
  "> building production bundle",
  "  chunks 12  -  1.8 MB",
  "> running test suite",
  "  passed 214 / 214",
  "> deploying to edge",
  "  release v128 live"
];
for (let i = 0; i < logs.length; i++) {
  const line = _rb.textLeft(logs[i], 11, 106, 162 - i * 40, {
    color: i === 7 ? __o.accentColor : (logs[i].indexOf(">") === 0 ? "#E2E8F0" : "#64748B")
  });
  _rb.fade(line, 28 + i * 5, 8, 0, 100, "SlowOut");
  if (i === 0) track("log", line);
}
const bar = _rb.rect("Release Progress Track", 860, 10, { fill: "#1F2937", radius: 5, x: 0, y: -224 });
const fill = _rb.rect("Release Progress Fill", 860, 10, { fill: __o.accentColor, radius: 5, x: 0, y: -224 });
_rb.anchor(fill, -1, 0);
_rb.pos(fill, -430, -224);
_rb.kf(fill, "scale.x", [[0, 0.001], [76, 1]], "SlowInSlowOut");
_rb.glow(fill, __o.accentColor, 14, 1.3);
track("progress", fill);
_rb.textLeft("All stages green", 12, -430, -254, { color: "#64748B" });
_rb.textRight("v128  -  production", 12, 430, -254, { color: "#94A3B8" });
`,
  },
  {
    id: "server_rack_scale",
    title: "Server Rack Scale",
    category: "cloud_devops",
    description: "Server racks boot with blinking LEDs as an autoscaling group adds instances and the health counter climbs.",
    params: {
      instances: { type: "int", default: 5, description: "Active racks (3-6)" },
      accentColor: { type: "color", default: "#10B981", description: "Healthy LED colour" },
    },
    code: `
const n = Math.max(3, Math.min(6, __o.instances || 5));
const panel = _rb.rect("Rack Panel", 960, 580, { fill: "#0B0F14", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Auto scaling group", 22, -440, 248, { color: "#F8FAFC" });
_rb.textLeft("web-prod  -  us-east-1", 12, -440, 220, { color: "#64748B" });
const group = _rb.badge("ASG Badge", "min 2  /  max 8", 340, 248, { fill: "#111827", color: "#94A3B8", fontSize: 11, height: 26, stroke: true, strokeColor: "#27303F" });
const count = _rb.textRight("0 / " + n, 20, 440, 208, { color: "#F8FAFC" });
_rb.counter(count, { from: 0, to: n, suffix: " / " + n, start: 6, duration: 44, ease: "SlowInOut", length: 1 });
_rb.textRight("healthy instances", 10, 440, 184, { color: "#475569" });
track("count", count);
for (let i = 0; i < n; i++) {
  const x = _rb.rowX(i, n, 154);
  const rack = _rb.rect("Rack " + i, 126, 300, { fill: "#111827", radius: 14, x: x, y: 20, stroke: true, strokeColor: "#2A3648", strokeWidth: 2 });
  _rb.pop(rack, 6 + i * 8, 20, { from: 0.7, ease: "SpringOut", fade: false });
  for (let s = 0; s < 7; s++) {
    _rb.rect("Rack Slot " + i + "-" + s, 96, 20, { fill: "#0B0F14", radius: 4, x: x, y: 130 - s * 30 });
    const led = _rb.circle("Rack LED " + i + "-" + s, 3.4, {
      fill: s === 4 ? "#FBBF24" : __o.accentColor, x: x + 44, y: 130 - s * 30
    });
    _rb.kf(led, "opacity", [[8 + i * 4 + s * 2, 100], [16 + i * 4 + s * 2, 25], [26 + i * 4 + s * 2, 100]], "SlowInOut");
    if (s === 0) track("led", led);
  }
  _rb.text("node-" + (i + 1), 11, { color: "#94A3B8", x: x, y: -168 });
  _rb.text(i < 2 ? "warm" : "new", 9, { color: i < 2 ? "#475569" : __o.accentColor, x: x, y: -188 });
  if (i >= 2) {
    const badge = _rb.badge("Rack New " + i, "scaled out", x, -240, { fill: "#052E22", color: __o.accentColor, fontSize: 10, height: 22 });
    _rb.pop(badge.pill, 26 + i * 7, 12, { from: 0.4, ease: "SpringOut", fade: false });
    _rb.pop(badge.text, 26 + i * 7, 12, { from: 0.4, ease: "SpringOut", fade: false });
  }
}
const loadTrack = _rb.rect("Load Track", 820, 10, { fill: "#1F2937", radius: 5, x: 0, y: -262 });
const loadFill = _rb.rect("Load Fill", 820, 10, { fill: __o.accentColor, radius: 5, x: 0, y: -262 });
_rb.anchor(loadFill, -1, 0);
_rb.pos(loadFill, -410, -262);
_rb.kf(loadFill, "scale.x", [[10, 0.42], [56, 0.28]], "SlowInOut");
_rb.glow(loadFill, __o.accentColor, 12, 1.2);
_rb.textLeft("CPU utilisation  -  rebalanced", 11, -440, -286, { color: "#475569" });
_rb.textRight("28%", 11, 440, -286, { color: __o.accentColor });
track("load", loadFill);
`,
  },
  {
    id: "container_orchestration",
    title: "Container Orchestration",
    category: "cloud_devops",
    description: "A scheduler hub spins up replicas around it, wiring each pod as it becomes ready and reporting full health.",
    params: {
      replicas: { type: "int", default: 5, description: "Pods to schedule (4-6)" },
      accentColor: { type: "color", default: "#38BDF8", description: "Scheduler colour" },
    },
    code: `
const n = Math.max(4, Math.min(6, __o.replicas || 5));
const panel = _rb.rect("Orchestration Panel", 940, 600, { fill: "#0A0F15", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Cluster scheduler", 22, -430, 258, { color: "#F8FAFC" });
_rb.textLeft("6 nodes  -  rolling sync", 12, -430, 230, { color: "#64748B" });
const hub = _rb.poly("Scheduler Hub", 190, 6, { fill: "#0F1A24", x: 0, y: 4, rotation: 30 });
_rb.stroke(hub, __o.accentColor, 4, { capStyle: 1, trim: [0, 100] });
track("hub", hub);
_rb.glow(hub, __o.accentColor, 26, 1.2);
_rb.poly("Scheduler Hub Inner", 150, 6, { fill: "#111827", x: 0, y: 4, rotation: 30 });
_rb.text("scheduler", 17, { color: "#F8FAFC", x: 0, y: 16 });
_rb.text("kube-system", 10, { color: "#64748B", x: 0, y: -10 });
_rb.kf(hub, "rotation", [[8, 0], [60, 60]], "SlowInOut");
const count = _rb.textRight("0 / " + n, 20, 430, 198, { color: "#F8FAFC" });
_rb.counter(count, { from: 0, to: n, suffix: " / " + n, start: 10, duration: 46, ease: "SlowInOut", length: 1 });
_rb.textRight("replicas ready", 10, 430, 176, { color: "#475569" });
track("count", count);
for (let i = 0; i < n; i++) {
  const a = (-90 + i * (360 / n)) * Math.PI / 180;
  const px = Math.cos(a) * 330, py = Math.sin(a) * 190 + 4;
  const pod = _rb.rect("Pod " + i, 100, 86, { fill: "#111827", radius: 14, x: px, y: py, stroke: true, strokeColor: "#2A3648", strokeWidth: 2 });
  _rb.pop(pod, 12 + i * 8, 18, { from: 0.6, ease: "SpringOut", fade: false });
  _rb.text("pod-" + (i + 1), 11, { color: "#CBD5E1", x: px, y: py + 18 });
  _rb.text("1/1", 9, { color: "#64748B", x: px, y: py - 6 });
  const ready = _rb.dot("Pod Ready " + i, px + 32, py + 30, 7, __o.accentColor, { glow: 8 });
  const wire = _rb.line("Pod Wire " + i, 0, 4, px, py, 2, "#1E3A4A");
  _rb.kf(wire, "scale.x", [[8 + i * 4, 0.001], [22 + i * 4, 1]], "SlowInSlowOut");
  const t = 24 + i * 8;
  _rb.pop(ready, t, 10, { from: 0.001, ease: "SpringOut" });
  const check = _rb.text("\\u2713", 12, { color: __o.accentColor, x: px + 32, y: py + 30, name: "Pod Check " + i });
  _rb.pop(check, t, 10, { from: 0.001, ease: "SpringOut" });
  if (i === 0) track("pod", pod);
  if (i === 0) track("wire", wire);
}
_rb.sonar("Scheduler Pulse", 0, 4, 96, __o.accentColor, { count: 2, start: 8, gap: 10, duration: 36, width: 2, from: 55 });
const bar = _rb.rect("Replica Track", 820, 9, { fill: "#1F2937", radius: 5, x: 0, y: -244 });
const fill = _rb.rect("Replica Fill", 820, 9, { fill: __o.accentColor, radius: 5, x: 0, y: -244 });
_rb.anchor(fill, -1, 0);
_rb.pos(fill, -410, -244);
_rb.kf(fill, "scale.x", [[0, 0.001], [52, 1]], "SlowInSlowOut");
track("progress", fill);
_rb.textLeft("Scheduling policy  -  spread", 11, -430, -272, { color: "#475569" });
_rb.textRight("all replicas healthy", 11, 430, -272, { color: __o.accentColor });
`,
  },
  {
    id: "cloud_cost_meter",
    title: "Cloud Cost Meter",
    category: "cloud_devops",
    description: "Cloud spend rolls up against a budget with animated service bars and an under-budget savings badge.",
    params: {
      budget: { type: "int", default: 15000, description: "Monthly budget" },
      spend: { type: "int", default: 9840, description: "Current spend" },
      accentColor: { type: "color", default: "#10B981", description: "Under-budget colour" },
    },
    code: `
const panel = _rb.rect("Cost Panel", 940, 560, { fill: "#0B0F14", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Cloud spend", 22, -430, 240, { color: "#F8FAFC" });
_rb.textLeft("October 2026  -  all projects", 12, -430, 212, { color: "#64748B" });
const spendText = _rb.textLeft("$0", 66, -432, 128, { color: "#F8FAFC" });
_rb.counter(spendText, { from: 0, to: __o.spend, prefix: "$", start: 4, duration: 46, ease: "SlowInOut", length: 1, delimiter: "," });
track("spend", spendText);
_rb.textLeft("of $" + _rb.fmt(__o.budget) + " budget", 13, -430, 78, { color: "#64748B" });
const budgetBar = _rb.progress("Budget Bar", 420, 12, { x: -220, y: 46, pct: __o.spend / __o.budget, from: 0.001, start: 8, duration: 40, color: __o.accentColor, trackColor: "#1F2937" });
track("budget", budgetBar.fill);
const savingsPct = __o.budget > 0 ? Math.max(0, Math.round((1 - __o.spend / __o.budget) * 100)) : 0;
const savings = _rb.badge("Savings Badge", savingsPct + "% under budget", -290, -26, { fill: "#052E22", color: __o.accentColor, fontSize: 12, height: 30, stroke: true, strokeColor: "#065F46" });
_rb.pop(savings.pill, 42, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(savings.text, 42, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.textLeft("Projected month end  -  $" + _rb.fmt(Math.round((__o.spend * 1.14) / 10) * 10), 11, -430, -74, { color: "#475569" });
_rb.textLeft("Cost by service", 13, 250, 240, { color: "#94A3B8" });
const services = [
  { name: "Compute", value: 5420, pct: 0.55, colour: "#38BDF8" },
  { name: "Storage", value: 2180, pct: 0.22, colour: "#8B5CF6" },
  { name: "Egress", value: 2240, pct: 0.23, colour: "#F59E0B" }
];
for (let i = 0; i < services.length; i++) {
  const y = 150 - i * 96;
  _rb.textLeft(services[i].name, 16, 250, y + 10, { color: "#E2E8F0" });
  _rb.textRight("$" + _rb.fmt(Math.round(__o.spend * services[i].pct)), 14, 360, y + 10, { color: "#94A3B8" });
  const trackBar = _rb.rect("Service Track " + i, 340, 12, { fill: "#1F2937", radius: 6, x: 250, y: y - 24 });
  const fill = _rb.rect("Service Fill " + i, 340, 12, { fill: services[i].colour, radius: 6, x: 250, y: y - 24 });
  _rb.anchor(fill, -1, 0);
  _rb.pos(fill, 80, y - 24);
  _rb.kf(fill, "scale.x", [[10 + i * 6, 0.001], [34 + i * 6, services[i].pct]], "SlowInSlowOut");
  _rb.glow(fill, services[i].colour, 10, 0.8);
  if (i === 0) track("service", fill);
}
_rb.line("Cost Divider", 250, 202, 430, 202, 1, "#1F2937");
_rb.line("Cost Divider B", 250, -116, 430, -116, 1, "#1F2937");
_rb.textLeft("Forecast confidence", 11, 250, -146, { color: "#475569" });
_rb.textRight("High", 11, 430, -146, { color: __o.accentColor });
_rb.textLeft("Total", 14, 250, -186, { color: "#94A3B8" });
_rb.textRight("$" + _rb.fmt(__o.spend), 24, 430, -190, { color: "#F8FAFC" });
`,
  },
  {
    id: "uptime_status_board",
    title: "Uptime Status Board",
    category: "cloud_devops",
    description: "A status page banner reassures, service rows resolve an amber incident and the uptime strip fills green.",
    params: {
      services: { type: "int", default: 5, description: "Service rows (4-6)" },
      accentColor: { type: "color", default: "#10B981", description: "Operational colour" },
      warnColor: { type: "color", default: "#F59E0B", description: "Incident colour" },
    },
    code: `
const n = Math.max(4, Math.min(6, __o.services || 5));
const panel = _rb.rect("Status Panel", 880, 660, { fill: "#0B0F14", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
const banner = _rb.rect("Status Banner", 800, 94, { fill: "#071B14", radius: 18, x: 0, y: 254, stroke: true, strokeColor: "#0F3B2C", strokeWidth: 2 });
_rb.kf(banner, "position.y", [[0, 284], [24, 254]], "SpringOut");
_rb.fade(banner, 0, 16, 0, 100, "SlowOut");
_rb.glow(banner, __o.accentColor, 22, 0.45);
track("banner", banner);
const bannerCheck = _rb.checkBadge("Banner Check", -344, 254, 46, __o.accentColor, { glow: 16 });
_rb.pop(bannerCheck.circle, 10, 16, { from: 0.001, ease: "SpringOut" });
_rb.pop(bannerCheck.check, 10, 16, { from: 0.001, ease: "SpringOut" });
_rb.textLeft("All systems operational", 22, -300, 264, { color: "#F8FAFC" });
_rb.textLeft("Updated 30 seconds ago", 11, -300, 238, { color: "#64748B" });
_rb.badge("Uptime Badge", "99.98% uptime", 290, 254, { fill: "#052E22", color: __o.accentColor, fontSize: 11, height: 26 });
const names = ["API", "Dashboard", "Rendering", "Webhooks", "Auth", "CDN"];
for (let i = 0; i < n; i++) {
  const y = 130 - i * 70;
  const row = _rb.rect("Service Row " + i, 800, 58, { fill: "#111827", radius: 12, x: 0, y: y, stroke: true, strokeColor: "#1B2330", strokeWidth: 1 });
  const dot = _rb.dot("Service Dot " + i, -370, y, 10, __o.accentColor, { glow: 8 });
  _rb.textLeft(names[i], 15, -348, y, { color: "#E2E8F0" });
  _rb.textRight("99.99%", 12, 370, y, { color: "#64748B" });
  _rb.fade(row, 6 + i * 4, 10, 0, 100, "SlowOut");
  if (i === 2) {
    const warnDot = _rb.dot("Incident Dot", -370, y, 14, __o.warnColor, { glow: 16, glowIntensity: 1.8 });
    _rb.fade(warnDot, 10, 4, 0, 100, "SlowOut");
    _rb.fade(warnDot, 34, 6, 100, 0, "SlowOut");
    const warnText = _rb.textRight("degraded", 12, 370, y, { color: __o.warnColor });
    _rb.fade(warnText, 10, 4, 0, 100, "SlowOut");
    _rb.fade(warnText, 34, 6, 100, 0, "SlowOut");
    _rb.sonar("Incident Sonar", -370, y, 14, __o.warnColor, { count: 2, start: 10, gap: 6, duration: 24, width: 2, from: 80 });
    const resolved = _rb.badge("Resolved Badge", "resolved", 300, y, { fill: "#052E22", color: __o.accentColor, fontSize: 10, height: 22 });
    _rb.pop(resolved.pill, 42, 14, { from: 0.4, ease: "SpringOut", fade: false });
    _rb.pop(resolved.text, 42, 14, { from: 0.4, ease: "SpringOut", fade: false });
    const fix = _rb.dot("Incident Restored", -370, y, 10, __o.accentColor, { glow: 10 });
    _rb.pop(fix, 42, 12, { from: 0.001, ease: "SpringOut" });
    track("incident", warnText);
  }
  if (i === 0) track("row", row);
}
_rb.textLeft("90-day uptime", 12, -400, -292, { color: "#475569" });
for (let i = 0; i < 24; i++) {
  const bar = _rb.rect("Uptime Bar " + i, 26, i === 16 ? 26 : 36, {
    fill: i === 16 ? __o.warnColor : __o.accentColor, radius: 3,
    x: -300 + i * 30, y: -246
  });
  _rb.anchor(bar, 0, 1);
  _rb.pos(bar, -300 + i * 30, -264);
  _rb.opacity(bar, i === 16 ? 80 : 55);
  _rb.kf(bar, "scale.y", [[44 + i, 0.001], [50 + i, 1]], "SpringOut");
}
_rb.textRight("100%", 12, 400, -292, { color: __o.accentColor });
`,
  },
  {
    id: "load_balancer_split",
    title: "Load Balancer Split",
    category: "cloud_devops",
    description: "Incoming requests fan out across three healthy nodes while per-node load bars settle and throughput ticks up.",
    params: {
      rps: { type: "int", default: 8420, description: "Requests per second" },
      accentColor: { type: "color", default: "#38BDF8", description: "Network colour" },
      successColor: { type: "color", default: "#10B981", description: "Healthy colour" },
    },
    code: `
const panel = _rb.rect("Balancer Panel", 960, 600, { fill: "#0A0F15", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Load balancer", 22, -440, 260, { color: "#F8FAFC" });
_rb.textLeft("round robin  -  healthy", 12, -440, 232, { color: __o.successColor });
const client = _rb.rect("Client Node", 200, 140, { fill: "#111827", radius: 18, x: -380, y: 0, stroke: true, strokeColor: "#2A3648", strokeWidth: 2 });
_rb.pop(client, 0, 18, { from: 0.9, ease: "SpringOut", fade: false });
_rb.text("Internet", 18, { color: "#F8FAFC", x: -380, y: 18 });
_rb.text("edge requests", 10, { color: "#64748B", x: -380, y: -12 });
track("client", client);
const lb = _rb.poly("Balancer", 120, 6, { fill: "#0F1A24", x: -180, y: 0, rotation: 30 });
_rb.stroke(lb, __o.accentColor, 3, { capStyle: 1, trim: [0, 100] });
_rb.text("LB", 20, { color: "#F8FAFC", x: -180, y: 0 });
_rb.glow(lb, __o.accentColor, 20, 1.1);
const incoming = _rb.line("Incoming Wire", -290, 0, -240, 0, 4, __o.accentColor);
_rb.kf(incoming, "scale.x", [[6, 0.001], [16, 1]], "SlowInSlowOut");
const nodes = [
  { y: 150, label: "api-1", load: 0.62 },
  { y: 0, label: "api-2", load: 0.48 },
  { y: -150, label: "api-3", load: 0.35 }
];
for (let i = 0; i < nodes.length; i++) {
  const nd = nodes[i];
  const card = _rb.rect("Node " + i, 300, 126, { fill: "#111827", radius: 16, x: 300, y: nd.y, stroke: true, strokeColor: "#2A3648", strokeWidth: 2 });
  _rb.pop(card, 8 + i * 5, 18, { from: 0.8, ease: "SpringOut", fade: false });
  _rb.textLeft(nd.label, 16, 176, nd.y + 32, { color: "#F8FAFC" });
  _rb.textRight("us-east-1" + (i === 0 ? "a" : i === 1 ? "b" : "c"), 10, 424, nd.y + 34, { color: "#64748B" });
  _rb.dot("Node Dot " + i, 176, nd.y + 8, 8, __o.successColor, { glow: 8 });
  _rb.textLeft("healthy", 10, 190, nd.y + 8, { color: "#64748B" });
  const load = _rb.rect("Node Load " + i, 248, 8, { fill: "#1F2937", radius: 4, x: 300, y: nd.y - 34 });
  const fill = _rb.rect("Node Load Fill " + i, 248, 8, { fill: i === 0 ? "#F59E0B" : __o.accentColor, radius: 4, x: 300, y: nd.y - 34 });
  _rb.anchor(fill, -1, 0);
  _rb.pos(fill, 176, nd.y - 34);
  _rb.kf(fill, "scale.x", [[14 + i * 5, 0.001], [40 + i * 5, nd.load]], "SlowInSlowOut");
  const wire = _rb.line("Node Wire " + i, -240, 0, 150, nd.y, 3, __o.accentColor);
  _rb.kf(wire, "scale.x", [[6 + i * 4, 0.001], [20 + i * 4, 1]], "SlowInSlowOut");
  _rb.opacity(wire, 70);
  for (let p = 0; p < 2; p++) {
    const start = 26 + i * 4 + p * 18;
    const packet = _rb.dot("Packet " + i + "-" + p, -240, 0, 9, __o.accentColor, { glow: 10 });
    _rb.fade(packet, start, 2, 0, 100, "SlowOut");
    _rb.kf(packet, "position.x", [[start, -240], [start + 16, 150]], "SlowInSlowOut");
    _rb.kf(packet, "position.y", [[start, 0], [start + 16, nd.y]], "SlowInSlowOut");
    _rb.fade(packet, start + 14, 4, 100, 0, "SlowOut");
  }
  if (i === 0) track("node", card);
}
const rps = _rb.textRight("0", 34, 440, 160, { color: "#F8FAFC" });
_rb.counter(rps, { from: 0, to: __o.rps, start: 12, duration: 40, ease: "SlowOut", length: 1, delimiter: "," });
_rb.textRight("req / sec", 11, 440, 132, { color: "#64748B" });
track("rps", rps);
const bar = _rb.rect("Balance Track", 820, 9, { fill: "#1F2937", radius: 5, x: 0, y: -246 });
const fill = _rb.rect("Balance Fill", 820, 9, { fill: __o.accentColor, radius: 5, x: 0, y: -246 });
_rb.anchor(fill, -1, 0);
_rb.pos(fill, -410, -246);
_rb.kf(fill, "scale.x", [[0, 0.001], [44, 0.72]], "SlowInSlowOut");
_rb.textLeft("p95 latency  -  42 ms", 11, -440, -276, { color: "#475569" });
_rb.textRight("no failed requests", 11, 440, -276, { color: __o.successColor });
`,
  },
  {
    id: "autoscaling_chart",
    title: "Autoscaling Chart",
    category: "cloud_devops",
    description: "A load curve breaches the threshold, triggers a scale-out event and settles as five instance chips pop in.",
    params: {
      threshold: { type: "int", default: 75, description: "Scale threshold %" },
      instances: { type: "int", default: 5, description: "Final instance count" },
      accentColor: { type: "color", default: "#38BDF8", description: "Chart colour" },
    },
    code: `
const panel = _rb.rect("Autoscale Panel", 940, 600, { fill: "#0B0F14", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Autoscaling", 22, -430, 262, { color: "#F8FAFC" });
_rb.textLeft("CPU load  -  last 30 minutes", 12, -430, 234, { color: "#64748B" });
const pods = _rb.textRight("2", 34, 430, 258, { color: "#F8FAFC" });
_rb.counter(pods, { from: 2, to: __o.instances, start: 30, duration: 22, ease: "SpringOut", length: 1 });
_rb.textRight("instances", 10, 430, 232, { color: "#64748B" });
track("instances", pods);
for (let i = 0; i < 4; i++) {
  _rb.line("Chart Grid " + i, -430, 120 - i * 80, 430, 120 - i * 80, 1, "#151D2A");
}
const chart = _rb.sparkline("CPU Curve", [22, 28, 26, 34, 40, 48, 58, 72, 82, 84, 60, 48, 42, 40], 820, 300, 0, 20, __o.accentColor, 4, { start: 4, stagger: 2.4, segmentDuration: 9, glow: 14, dotSize: 14 });
track("curve", chart.dot);
const thresholdLine = _rb.line("Scale Threshold", -430, 90, 430, 90, 2, "#F59E0B");
_rb.opacity(thresholdLine, 75);
_rb.fade(thresholdLine, 6, 10, 0, 100, "SlowOut");
_rb.textRight(__o.threshold + "% threshold", 11, 430, 104, { color: "#F59E0B" });
const eventLine = _rb.line("Scale Event", 40, -140, 40, 160, 2, "#F8FAFC");
_rb.kf(eventLine, "scale.x", [[34, 0.001], [42, 1]], "SlowOut");
_rb.opacity(eventLine, 35);
const badge = _rb.badge("Scale Out", "scale out  +3", 40, 206, { fill: "#0F2433", color: __o.accentColor, fontSize: 12, height: 28, stroke: true, strokeColor: "#1E4A63" });
_rb.pop(badge.pill, 40, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(badge.text, 40, 16, { from: 0.4, ease: "SpringOut", fade: false });
track("event", badge.pill);
const chipsY = -208;
for (let i = 0; i < __o.instances; i++) {
  const x = _rb.rowX(i, __o.instances, 134);
  const chip = _rb.rect("Instance Chip " + i, 118, 58, { fill: "#111827", radius: 12, x: x, y: chipsY, stroke: true, strokeColor: i < 2 ? "#2A3648" : __o.accentColor, strokeWidth: 1 });
  _rb.text("i-" + (i + 1), 13, { color: "#E2E8F0", x: x, y: chipsY + 8 });
  _rb.text(i < 2 ? "running" : "new", 9, { color: i < 2 ? "#64748B" : __o.accentColor, x: x, y: chipsY - 12 });
  if (i >= 2) _rb.pop(chip, 36 + (i - 2) * 5, 14, { from: 0.4, ease: "SpringOut", fade: false });
  if (i === 0) track("chip", chip);
}
_rb.textLeft("min 2", 10, -430, -260, { color: "#475569" });
_rb.textRight("max 8", 10, 430, -260, { color: "#475569" });
_rb.textLeft("scale-out completes in 18s", 11, 0, -276, { color: "#475569" });
`,
  },
  {
    id: "region_map_pings",
    title: "Region Map Pings",
    category: "cloud_devops",
    description: "A dotted world map lights up edge regions while latency pings arc between them and regional badges pop.",
    params: {
      accentColor: { type: "color", default: "#38BDF8", description: "Route colour" },
      latency: { type: "int", default: 42, description: "Median latency ms" },
    },
    code: `
const panel = _rb.rect("Region Panel", 960, 580, { fill: "#080D13", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Global edge network", 22, -440, 252, { color: "#F8FAFC" });
_rb.textLeft("34 regions  -  anycast routing", 12, -440, 224, { color: "#64748B" });
const dot = _rb.dot("Map Dot", -420, 190, 4, "#2A3648");
_rb.opacity(dot, 45);
const map = _rb.dup(dot, { name: "Region Grid", columns: 24, rows: 11, width: 840, height: 360 });
_rb.opacity(map, 55);
track("map", map);
const regions = [
  { name: "SFO", x: -300, y: 60 },
  { name: "IAD", x: -140, y: 96 },
  { name: "FRA", x: 70, y: 120 },
  { name: "SIN", x: 300, y: -20 },
  { name: "SYD", x: 390, y: -150 }
];
for (let i = 0; i < regions.length; i++) {
  const r = regions[i];
  const ring = _rb.circle("Region Ring " + i, 17, { fill: "#000000", alpha: 0, x: r.x, y: r.y });
  _rb.stroke(ring, __o.accentColor, 2, { capStyle: 1, trim: [0, 100] });
  const core = _rb.dot("Region Core " + i, r.x, r.y, 13, __o.accentColor, { glow: 18, glowIntensity: 1.6 });
  _rb.pop(core, 8 + i * 5, 14, { from: 0.001, ease: "SpringOut" });
  _rb.fade(ring, 8 + i * 5, 10, 0, 100, "SlowOut");
  _rb.sonar("Region Ping " + i, r.x, r.y, 18, __o.accentColor, { count: 2, start: 12 + i * 5, gap: 10, duration: 30, width: 2, from: 70 });
  _rb.text(r.name, 11, { color: "#94A3B8", x: r.x, y: r.y - 34 });
  if (i === 0) track("region", core);
}
function arc(name, a, b, start) {
  const wire = _rb.line(name, a.x, a.y, b.x, b.y, 2, __o.accentColor);
  _rb.kf(wire, "scale.x", [[start, 0.001], [start + 12, 1]], "SlowInSlowOut");
  _rb.opacity(wire, 60);
  _rb.glow(wire, __o.accentColor, 8, 1.0);
  return wire;
}
track("routeA", arc("Route SFO IAD", regions[0], regions[1], 18));
track("routeB", arc("Route IAD FRA", regions[1], regions[2], 26));
track("routeC", arc("Route FRA SIN", regions[2], regions[3], 34));
track("routeD", arc("Route SIN SYD", regions[3], regions[4], 42));
const badges = [
  { label: "us-west  12 ms", x: -300, y: 122 },
  { label: "eu-central  28 ms", x: 70, y: 182 },
  { label: "ap-south  41 ms", x: 300, y: 42 }
];
for (let i = 0; i < badges.length; i++) {
  const b = _rb.badge("Region Badge " + i, badges[i].label, badges[i].x, badges[i].y, { fill: "#0F1A24", color: "#CBD5E1", fontSize: 10, height: 24, stroke: true, strokeColor: "#1E3448" });
  _rb.pop(b.pill, 40 + i * 6, 14, { from: 0.4, ease: "SpringOut", fade: false });
  _rb.pop(b.text, 40 + i * 6, 14, { from: 0.4, ease: "SpringOut", fade: false });
  if (i === 0) track("badge", b.pill);
}
_rb.badge("Latency Badge", "median " + __o.latency + " ms", 0, -238, { fill: "#052E22", color: "#34D399", fontSize: 12, height: 30, stroke: true, strokeColor: "#065F46" });
_rb.textLeft("route propagation  -  2.1s", 11, -440, -268, { color: "#475569" });
_rb.textRight("99.999% edge availability", 11, 440, -268, { color: "#475569" });
`,
  },
  {
    id: "kubernetes_pod_restart",
    title: "Kubernetes Pod Restart",
    category: "cloud_devops",
    description: "A crashing pod shakes, spins through restarts and recovers while its neighbours stay green and the rollout completes.",
    params: {
      restarts: { type: "int", default: 3, description: "Restart count" },
      accentColor: { type: "color", default: "#10B981", description: "Healthy colour" },
      errorColor: { type: "color", default: "#EF4444", description: "Crash colour" },
    },
    code: `
const panel = _rb.rect("Pod Panel", 940, 600, { fill: "#0B0F14", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Pod health", 22, -430, 258, { color: "#F8FAFC" });
_rb.textLeft("deployment  web  -  namespace prod", 12, -430, 230, { color: "#64748B" });
_rb.badge("Rollout Badge", "rollout  3 / 3", 350, 254, { fill: "#052E22", color: __o.accentColor, fontSize: 11, height: 26 });
const pods = [
  { x: -280, name: "web-7f9-a", state: "Running", colour: __o.accentColor, crash: false },
  { x: 0, name: "web-7f9-b", state: "CrashLoopBackOff", colour: __o.errorColor, crash: true },
  { x: 280, name: "web-7f9-c", state: "Running", colour: __o.accentColor, crash: false }
];
for (let i = 0; i < pods.length; i++) {
  const p = pods[i];
  const card = _rb.rect("Pod Card " + i, 250, 350, { fill: "#111827", radius: 18, x: p.x, y: 20, stroke: true, strokeColor: p.crash ? "#3F1D24" : "#27303F", strokeWidth: 2 });
  _rb.pop(card, 0 + i * 5, 18, { from: 0.9, ease: "SpringOut", fade: false });
  if (p.crash) _rb.kf(card, "position.x", [[16, p.x + 7], [20, p.x - 7], [24, p.x + 4], [28, p.x]], "SlowOut");
  _rb.textLeft(p.name, 14, p.x - 105, 152, { color: "#E2E8F0" });
  _rb.textLeft("restarts", 10, p.x - 105, 120, { color: "#64748B" });
  const count = _rb.textRight("0", 20, p.x + 104, 122, { color: p.crash ? __o.errorColor : "#94A3B8" });
  if (p.crash) _rb.counter(count, { from: 0, to: __o.restarts, start: 6, duration: 36, ease: "SlowOut", length: 1 });
  const ring = _rb.circle("Pod Ring " + i, 54, { fill: "#000000", alpha: 0, x: p.x, y: 22 });
  if (!p.crash) _rb.stroke(ring, "#1F2937", 4, { capStyle: 1, trim: [0, 100] });
  const face = _rb.circle("Pod Core " + i, 46, { fill: p.crash ? "#2A1218" : "#0F1A16", x: p.x, y: 22 });
  const stateDot = _rb.dot("Pod State Dot " + i, p.x - 30, 22, 10, p.colour, { glow: 10 });
  const state = _rb.text(p.state, 10, { color: p.colour, x: p.x + 18, y: 22 });
  const check = _rb.checkBadge("Pod Check " + i, p.x, 22, 48, __o.accentColor, { glow: 12 });
  if (p.crash) {
    _rb.opacity(check.circle, 0);
    _rb.opacity(check.check, 0);
    const spinner = _rb.stroke(ring, __o.errorColor, 4, { capStyle: 1, trim: [0, 28] });
    _rb.kf(ring, "rotation", [[8, 0], [40, 540]], "Linear");
    _rb.fade(spinner, 6, 4, 0, 100, "SlowOut");
    _rb.fade(spinner, 38, 6, 100, 0, "SlowOut");
    _rb.fade(state, 44, 6, 100, 0, "SlowOut");
    const running = _rb.text("Running", 10, { color: __o.accentColor, x: p.x + 18, y: 22, name: "Pod Recovered Label" });
    _rb.fade(running, 46, 8, 0, 100, "SlowOut");
    _rb.fill(check.circle, __o.accentColor);
    _rb.opacity(check.circle, 100);
    _rb.opacity(check.check, 100);
    _rb.pop(check.circle, 44, 16, { from: 0.001, ease: "SpringOut" });
    _rb.pop(check.check, 44, 16, { from: 0.001, ease: "SpringOut" });
    _rb.sonar("Pod Recovery", p.x, 22, 52, __o.accentColor, { count: 2, start: 44, gap: 6, duration: 26, width: 2, from: 60 });
    const resolved = _rb.badge("Pod Resolved", "recovered", p.x, -158, { fill: "#052E22", color: __o.accentColor, fontSize: 10, height: 22 });
    _rb.pop(resolved.pill, 50, 12, { from: 0.4, ease: "SpringOut", fade: false });
    _rb.pop(resolved.text, 50, 12, { from: 0.4, ease: "SpringOut", fade: false });
    track("recovered", running);
    track("restarts", count);
  } else {
    _rb.pop(check.circle, 4 + i * 4, 14, { from: 0.001, ease: "SpringOut" });
    _rb.pop(check.check, 4 + i * 4, 14, { from: 0.001, ease: "SpringOut" });
  }
  const log1 = _rb.textLeft("GET /health 200", 9, p.x - 105, -20, { color: "#475569" });
  const log2 = _rb.textLeft("ready in 1.2s", 9, p.x - 105, -46, { color: "#475569" });
  _rb.fade(log1, 6 + i * 4, 10, 0, 100, "SlowOut");
  _rb.fade(log2, 8 + i * 4, 10, 0, 100, "SlowOut");
  if (i === 0) track("pod", card);
}
const progressTrack = _rb.rect("Rollout Track", 820, 10, { fill: "#1F2937", radius: 5, x: 0, y: -222 });
const progressFill = _rb.rect("Rollout Fill", 820, 10, { fill: __o.accentColor, radius: 5, x: 0, y: -222 });
_rb.anchor(progressFill, -1, 0);
_rb.pos(progressFill, -410, -222);
_rb.kf(progressFill, "scale.x", [[4, 0.001], [54, 1]], "SlowInSlowOut");
_rb.glow(progressFill, __o.accentColor, 12, 1.1);
track("rollout", progressFill);
_rb.textLeft("0 unavailable", 11, -430, -252, { color: "#64748B" });
_rb.textRight("rollout complete", 11, 430, -252, { color: __o.accentColor });
`,
  },
  {
    id: "zero_downtime_switch",
    title: "Zero Downtime Switch",
    category: "cloud_devops",
    description: "Traffic shifts from blue to green with a sliding knob, both stacks stay healthy and a 0s downtime badge lands.",
    params: {
      blueVersion: { type: "string", default: "v128", description: "Blue version" },
      greenVersion: { type: "string", default: "v129", description: "Green version" },
      accentColor: { type: "color", default: "#10B981", description: "Green live colour" },
    },
    code: `
const panel = _rb.rect("Switch Panel", 960, 640, { fill: "#0B0F14", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Blue / green deploy", 22, -440, 280, { color: "#F8FAFC" });
_rb.textLeft("zero downtime traffic shift", 12, -440, 252, { color: "#64748B" });
const client = _rb.nodeCard("Switch Client", "Users", -390, 20, 180, 110, { sub: "100% traffic", iconColor: "#94A3B8" });
_rb.pop(client.card, 0, 16, { from: 0.9, ease: "SpringOut", fade: false });
track("client", client.card);
const blue = _rb.rect("Blue Stack", 290, 150, { fill: "#0B1620", radius: 18, x: 60, y: 130, stroke: true, strokeColor: "#1E4A63", strokeWidth: 2 });
_rb.textLeft("BLUE", 12, -66, 186, { color: "#38BDF8" });
_rb.textLeft("Deployment " + __o.blueVersion, 18, -66, 150, { color: "#F8FAFC" });
_rb.textLeft("3 pods  -  healthy", 11, -66, 118, { color: "#64748B" });
const blueLive = _rb.badge("Blue Live", "LIVE", 154, 186, { fill: "#0F2433", color: "#38BDF8", fontSize: 10, height: 22 });
const green = _rb.rect("Green Stack", 290, 150, { fill: "#071B14", radius: 18, x: 60, y: -130, stroke: true, strokeColor: "#1E3A33", strokeWidth: 2 });
_rb.textLeft("GREEN", 12, -66, -74, { color: __o.accentColor });
_rb.textLeft("Deployment " + __o.greenVersion, 18, -66, -110, { color: "#F8FAFC" });
_rb.textLeft("3 pods  -  healthy", 11, -66, -142, { color: "#64748B" });
const greenLive = _rb.badge("Green Live", "LIVE", 154, -74, { fill: "#052E22", color: __o.accentColor, fontSize: 10, height: 22 });
_rb.opacity(greenLive.pill, 0);
_rb.opacity(greenLive.text, 0);
_rb.pop(blue, 4, 16, { from: 0.9, ease: "SpringOut", fade: false });
_rb.pop(green, 8, 16, { from: 0.9, ease: "SpringOut", fade: false });
track("blue", blue);
track("green", green);
const blueWire = _rb.line("Blue Traffic", -300, 60, -90, 150, 4, "#38BDF8");
_rb.kf(blueWire, "scale.x", [[8, 0.001], [22, 1]], "SlowInSlowOut");
const greenWire = _rb.line("Green Traffic", -300, 60, -90, -120, 4, __o.accentColor);
_rb.kf(greenWire, "scale.x", [[36, 0.001], [50, 1]], "SlowInSlowOut");
_rb.glow(greenWire, __o.accentColor, 14, 1.2);
track("greenWire", greenWire);
const split = _rb.dot("Traffic Split", -300, 60, 12, "#94A3B8", { glow: 10 });
for (let i = 0; i < 4; i++) {
  const start = 10 + i * 6;
  const packet = _rb.dot("Blue Packet " + i, -300, 60, 8, "#38BDF8", { glow: 8 });
  _rb.fade(packet, start, 2, 0, 100, "SlowOut");
  _rb.kf(packet, "position.x", [[start, -300], [start + 12, -90]], "SlowInSlowOut");
  _rb.kf(packet, "position.y", [[start, 60], [start + 12, 150]], "SlowInSlowOut");
  _rb.fade(packet, start + 10, 3, 100, 0, "SlowOut");
}
for (let i = 0; i < 4; i++) {
  const start = 48 + i * 5;
  const packet = _rb.dot("Green Packet " + i, -300, 60, 8, __o.accentColor, { glow: 8 });
  _rb.fade(packet, start, 2, 0, 100, "SlowOut");
  _rb.kf(packet, "position.x", [[start, -300], [start + 12, -90]], "SlowInSlowOut");
  _rb.kf(packet, "position.y", [[start, 60], [start + 12, -120]], "SlowInSlowOut");
  _rb.fade(packet, start + 10, 3, 100, 0, "SlowOut");
}
_rb.fade(blueLive.pill, 40, 8, 100, 0, "SlowOut");
_rb.fade(blueLive.text, 40, 8, 100, 0, "SlowOut");
_rb.fade(greenLive.pill, 44, 8, 0, 100, "SlowOut");
_rb.fade(greenLive.text, 44, 8, 0, 100, "SlowOut");
const shiftTrack = _rb.rect("Shift Track", 460, 14, { fill: "#1F2937", radius: 7, x: 0, y: -232 });
const fill = _rb.rect("Shift Fill", 460, 14, { fill: __o.accentColor, radius: 7, x: 0, y: -232 });
_rb.anchor(fill, -1, 0);
_rb.pos(fill, -230, -232);
_rb.kf(fill, "scale.x", [[32, 0.001], [52, 1]], "SlowInSlowOut");
const knob = _rb.circle("Shift Knob", 15, { fill: "#F8FAFC", x: -230, y: -232 });
_rb.kf(knob, "position.x", [[32, -230], [52, 230]], "SlowInSlowOut");
_rb.textLeft("0%", 10, -230, -262, { color: "#475569" });
_rb.textRight("100%", 10, 230, -262, { color: "#475569" });
const live = _rb.badge("Switch Badge", "0s downtime", 0, -310, { fill: "#052E22", color: __o.accentColor, fontSize: 15, height: 38, stroke: true, strokeColor: "#065F46" });
_rb.pop(live.pill, 54, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(live.text, 54, 16, { from: 0.4, ease: "SpringOut", fade: false });
track("badge", live.pill);
_rb.textRight("traffic 100% green", 11, 440, -232, { color: __o.accentColor });
`,
  },
];
