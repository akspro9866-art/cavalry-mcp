import type { PresetDef } from "../types.js";

export const CAT07_COLLAB_PRESENCE: PresetDef[] = [
  {
    id: "multiplayer_cursors",
    title: "Multiplayer Cursors",
    category: "collab_presence",
    description: "Named pointers drift across the canvas on independent 2D noise lanes, each carrying its own colour tag.",
    params: {
      count: { type: "int", default: 4, description: "Number of cursors (1-8)" },
      labelPrefix: { type: "string", default: "Alex", description: "Name shown on the tag" },
      accentColor: { type: "color", default: "#8B5CF6", description: "First cursor colour" },
      amp: { type: "double", default: 120, description: "Drift amplitude in px" },
    },
    code: `
const n = Math.max(1, Math.min(8, __o.count || 4));
const amp = __o.amp || 120;
const palette = [__o.accentColor, "#38BDF8", "#F472B6", "#10B981", "#F59E0B", "#A78BFA", "#22D3EE", "#FB7185"];
const spots = [[-480, 210], [240, 300], [470, -120], [-230, -250], [320, 90], [-90, 140], [520, 210], [-470, -60]];
for (let i = 0; i < n; i++) {
  const p = spots[i % spots.length];
  const c = _rb.cursor("Cursor " + (i + 1), p[0], p[1], palette[i % palette.length], __o.labelPrefix + " " + (i + 1));
  const nx = _rb.layer("noise", "Drift X " + (i + 1), {
    "generator.minimum": p[0] - amp, "generator.maximum": p[0] + amp,
    "generator.timeScale": 0.28 + i * 0.05, "generator.frequency": 0.45 + i * 0.07, "generator.seed": 30 + i
  });
  api.connect(nx, "id", c.group, "position.x");
  const ny = _rb.layer("noise", "Drift Y " + (i + 1), {
    "generator.minimum": p[1] - amp * 0.7, "generator.maximum": p[1] + amp * 0.7,
    "generator.timeScale": 0.32 + i * 0.04, "generator.frequency": 0.5 + i * 0.05, "generator.seed": 60 + i
  });
  api.connect(ny, "id", c.group, "position.y");
  if (i === 0) { track("cursor", c.pointer); track("noiseX", nx); track("noiseY", ny); }
}
`,
  },
  {
    id: "avatar_presence_stack",
    title: "Avatar Presence Stack",
    category: "collab_presence",
    description: "Overlapping avatar rings pop in on a negative-gap line, capped with a +12 presence badge.",
    params: {
      count: { type: "int", default: 5, description: "Avatars in the stack (2-8)" },
      size: { type: "double", default: 72, description: "Avatar diameter" },
      ringColor: { type: "color", default: "#0B0C10", description: "Cut-out ring colour" },
    },
    code: `
const n = Math.max(2, Math.min(8, __o.count || 5));
const size = __o.size || 72;
const gap = size * 0.68;
const fills = ["#8B5CF6", "#38BDF8", "#F472B6", "#10B981", "#F59E0B", "#A78BFA", "#22D3EE", "#FB7185"];
const initials = ["AK", "MJ", "SR", "TC", "LP", "DN", "RW", "EY"];
const total = (n - 1) * gap;
for (let i = 0; i < n; i++) {
  const x = -total / 2 + i * gap;
  const a = _rb.avatar("Avatar " + (i + 1), size, x, 0, {
    fill: fills[i % fills.length], initials: initials[i % initials.length],
    ringColor: __o.ringColor, ringWidth: 4
  });
  _rb.pop(a.bg, i * 4, 20, { from: 0.4, ease: "SpringOut", fade: false });
  _rb.pop(a.label, i * 4, 20, { from: 0.4, ease: "SpringOut", fade: false });
  if (i === 0) track("avatar", a.bg);
}
const more = _rb.badge("More People", "+12", total / 2 + 76, 0, {
  fill: "#1E293B", color: "#94A3B8", height: 36, fontSize: 15, stroke: true, strokeColor: "#334155"
});
_rb.pop(more.pill, n * 4 + 8, 18, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(more.text, n * 4 + 8, 18, { from: 0.4, ease: "SpringOut", fade: false });
track("more", more.pill);
_rb.textLeft("12 teammates online", 16, -total / 2 - size / 2, -size * 0.86, { color: "#64748B" });
`,
  },
  {
    id: "live_comment_pin",
    title: "Live Comment Pin",
    category: "collab_presence",
    description: "A comment pin drops onto the canvas and opens a floating thread card with author, reply and resolve actions.",
    params: {
      author: { type: "string", default: "Maya Chen", description: "Comment author" },
      comment: { type: "string", default: "Agreed - the new flow feels much faster.", description: "Comment body" },
      pinColor: { type: "color", default: "#8B5CF6", description: "Pin and accent colour" },
    },
    code: `
const pinGroup = _rb.layer("null", "Comment Pin", { position: [-330, 180] });
const pin = _rb.circle("Pin Bubble", 34, { fill: __o.pinColor, x: -330, y: 180 });
api.parent(pin, pinGroup);
const dots = _rb.text("...", 30, { color: "#0B0C10", x: -330, y: 190, name: "Pin Dots" });
api.parent(dots, pinGroup);
const tail = _rb.poly("Pin Tail", 22, 3, { fill: __o.pinColor, x: -330, y: 138, rotation: 180 });
api.parent(tail, pinGroup);
_rb.kf(pinGroup, "position.y", [[0, 500], [24, 180]], "SpringOut");
_rb.kf(pinGroup, "scale.x", [[0, 0.4], [24, 1]], "SpringOut");
_rb.kf(pinGroup, "scale.y", [[0, 0.4], [24, 1]], "SpringOut");
track("pin", pin);

const card = _rb.rect("Thread Card", 540, 250, {
  fill: "#111827", radius: 20, x: 130, y: -10,
  stroke: true, strokeColor: "#334155", strokeWidth: 2
});
track("card", card);
_rb.kf(card, "scale.x", [[12, 0.72], [32, 1]], "SpringOut");
_rb.kf(card, "scale.y", [[12, 0.72], [32, 1]], "SpringOut");
_rb.fade(card, 12, 10, 0, 100, "SlowOut");
const av = _rb.avatar("Comment Author", 44, -90, 72, { fill: "#8B5CF6", initials: "MC", ring: false });
_rb.textLeft(__o.author, 18, -58, 80, { color: "#F8FAFC" });
_rb.textLeft("2 min ago", 12, -58, 60, { color: "#64748B" });
_rb.textLeft(__o.comment, 20, -110, 18, { color: "#CBD5E1" });
const reply = _rb.badge("Reply", "Reply", -70, -74, { fill: __o.pinColor, color: "#0B0C10", fontSize: 13, height: 30 });
const resolve = _rb.badge("Resolve", "Resolve", 10, -74, { fill: "#1E293B", color: "#94A3B8", fontSize: 13, height: 30, stroke: true, strokeColor: "#334155" });
_rb.pop(reply.pill, 34, 16, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(reply.text, 34, 16, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(resolve.pill, 38, 16, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(resolve.text, 38, 16, { from: 0.5, ease: "SpringOut", fade: false });
_rb.line("Pin Link", -296, 146, -140, 56, 2, "#334155");
`,
  },
  {
    id: "kanban_card_drag",
    title: "Kanban Card Drag",
    category: "collab_presence",
    description: "A task card lifts, tilts -3 degrees and glides from Backlog to Shipped, then snaps flat with a spring.",
    params: {
      cardTitle: { type: "string", default: "Ship billing v2", description: "Task title" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Card accent" },
    },
    code: `
const lanes = [
  { x: -380, title: "Backlog", count: "4" },
  { x: 0, title: "In progress", count: "2" },
  { x: 380, title: "Shipped", count: "6" }
];
for (let i = 0; i < lanes.length; i++) {
  const l = lanes[i];
  _rb.rect("Lane " + l.title, 300, 470, { fill: "#0D1117", radius: 20, x: l.x, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
  _rb.textLeft(l.title, 18, l.x - 130, 195, { color: "#94A3B8" });
  _rb.badge("Lane Count " + i, l.count, l.x + 118, 195, { fill: "#1E293B", color: "#64748B", fontSize: 12, height: 24 });
}
const ghost = _rb.rect("Drop Ghost", 260, 96, { fill: "#0B0C10", alpha: 0, radius: 14, x: -380, y: 40 });
_rb.stroke(ghost, __o.accentColor, 2, { dash: [7, 6], capStyle: 0, trim: [0, 100] });
_rb.fade(ghost, 12, 12, 0, 40, "SlowOut");
const drop = _rb.rect("Drop Glow", 280, 120, { fill: __o.accentColor, alpha: 14, radius: 18, x: 380, y: 40 });
_rb.opacity(drop, 0);
_rb.fade(drop, 40, 10, 0, 100, "SlowOut");
const card = _rb.rect("Task Card", 260, 96, {
  fill: "#111827", radius: 14, x: -380, y: 40,
  stroke: true, strokeColor: __o.accentColor, strokeWidth: 2
});
track("card", card);
_rb.glow(card, __o.accentColor, 18, 1.1);
_rb.textLeft(__o.cardTitle, 18, -480, 58, { color: "#F8FAFC" });
_rb.textLeft("Drag me", 12, -480, 26, { color: "#64748B" });
_rb.circle("Card Avatar", 12, { fill: "#38BDF8", x: -256, y: 62 });
_rb.kf(card, "scale.x", [[10, 1], [20, 1.08]], "SlowOut");
_rb.kf(card, "scale.y", [[10, 1], [20, 1.08]], "SlowOut");
_rb.kf(card, "rotation", [[10, 0], [20, -3], [48, -3], [62, 0]], "SpringOut");
_rb.kf(card, "position.x", [[15, -380], [48, 380]], "SlowInSlowOut");
_rb.kf(card, "position.y", [[15, 40], [32, 86], [48, 40]], "SlowInSlowOut");
_rb.kf(card, "scale.x", [[48, 1.08], [62, 1]], "SpringOut");
_rb.kf(card, "scale.y", [[48, 1.08], [62, 1]], "SpringOut");
_rb.fade(card, 0, 10, 0, 100, "SlowOut");
`,
  },
  {
    id: "mention_tag_popover",
    title: "Mention Tag Popover",
    category: "collab_presence",
    description: "Typing @team pops an autocomplete people menu anchored at its top edge, with staggered rows.",
    params: {
      handle: { type: "string", default: "@team", description: "Mention handle" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Mention highlight" },
    },
    code: `
const composer = _rb.rect("Composer", 780, 200, {
  fill: "#111827", radius: 22, x: 0, y: -120,
  stroke: true, strokeColor: "#334155", strokeWidth: 2
});
track("composer", composer);
_rb.textLeft("New comment", 14, -340, -58, { color: "#64748B" });
_rb.textLeft("Hey", 24, -340, -120, { color: "#E2E8F0" });
const tag = _rb.badge("Mention Tag", __o.handle, -247, -120, { fill: __o.accentColor, color: "#0B0C10", fontSize: 18, height: 34 });
_rb.textLeft("can you review the handoff?", 24, -194, -120, { color: "#E2E8F0" });
_rb.fade(tag.pill, 0, 8, 0, 100, "SlowOut");
_rb.fade(tag.text, 0, 8, 0, 100, "SlowOut");
track("tag", tag.pill);

const pop = _rb.rect("People Popover", 460, 268, {
  fill: "#0F172A", radius: 18, x: 120, y: 288,
  stroke: true, strokeColor: "#334155", strokeWidth: 2
});
_rb.anchor(pop, 0, -1);
_rb.kf(pop, "scale.x", [[8, 0.001], [26, 1]], "ExpoOut");
_rb.kf(pop, "scale.y", [[8, 0.001], [26, 1]], "ExpoOut");
track("popover", pop);
const people = ["Maya Chen", "Sam Rivera", "Noah Klug", "Team channel"];
for (let i = 0; i < people.length; i++) {
  const y = 232 - i * 54;
  const row = _rb.rect("People Row " + i, 420, 44, { fill: i === 0 ? __o.accentColor : "#111827", radius: 10, x: 120, y: y });
  if (i === 0) _rb.alpha(row, 45);
  const av = _rb.avatar("Person " + i, 32, 0, y, { fill: ["#8B5CF6", "#38BDF8", "#F472B6", "#10B981"][i], initials: people[i].slice(0, 1), ring: false });
  _rb.textLeft(people[i], 16, 28, y, { color: i === 0 ? "#F8FAFC" : "#CBD5E1" });
  _rb.fade(row, 20 + i * 3, 8, 0, 100, "SlowOut");
  _rb.fade(av.bg, 20 + i * 3, 8, 0, 100, "SlowOut");
  _rb.fade(av.label, 20 + i * 3, 8, 0, 100, "SlowOut");
}
_rb.textLeft("Press Enter to mention", 11, -50, 30, { color: "#475569" });
`,
  },
  {
    id: "reaction_emoji_burst",
    title: "Reaction Burst",
    category: "collab_presence",
    description: "A lively line of glowing reaction stars rises, sways and fades on a staggered linear duplicator.",
    params: {
      count: { type: "int", default: 14, description: "Reaction count (4-24)" },
      riseHeight: { type: "double", default: 360, description: "Rise distance in px" },
      color: { type: "color", default: "#F472B6", description: "Star colour" },
    },
    code: `
const n = Math.max(4, Math.min(24, __o.count || 14));
const star = _rb.star("Reaction Star", 26, { fill: __o.color, innerRadius: 7, points: 4, x: -330, y: -280 });
_rb.glow(star, __o.color, 16, 1.5);
const dup = _rb.dup(star, { name: "Reaction Burst", distribution: "linear", count: n, size: 660 });
_rb.stagger(dup, 3.5);
_rb.kf(star, "position.y", [[0, -280], [55, -280 + (__o.riseHeight || 360)]], "SlowInOut");
_rb.kf(star, "position.x", [[0, -330], [16, -372], [32, -296], [50, -338]], "SlowInOut");
_rb.kf(star, "rotation", [[0, 0], [28, 25], [55, -15]], "SlowInOut");
_rb.kf(star, "scale.x", [[0, 0.2], [14, 1.1], [26, 1]], "SpringOut");
_rb.kf(star, "scale.y", [[0, 0.2], [14, 1.1], [26, 1]], "SpringOut");
_rb.fade(star, 0, 10, 0, 100, "SlowOut");
_rb.fade(star, 42, 16, 100, 0, "SlowOut");
track("star", star);
track("burst", dup);
_rb.text("+1", 44, { color: "#F8FAFC", x: 0, y: 250, name: "Reaction Count" });
`,
  },
  {
    id: "shared_selection_box",
    title: "Shared Selection Box",
    category: "collab_presence",
    description: "A dashed marquee drags open from its top-left corner, then corner handles and a collaborator label pop in.",
    params: {
      width: { type: "double", default: 560, description: "Marquee width" },
      height: { type: "double", default: 320, description: "Marquee height" },
      color: { type: "color", default: "#8B5CF6", description: "Marquee colour" },
      userLabel: { type: "string", default: "Maya", description: "Collaborator label" },
    },
    code: `
const w = __o.width || 560, h = __o.height || 320;
const canvas = _rb.rect("Workspace Canvas", w + 260, h + 180, { fill: "#0B0F14", radius: 28, x: 0, y: 0, stroke: true, strokeColor: "#1B2431", strokeWidth: 2 });
_rb.fade(canvas, 0, 10, 0, 100, "SlowOut");
_rb.textLeft("landing-page.fig", 12, -w / 2 - 112, h / 2 + 62, { color: "#475569" });
const hero = _rb.rect("Canvas Hero", 300, 150, { fill: "#141C26", radius: 16, x: -76, y: 42 });
_rb.fade(hero, 2, 10, 0, 100, "SlowOut");
const accent = _rb.rect("Canvas Accent", 84, 84, { fill: __o.color, alpha: 30, radius: 20, x: -148, y: 60 });
_rb.fade(accent, 3, 10, 0, 100, "SlowOut");
const stat = _rb.rect("Canvas Stat", 150, 66, { fill: "#161F2B", radius: 14, x: 168, y: 78 });
_rb.fade(stat, 4, 10, 0, 100, "SlowOut");
const lineA = _rb.rect("Canvas Line A", 220, 12, { fill: "#334155", radius: 6, x: -76, y: -2 });
_rb.fade(lineA, 5, 10, 0, 100, "SlowOut");
const lineB = _rb.rect("Canvas Line B", 150, 10, { fill: "#27303F", radius: 5, x: -110, y: -34 });
_rb.fade(lineB, 6, 10, 0, 100, "SlowOut");
const btn = _rb.rect("Canvas Button", 110, 34, { fill: __o.color, radius: 8, x: -129, y: -84 });
_rb.fade(btn, 7, 10, 0, 100, "SlowOut");
const block = _rb.rect("Canvas Block", 110, 110, { fill: "#141C26", radius: 14, x: 152, y: -58 });
_rb.fade(block, 8, 10, 0, 100, "SlowOut");
const box = _rb.rect("Selection Box", w, h, { fill: "#0B0C10", alpha: 0, x: 0, y: 0 });
_rb.stroke(box, __o.color, 2, { dash: [10, 7], capStyle: 0, trim: [0, 100] });
_rb.anchor(box, -1, -1);
_rb.pos(box, -w / 2, h / 2);
_rb.kf(box, "scale.x", [[6, 0.001], [34, 1]], "ExpoOut");
_rb.kf(box, "scale.y", [[6, 0.001], [34, 1]], "ExpoOut");
track("box", box);
const hx = [-w / 2, w / 2, -w / 2, w / 2];
const hy = [h / 2, h / 2, -h / 2, -h / 2];
for (let i = 0; i < 4; i++) {
  const handle = _rb.rect("Handle " + (i + 1), 12, 12, { fill: "#F8FAFC", radius: 2, x: hx[i], y: hy[i], stroke: true, strokeColor: __o.color, strokeWidth: 2 });
  _rb.pop(handle, 32 + i * 2, 14, { from: 0.001, ease: "SpringOut", fade: false });
  if (i === 0) track("handle", handle);
}
const label = _rb.badge("Selection User", __o.userLabel, -w / 2 + 52, h / 2 + 28, { fill: __o.color, color: "#0B0C10", fontSize: 14, height: 30 });
_rb.pop(label.pill, 34, 16, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(label.text, 34, 16, { from: 0.5, ease: "SpringOut", fade: false });
track("label", label.pill);
_rb.textLeft("dragging selection", 12, -w / 2 + 110, h / 2 + 28, { color: "#64748B" });
`,
  },
  {
    id: "version_history_scrub",
    title: "Version History Scrub",
    category: "collab_presence",
    description: "A playhead scrubs a tick-marked timeline while the preview card swaps Draft, Review and Live states.",
    params: {
      ticks: { type: "int", default: 8, description: "Timeline tick count" },
      accentColor: { type: "color", default: "#10B981", description: "Live state colour" },
    },
    code: `
const n = Math.max(3, Math.min(16, __o.ticks || 8));
const trackBar = _rb.rect("History Track", 760, 6, { fill: "#1F2937", radius: 3, x: 0, y: -220 });
track("track", trackBar);
for (let i = 0; i < n; i++) {
  const x = -380 + (i / (n - 1)) * 760;
  _rb.rect("Tick " + i, 4, 18, { fill: "#334155", radius: 2, x: x, y: -220 });
}
_rb.textLeft("v1", 12, -390, -258, { color: "#475569" });
_rb.text("v2", 12, { color: "#475569", x: 0, y: -258 });
_rb.textRight("v3", 12, 392, -264, { color: "#475569" });

function buildState(i, title, stateColor, pillFill, border) {
  const card = _rb.rect("State Card " + i, 460, 220, { fill: "#111827", radius: 20, x: 0, y: 100, stroke: true, strokeColor: border, strokeWidth: 2 });
  const titleT = _rb.textLeft("Q3 Launch", 26, -200, 160, { color: "#F8FAFC", name: "State Title " + i });
  const sub = _rb.textLeft("Version " + (i + 1) + " of 3", 13, -200, 132, { color: "#64748B", name: "State Sub " + i });
  const pill = _rb.rect("State Pill " + i, 132, 34, { fill: pillFill, radius: 17, x: 130, y: 160 });
  const pillText = _rb.text(title, 14, { color: stateColor, x: 130, y: 160, name: "State Label " + i });
  const lineA = _rb.rect("State Line " + i + "a", 360, 10, { fill: "#1E293B", radius: 5, x: 0, y: 82 });
  const lineB = _rb.rect("State Line " + i + "b", 260, 10, { fill: "#1E293B", radius: 5, x: -50, y: 58 });
  return { card: card, ids: [card, titleT, sub, pill, pillText, lineA, lineB] };
}
function fadeState(ids, start, duration, from, to) {
  for (let i = 0; i < ids.length; i++) _rb.fade(ids[i], start, duration, from, to, "SlowOut");
}
const draft = buildState(0, "Draft", "#94A3B8", "#1E293B", "#334155");
const review = buildState(1, "In review", "#F59E0B", "#3B2A12", "#F59E0B");
const live = buildState(2, "Live", __o.accentColor, "#052E22", __o.accentColor);
track("card", live.card);
fadeState(draft.ids, 20, 6, 100, 0);
fadeState(review.ids, 0, 1, 0, 0);
fadeState(review.ids, 22, 5, 0, 100);
fadeState(review.ids, 40, 6, 100, 0);
fadeState(live.ids, 0, 1, 0, 0);
fadeState(live.ids, 42, 6, 0, 100);
const head = _rb.rect("Playhead", 8, 56, { fill: __o.accentColor, radius: 4, x: -380, y: -220 });
track("playhead", head);
_rb.glow(head, __o.accentColor, 16, 1.2);
_rb.kf(head, "position.x", [[4, -380], [60, 380]], "SlowInSlowOut");
`,
  },
  {
    id: "typing_indicator_dots",
    title: "Typing Indicator Dots",
    category: "collab_presence",
    description: "A chat bubble with three dots bouncing in a phase-offset loop, exactly like a live typing indicator.",
    params: {
      bubbleColor: { type: "color", default: "#1E293B", description: "Bubble fill" },
      dotColor: { type: "color", default: "#CBD5E1", description: "Dot colour" },
    },
    code: `
const bubble = _rb.rect("Typing Bubble", 280, 96, { fill: __o.bubbleColor, radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#334155", strokeWidth: 1 });
track("bubble", bubble);
const tail = _rb.poly("Bubble Tail", 26, 3, { fill: __o.bubbleColor, x: -112, y: -46, rotation: 200 });
_rb.pop(bubble, 0, 18, { from: 0.6, ease: "SpringOut", fade: false });
_rb.pop(tail, 0, 18, { from: 0.6, ease: "SpringOut", fade: false });
for (let i = 0; i < 3; i++) {
  const d = _rb.circle("Typing Dot " + (i + 1), 9, { fill: __o.dotColor, x: -56 + i * 56, y: 0 });
  const s = i * 5;
  _rb.kf(d, "position.y", [[s, 0], [s + 6, 16], [s + 12, 0], [s + 20, 0]], "SlowInOut");
  _rb.kf(d, "scale.x", [[s + 6, 1], [s + 9, 0.86], [s + 12, 1]], "SlowInOut");
  _rb.kf(d, "scale.y", [[s + 6, 1], [s + 9, 0.86], [s + 12, 1]], "SlowInOut");
  if (i === 0) track("dot", d);
}
_rb.textLeft("Alex is typing", 13, -320, 96, { color: "#64748B" });
`,
  },
  {
    id: "permission_share_modal",
    title: "Permission Share Modal",
    category: "collab_presence",
    description: "Share dialog with a public-link toggle that springs on and a Link Copied confirmation pill.",
    params: {
      urlText: { type: "string", default: "cavalry.app/s/q3-launch", description: "Share URL" },
      accentColor: { type: "color", default: "#10B981", description: "Active accent" },
    },
    code: `
const modal = _rb.modal("Share Modal", 680, 420, { fill: "#111827", radius: 24, strokeColor: "#334155", dim: 45 });
track("modal", modal.card);
_rb.textLeft("Share this workspace", 26, -300, 150, { color: "#F8FAFC" });
_rb.textLeft("Anyone with the link can view", 13, -300, 118, { color: "#64748B" });
_rb.badge("Close", "esc", 288, 150, { fill: "#1E293B", color: "#64748B", fontSize: 12, height: 28 });
const field = _rb.rect("URL Field", 600, 58, { fill: "#0B0F14", radius: 12, x: 0, y: 54, stroke: true, strokeColor: "#334155", strokeWidth: 1 });
_rb.textLeft(__o.urlText, 16, -282, 54, { color: "#94A3B8" });
const copy = _rb.badge("Copy", "Copy link", 232, 54, { fill: "#1E293B", color: "#E2E8F0", fontSize: 13, height: 34, stroke: true, strokeColor: "#334155" });
_rb.textLeft("Public link", 15, -300, -28, { color: "#E2E8F0" });
const toggle = _rb.toggle("Public Toggle", 220, -28, { onColor: __o.accentColor });
track("toggle", toggle.knob);
_rb.kf(toggle.knob, "position.x", [[18, 178], [34, 222]], "SpringOut");
_rb.fade(toggle.on, 18, 8, 0, 100, "SlowOut");
_rb.textLeft("Invite people", 15, -300, -98, { color: "#E2E8F0" });
const avs = ["#8B5CF6", "#38BDF8", "#F472B6"];
for (let i = 0; i < 3; i++) {
  _rb.avatar("Share Avatar " + i, 38, -238 + i * 34, -142, { fill: avs[i], initials: ["MC", "SR", "NK"][i], ringColor: "#111827", ringWidth: 3 });
}
_rb.badge("Add Person", "+ Add", 40, -142, { fill: "#1E293B", color: "#94A3B8", fontSize: 13, height: 30, stroke: true, strokeColor: "#334155" });
const copied = _rb.badge("Copied", "\u2713  Link Copied!", 0, -186, { fill: __o.accentColor, color: "#04120C", fontSize: 15, height: 36 });
track("copied", copied.pill);
_rb.pop(copied.pill, 42, 18, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(copied.text, 42, 18, { from: 0.4, ease: "SpringOut", fade: false });
_rb.glow(copied.pill, __o.accentColor, 18, 1.2);
_rb.pop(copy.pill, 30, 14, { from: 0.8, ease: "SpringOut", fade: false });
_rb.pop(copy.text, 30, 14, { from: 0.8, ease: "SpringOut", fade: false });
`,
  },
];
