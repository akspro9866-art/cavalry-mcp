import type { PresetDef } from "../types.js";

export const CAT08_WORKFLOWS_NODES: PresetDef[] = [
  {
    id: "trigger_action_flow",
    title: "Trigger Action Flow",
    category: "workflows_nodes",
    description: "Three automation cards connected by wires that draw on one after another, each card igniting as the signal arrives.",
    params: {
      triggerText: { type: "string", default: "New signup", description: "Trigger sub-label" },
      actionText: { type: "string", default: "Create workspace", description: "Action sub-label" },
      wireColor: { type: "color", default: "#38BDF8", description: "Wire colour" },
    },
    code: `
const cards = [
  { x: -420, title: "Trigger", sub: __o.triggerText, color: "#38BDF8" },
  { x: 0, title: "Action", sub: __o.actionText, color: "#8B5CF6" },
  { x: 420, title: "Result", sub: "Workspace ready", color: "#10B981" }
];
for (let i = 0; i < cards.length; i++) {
  const c = cards[i];
  const node = _rb.nodeCard("Flow Card " + i, c.title, c.x, 0, 300, 160, {
    sub: c.sub, iconColor: c.color, strokeColor: i === 1 ? c.color : "#334155"
  });
  const glow = _rb.glow(node.card, c.color, 26, 0.2);
  _rb.kf(glow, "intensity", [[0, 0.1], [i * 18 + 2, 0.1], [i * 18 + 12, 1.8], [i * 18 + 24, 0.35]], "SlowOut");
  _rb.pop(node.card, i * 3, 14, { from: 0.94, ease: "SpringOut", fade: false });
  if (i === 0) track("card", node.card);
  if (i === 2) track("glow", glow);
}
function wire(name, x1, x2, start, end) {
  const l = _rb.line(name, x1, 0, x2, 0, 4, __o.wireColor);
  _rb.kf(l, "scale.x", [[start, 0.001], [end, 1]], "SlowInSlowOut");
  _rb.glow(l, __o.wireColor, 12, 1.1);
  return l;
}
track("wire1", wire("Wire 1", -270, -150, 12, 28));
track("wire2", wire("Wire 2", 150, 270, 30, 46));
_rb.dot("Flow Node 1", -150, 0, 12, __o.wireColor, { glow: 16, glowIntensity: 1.4 });
_rb.dot("Flow Node 2", 270, 0, 12, "#10B981", { glow: 16, glowIntensity: 1.4 });
_rb.textLeft("listening", 12, -480, -110, { color: "#475569" });
_rb.text("running", 12, { color: "#475569", x: 0, y: -110 });
_rb.textRight("complete", 12, 480, -116, { color: "#475569" });
`,
  },
  {
    id: "conditional_branch_router",
    title: "Conditional Branch Router",
    category: "workflows_nodes",
    description: "An If/Else diamond routes a packet down the true and false branches, with travelling pulses and result badges.",
    params: {
      conditionLabel: { type: "string", default: "plan == pro", description: "Condition expression" },
      passColor: { type: "color", default: "#10B981", description: "True branch colour" },
      failColor: { type: "color", default: "#EF4444", description: "False branch colour" },
    },
    code: `
const diamond = _rb.rect("If Else Router", 170, 170, {
  fill: "#111827", radius: 22, x: -380, y: 0,
  stroke: true, strokeColor: "#475569", strokeWidth: 2
});
_rb.rot(diamond, 45);
track("router", diamond);
_rb.text("If / Else", 20, { color: "#F8FAFC", x: -380, y: 0 });
_rb.text(__o.conditionLabel, 14, { color: "#94A3B8", x: -380, y: 145 });

function branch(name, y, color, label) {
  const line = _rb.line(name + " Wire", -295, 0, 70, y, 4, color);
  _rb.kf(line, "scale.x", [[10, 0.001], [30, 1]], "SlowInSlowOut");
  _rb.glow(line, color, 14, 1.2);
  const pulse = _rb.dot(name + " Pulse", -295, 0, 14, color, { glow: 20, glowIntensity: 1.8 });
  _rb.fade(pulse, 28, 4, 0, 100, "SlowOut");
  _rb.kf(pulse, "position.x", [[28, -295], [50, 70]], "SlowInSlowOut");
  _rb.kf(pulse, "position.y", [[28, 0], [50, y]], "SlowInSlowOut");
  _rb.fade(pulse, 48, 6, 100, 0, "SlowOut");
  const node = _rb.nodeCard(name + " Node", label, 220, y, 300, 110, {
    sub: label === "TRUE" ? "run action" : "fallback", iconColor: color, strokeColor: color
  });
  _rb.pop(node.card, 46, 18, { from: 0.86, ease: "SpringOut", fade: false });
  const badge = _rb.badge(name + " Badge", label, 342, y + 66, { fill: color, color: "#04120C", fontSize: 11, height: 24 });
  _rb.pop(badge.pill, 52, 14, { from: 0.6, ease: "SpringOut", fade: false });
  _rb.pop(badge.text, 52, 14, { from: 0.6, ease: "SpringOut", fade: false });
  return line;
}
track("trueWire", branch("True", 180, __o.passColor, "TRUE"));
track("falseWire", branch("False", -180, __o.failColor, "FALSE"));
`,
  },
  {
    id: "data_packet_conveyor",
    title: "Data Packet Conveyor",
    category: "workflows_nodes",
    description: "Capsules stream along a conveyor and pass through a glowing transform processor, staggered by a linear duplicator.",
    params: {
      count: { type: "int", default: 10, description: "Packets in flight" },
      speed: { type: "int", default: 36, description: "Frames per traverse" },
      accentColor: { type: "color", default: "#38BDF8", description: "Packet colour" },
    },
    code: `
const belt = _rb.rect("Conveyor Belt", 1080, 6, { fill: "#1F2937", radius: 3, x: 0, y: 0 });
track("belt", belt);
const proc = _rb.rect("Transform Processor", 230, 180, {
  fill: "#111827", radius: 20, x: 0, y: 40,
  stroke: true, strokeColor: __o.accentColor, strokeWidth: 2
});
_rb.glow(proc, __o.accentColor, 26, 1.3);
track("processor", proc);
_rb.text("TRANSFORM", 16, { color: "#F8FAFC", x: 0, y: 62 });
_rb.text("parse - map - emit", 12, { color: "#64748B", x: 0, y: 36 });
const cap = _rb.rect("Packet", 48, 22, { fill: __o.accentColor, radius: 11, x: -500, y: 0 });
_rb.glow(cap, __o.accentColor, 12, 1.2);
const n = Math.max(3, Math.min(24, __o.count || 10));
const dup = _rb.dup(cap, { name: "Packet Stream", distribution: "linear", count: n, size: 1000 });
_rb.stagger(dup, 4);
const dur = Math.max(14, __o.speed || 36);
_rb.kf(cap, "position.x", [[0, -500], [dur, 500]], "Linear");
_rb.fade(cap, 0, 4, 0, 100, "Linear");
_rb.fade(cap, dur - 5, 5, 100, 0, "Linear");
track("packets", dup);
const ring = _rb.circle("Processor Ring", 138, { fill: "#000000", alpha: 0, x: 0, y: 40 });
_rb.stroke(ring, __o.accentColor, 3, { capStyle: 1, trim: [0, 100] });
_rb.kf(ring, "scale.x", [[0, 0.7], [20, 1.15], [46, 0.7]], "SlowInOut");
_rb.kf(ring, "scale.y", [[0, 0.7], [20, 1.15], [46, 0.7]], "SlowInOut");
`,
  },
  {
    id: "webhook_retry_loop",
    title: "Webhook Retry Loop",
    category: "workflows_nodes",
    description: "A failed delivery retries along a dashed loop, then a second pulse lands green and marks the target delivered.",
    params: {
      failColor: { type: "color", default: "#EF4444", description: "Failed attempt colour" },
      passColor: { type: "color", default: "#10B981", description: "Delivered colour" },
    },
    code: `
const a = _rb.nodeCard("Source Node", "Source", -380, 0, 240, 120, { sub: "event.created", iconColor: "#38BDF8" });
const b = _rb.nodeCard("Target Node", "Target", 380, 0, 240, 120, { sub: "https://api.acme.dev", iconColor: __o.passColor });
track("source", a.card);
_rb.rect("Direct Wire", 520, 4, { fill: "#334155", x: 0, y: 0 });
const retry1 = _rb.line("Retry Up B", 380, 60, 380, 170, 3, __o.failColor);
const retry2 = _rb.line("Retry Across", 380, 170, -380, 170, 3, __o.failColor);
const retry3 = _rb.line("Retry Down A", -380, 170, -380, 60, 3, __o.failColor);
function drawSeg(seg, start, end) { _rb.kf(seg, "scale.x", [[start, 0.001], [end, 1]], "SlowInSlowOut"); }
drawSeg(retry1, 24, 32); drawSeg(retry2, 30, 38); drawSeg(retry3, 36, 44);
track("retry", retry2);
const failDot = _rb.dot("Fail Pulse", -260, 0, 14, __o.failColor, { glow: 18, glowIntensity: 1.6 });
_rb.kf(failDot, "position.x", [[8, -260], [26, 250]], "SlowInSlowOut");
_rb.kf(failDot, "position.y", [[28, 0], [32, 60], [36, 170], [42, 170], [46, 60], [50, 0]], "SlowInSlowOut");
_rb.kf(failDot, "position.x", [[40, 380], [44, 0], [48, -380], [52, -260]], "SlowInSlowOut");
_rb.fade(failDot, 50, 8, 100, 0, "SlowOut");
const passDot = _rb.dot("Pass Pulse", -260, 0, 14, __o.passColor, { glow: 18, glowIntensity: 1.6 });
_rb.fade(passDot, 50, 3, 0, 100, "SlowOut");
_rb.kf(passDot, "position.x", [[52, -260], [70, 250]], "SlowInSlowOut");
_rb.fade(passDot, 70, 6, 100, 0, "SlowOut");
const ok = _rb.checkBadge("Delivered Check", 462, 66, 34, __o.passColor, { glow: 16 });
_rb.pop(ok.circle, 70, 16, { from: 0.001, ease: "SpringOut", fade: false });
_rb.pop(ok.check, 70, 16, { from: 0.001, ease: "SpringOut", fade: false });
track("check", ok.circle);
const delivered = _rb.badge("Delivered", "Delivered  200", 0, -118, { fill: "#052E22", color: __o.passColor, fontSize: 14, height: 34, stroke: true, strokeColor: "#065F46" });
_rb.pop(delivered.pill, 72, 16, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(delivered.text, 72, 16, { from: 0.5, ease: "SpringOut", fade: false });
_rb.textLeft("retry 1", 12, 300, 190, { color: "#7F1D1D" });
`,
  },
  {
    id: "cron_schedule_clock",
    title: "Cron Schedule Clock",
    category: "workflows_nodes",
    description: "Clock hands spin through scheduled cycles while sonar rings fire from the dial on every pass.",
    params: {
      label: { type: "string", default: "Every hour", description: "Schedule label" },
      cycles: { type: "int", default: 2, description: "Minute-hand revolutions" },
      ringColor: { type: "color", default: "#38BDF8", description: "Sonar colour" },
    },
    code: `
const dial = _rb.circle("Clock Dial", 190, { fill: "#0F172A", alpha: 0, x: 0, y: 0 });
_rb.stroke(dial, "#334155", 4, { capStyle: 1, trim: [0, 100] });
track("dial", dial);
for (let i = 0; i < 12; i++) {
  const a = i * 30 * Math.PI / 180;
  _rb.rect("Hour Tick " + i, 3, 14, {
    fill: i % 3 === 0 ? "#94A3B8" : "#334155", radius: 2,
    x: Math.sin(a) * 170, y: Math.cos(a) * 170, rotation: -i * 30
  });
}
const minute = _rb.rect("Minute Hand", 6, 150, { fill: "#F8FAFC", radius: 3, x: 0, y: 0 });
_rb.anchor(minute, 0, 1);
const hour = _rb.rect("Hour Hand", 9, 96, { fill: __o.ringColor, radius: 4, x: 0, y: 0 });
_rb.anchor(hour, 0, 1);
_rb.kf(minute, "rotation", [[0, 0], [80, 720 * (__o.cycles || 2)]], "SlowInOut");
_rb.kf(hour, "rotation", [[0, 0], [80, 60 * (__o.cycles || 2)]], "SlowInOut");
_rb.circle("Clock Cap", 11, { fill: __o.ringColor, x: 0, y: 0 });
track("minute", minute);
_rb.sonar("Cron Sonar", 0, 0, 190, __o.ringColor, { count: 3, start: 8, gap: 26, duration: 38, width: 2, from: 55 });
_rb.text(__o.label, 24, { color: "#F8FAFC", x: 0, y: -262 });
_rb.text("auto-sync running", 13, { color: "#64748B", x: 0, y: -292 });
`,
  },
  {
    id: "schema_field_mapper",
    title: "Schema Field Mapper",
    category: "workflows_nodes",
    description: "Source and warehouse tables connected by staggered field wires that draw across the gap one by one.",
    params: {
      rows: { type: "int", default: 4, description: "Field rows per table (2-8)" },
      wireColor: { type: "color", default: "#38BDF8", description: "Mapping wire colour" },
    },
    code: `
const n = Math.max(2, Math.min(8, __o.rows || 4));
const leftNames = ["id", "email", "plan", "created_at", "team_id", "role", "status", "mrr"];
const rightNames = ["user_id", "email", "tier", "created", "team_id", "role", "status", "mrr"];
const startY = 100, gap = 66;
_rb.textLeft("SOURCE", 12, -470, startY + 70, { color: "#64748B" });
_rb.textRight("WAREHOUSE", 12, 470, startY + 76, { color: "#64748B" });
for (let i = 0; i < n; i++) {
  const y = startY - i * gap;
  const l = _rb.rect("Source Field " + i, 300, 52, { fill: "#111827", radius: 12, x: -380, y: y, stroke: true, strokeColor: "#334155", strokeWidth: 1 });
  _rb.textLeft(leftNames[i] || "field_" + i, 16, -510, y, { color: "#E2E8F0" });
  _rb.textRight(i === 0 ? "uuid" : "text", 11, -238, y, { color: "#475569" });
  const r = _rb.rect("Target Field " + i, 300, 52, { fill: "#111827", radius: 12, x: 380, y: y, stroke: true, strokeColor: "#1E3A4A", strokeWidth: 1 });
  _rb.textLeft(rightNames[i] || "field_" + i, 16, 250, y, { color: "#E2E8F0" });
  _rb.textRight(i === 0 ? "uuid" : "text", 11, 522, y, { color: "#475569" });
  const wire = _rb.line("Map Wire " + i, -230, y, 230, y, 3, __o.wireColor);
  _rb.kf(wire, "scale.x", [[8 + i * 4, 0.001], [22 + i * 4, 1]], "SlowInSlowOut");
  _rb.glow(wire, __o.wireColor, 10, 1.0);
  _rb.dot("Map Start " + i, -230, y, 8, __o.wireColor);
  _rb.dot("Map End " + i, 230, y, 8, __o.wireColor);
  if (i === 0) track("wire", wire);
  if (i === 0) track("sourceRow", l);
}
`,
  },
  {
    id: "batch_queue_processor",
    title: "Batch Queue Processor",
    category: "workflows_nodes",
    description: "A queue grid drains card by card while worker rings pulse and the processed counter climbs to completion.",
    params: {
      queueCount: { type: "int", default: 9, description: "Queued jobs (3-12)" },
      accentColor: { type: "color", default: "#10B981", description: "Queue accent" },
    },
    code: `
const n = Math.max(3, Math.min(12, __o.queueCount || 9));
const cols = 3, rows = Math.ceil(n / cols);
const qx = -340, qy = 70, cell = 78;
_rb.rect("Queue Panel", 286, 326, { fill: "#0D1117", radius: 20, x: qx + 40, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.textLeft("QUEUE", 12, qx - 92, 190, { color: "#64748B" });
for (let i = 0; i < n; i++) {
  const col = i % cols, row = Math.floor(i / cols);
  const x = qx + col * cell, y = qy - row * cell;
  const card = _rb.rect("Queue Job " + i, 58, 58, {
    fill: "#052E22", radius: 12, x: x, y: y, stroke: true, strokeColor: __o.accentColor, strokeWidth: 1
  });
  _rb.alpha(card, 60);
  _rb.text(String(i + 1), 14, { color: __o.accentColor, x: x, y: y, name: "Job Label " + i });
  const start = 8 + i * 3;
  _rb.kf(card, "scale.x", [[start, 1], [start + 16, 0.6]], "SlowOut");
  _rb.kf(card, "scale.y", [[start, 1], [start + 16, 0.6]], "SlowOut");
  _rb.fade(card, start + 8, 10, 100, 0, "SlowOut");
  if (i === 0) track("job", card);
}
const belt = _rb.line("Queue Belt", -160, 0, 120, 0, 3, __o.accentColor);
_rb.kf(belt, "scale.x", [[4, 0.001], [24, 1]], "SlowInSlowOut");
_rb.glow(belt, __o.accentColor, 12, 1.1);
const workerA = _rb.nodeCard("Worker A", "Worker A", 280, 90, 220, 100, { sub: "processing", iconColor: __o.accentColor });
const workerB = _rb.nodeCard("Worker B", "Worker B", 280, -90, 220, 100, { sub: "idle", iconColor: "#38BDF8" });
track("worker", workerA.card);
_rb.sonar("Worker A Pulse", 280, 90, 110, __o.accentColor, { count: 2, start: 10, gap: 30, duration: 28, width: 2, from: 50 });
_rb.sonar("Worker B Pulse", 280, -90, 110, "#38BDF8", { count: 2, start: 24, gap: 30, duration: 28, width: 2, from: 50 });
const counter = _rb.textRight(String(n) + " / " + n, 40, 520, 200, { color: "#F8FAFC" });
track("counter", counter);
_rb.counter(counter, { from: 0, to: n, suffix: " / " + n, start: 6, duration: 60, ease: "SlowInSlowOut", length: 1 });
`,
  },
  {
    id: "api_connector_plug",
    title: "API Connector Plug",
    category: "workflows_nodes",
    description: "An app block slides into an API socket, the link draws across, and a Connected badge pops with a sparkle.",
    params: {
      leftLabel: { type: "string", default: "Your app", description: "Client label" },
      rightLabel: { type: "string", default: "Cavalry API", description: "Service label" },
      accentColor: { type: "color", default: "#10B981", description: "Connector colour" },
    },
    code: `
const left = _rb.rect("Client Block", 300, 170, { fill: "#111827", radius: 20, x: -420, y: 0, stroke: true, strokeColor: "#334155", strokeWidth: 2 });
const leftLabel = _rb.text(__o.leftLabel, 22, { color: "#F8FAFC", x: -420, y: 0 });
const plug = _rb.rect("Plug", 56, 46, { fill: __o.accentColor, radius: 8, x: -254, y: 0 });
api.parent(plug, left);
api.parent(leftLabel, left);
track("client", left);
_rb.kf(left, "position.x", [[6, -580], [28, -420]], "SpringOut");
const right = _rb.rect("Service Block", 300, 170, { fill: "#111827", radius: 20, x: 420, y: 0, stroke: true, strokeColor: "#334155", strokeWidth: 2 });
_rb.text(__o.rightLabel, 22, { color: "#F8FAFC", x: 420, y: 0 });
const socket = _rb.rect("Socket", 34, 62, { fill: "#0B0F14", radius: 10, x: 258, y: 0, stroke: true, strokeColor: __o.accentColor, strokeWidth: 3 });
track("service", right);
const wire = _rb.line("Connector Wire", -226, 0, 242, 0, 5, __o.accentColor);
_rb.kf(wire, "scale.x", [[28, 0.001], [44, 1]], "SlowInSlowOut");
_rb.glow(wire, __o.accentColor, 18, 1.4);
track("wire", wire);
_rb.sonar("Plug Sonar", 0, 0, 120, __o.accentColor, { count: 2, start: 40, gap: 12, duration: 30, width: 2, from: 55 });
const spark = _rb.star("Plug Spark", 44, { fill: __o.accentColor, innerRadius: 11, points: 4, x: 0, y: 0 });
_rb.glow(spark, __o.accentColor, 22, 1.6);
_rb.pop(spark, 42, 18, { from: 0.001, ease: "SpringOut", fade: true, fadeFrom: 100, fadeTo: 0 });
const badge = _rb.badge("Connected Badge", "\u2713  Connected", 0, 160, { fill: __o.accentColor, color: "#04120C", fontSize: 15, height: 38 });
_rb.pop(badge.pill, 46, 18, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(badge.text, 46, 18, { from: 0.4, ease: "SpringOut", fade: false });
track("badge", badge.pill);
_rb.text("handshake complete", 12, { color: "#64748B", x: 0, y: -130 });
`,
  },
  {
    id: "approval_handoff",
    title: "Approval Handoff",
    category: "workflows_nodes",
    description: "A human approval card stamps Approved, then a packet hands off across the wire to provision the workspace.",
    params: {
      approver: { type: "string", default: "Maya Chen", description: "Approver name" },
      actionText: { type: "string", default: "Provision workspace", description: "Next action" },
      accentColor: { type: "color", default: "#10B981", description: "Approval accent" },
    },
    code: `
const card = _rb.rect("Approval Card", 320, 190, { fill: "#111827", radius: 20, x: -380, y: 0, stroke: true, strokeColor: "#334155", strokeWidth: 2 });
track("card", card);
_rb.avatar("Approver", 48, -480, 44, { fill: "#8B5CF6", initials: "MC", ring: false });
_rb.textLeft(__o.approver, 18, -444, 52, { color: "#F8FAFC" });
_rb.textLeft("requested approval", 12, -444, 30, { color: "#64748B" });
_rb.textLeft("Design system v3", 15, -480, -10, { color: "#CBD5E1" });
const approved = _rb.badge("Approved", "\u2713  Approved", -380, -62, { fill: __o.accentColor, color: "#04120C", fontSize: 13, height: 30 });
_rb.pop(approved.pill, 12, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(approved.text, 12, 16, { from: 0.4, ease: "SpringOut", fade: false });
track("approved", approved.pill);
const wire = _rb.line("Handoff Wire", -210, 0, 220, 0, 5, __o.accentColor);
_rb.kf(wire, "scale.x", [[22, 0.001], [42, 1]], "SlowInSlowOut");
_rb.glow(wire, __o.accentColor, 16, 1.3);
track("wire", wire);
const packet = _rb.dot("Handoff Packet", -210, 0, 16, __o.accentColor, { glow: 22, glowIntensity: 1.8 });
_rb.fade(packet, 42, 3, 0, 100, "SlowOut");
_rb.kf(packet, "position.x", [[42, -210], [60, 220]], "SlowInSlowOut");
_rb.fade(packet, 60, 6, 100, 0, "SlowOut");
const node = _rb.nodeCard("Action Node", "Automation", 380, 0, 300, 140, { sub: __o.actionText, iconColor: __o.accentColor, strokeColor: __o.accentColor });
_rb.pop(node.card, 58, 18, { from: 0.86, ease: "SpringOut", fade: false });
track("node", node.card);
const done = _rb.checkBadge("Handoff Check", 500, 58, 32, __o.accentColor, { glow: 14 });
_rb.pop(done.circle, 64, 16, { from: 0.001, ease: "SpringOut", fade: false });
_rb.pop(done.check, 64, 16, { from: 0.001, ease: "SpringOut", fade: false });
_rb.text("human in the loop", 12, { color: "#64748B", x: -380, y: -145 });
`,
  },
  {
    id: "workflow_run_success",
    title: "Workflow Run Success",
    category: "workflows_nodes",
    description: "Five pipeline steps light up in sequence, checks pop, the progress bar fills and confetti seals a successful run.",
    params: {
      steps: { type: "int", default: 5, description: "Pipeline steps (3-6)" },
      accentColor: { type: "color", default: "#10B981", description: "Success colour" },
    },
    code: `
const n = Math.max(3, Math.min(6, __o.steps || 5));
const names = ["Validate", "Build", "Test", "Deploy", "Verify", "Notify"];
const startX = -400, gapX = n > 1 ? 800 / (n - 1) : 0;
_rb.textLeft("WORKFLOW RUN", 12, -470, 250, { color: "#64748B" });
_rb.textRight("#2481", 12, 470, 256, { color: "#475569" });
for (let i = 0; i < n; i++) {
  const x = startX + i * gapX;
  const node = _rb.circle("Step Node " + i, 32, { fill: "#0F172A", alpha: 0, x: x, y: 50 });
  _rb.stroke(node, "#334155", 3, { capStyle: 1, trim: [0, 100] });
  const fill = _rb.circle("Step Fill " + i, 32, { fill: __o.accentColor, x: x, y: 50 });
  _rb.pop(fill, 4 + i * 10, 14, { from: 0.001, ease: "SpringOut", fade: false });
  _rb.text(String(i + 1), 18, { color: "#F8FAFC", x: x, y: 50, name: "Step Number " + i });
  _rb.text(names[i], 13, { color: "#64748B", x: x, y: -12, name: "Step Label " + i });
  if (i > 0) {
    const prev = startX + (i - 1) * gapX;
    const wire = _rb.line("Step Wire " + i, prev + 36, 50, x - 36, 50, 3, "#334155");
    _rb.kf(wire, "scale.x", [[i * 8 - 4, 0.001], [i * 8 + 8, 1]], "SlowInSlowOut");
  }
  const check = _rb.checkBadge("Step Check " + i, x + 26, 76, 24, __o.accentColor, { glow: 10 });
  _rb.pop(check.circle, 8 + i * 10, 14, { from: 0.001, ease: "SpringOut", fade: false });
  _rb.pop(check.check, 8 + i * 10, 14, { from: 0.001, ease: "SpringOut", fade: false });
  _rb.sonar("Step Pulse " + i, x, 50, 36, __o.accentColor, { count: 1, start: 4 + i * 10, gap: 1, duration: 26, width: 2, from: 60 });
  if (i === 0) track("node", node);
  if (i === n - 1) track("check", check.circle);
}
const bar = _rb.rect("Run Progress Track", 800, 12, { fill: "#1F2937", radius: 6, x: 0, y: -120 });
const fill = _rb.rect("Run Progress Fill", 800, 12, { fill: __o.accentColor, radius: 6, x: 0, y: -120 });
_rb.anchor(fill, -1, 0);
_rb.pos(fill, -400, -120);
_rb.kf(fill, "scale.x", [[0, 0.001], [70, 1]], "SlowInSlowOut");
_rb.glow(fill, __o.accentColor, 16, 1.4);
track("progress", fill);
const done = _rb.badge("Run Complete", "\u2713  Run completed", 0, -200, { fill: __o.accentColor, color: "#04120C", fontSize: 16, height: 42 });
_rb.pop(done.pill, 72, 18, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(done.text, 72, 18, { from: 0.4, ease: "SpringOut", fade: false });
track("done", done.pill);
_rb.confetti("Run Confetti", 0, 20, 26, [__o.accentColor, "#38BDF8", "#F59E0B", "#F472B6"], { start: 68, duration: 34, spread: 250 });
`,
  },
];
