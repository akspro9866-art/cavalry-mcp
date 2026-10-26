import type { PresetDef } from "../types.js";

export const CAT12_VOICE_AUDIO_VIDEO: PresetDef[] = [
  {
    id: "voice_waveform_listen",
    title: "Voice Waveform Listen",
    category: "voice_audio_video",
    description: "A mic orb pulses with sonar rings while a live waveform dances and the listen timer counts away.",
    params: {
      seconds: { type: "int", default: 15, description: "Listen window" },
      accentColor: { type: "color", default: "#38BDF8", description: "Wave colour" },
      micColor: { type: "color", default: "#8B5CF6", description: "Mic orb colour" },
    },
    code: `
const panel = _rb.rect("Listen Panel", 940, 520, { fill: "#0A0F15", radius: 28, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Voice input", 24, -430, 200, { color: "#F8FAFC" });
_rb.textLeft("Speak naturally - we will transcribe it", 12, -430, 170, { color: "#64748B" });
const mic = _rb.circle("Mic Orb", 58, { fill: __o.micColor, x: -330, y: 0 });
_rb.glow(mic, __o.micColor, 30, 1.4);
_rb.pop(mic, 4, 18, { from: 0.001, ease: "SpringOut" });
track("mic", mic);
_rb.rect("Mic Stem", 22, 38, { fill: "#0B0C10", radius: 11, x: -330, y: 8 });
_rb.rect("Mic Base", 4, 16, { fill: "#0B0C10", radius: 2, x: -330, y: -24 });
_rb.circle("Mic Base Dot", 9, { fill: "#0B0C10", x: -330, y: -36 });
_rb.sonar("Mic Sonar", -330, 0, 58, __o.micColor, { count: 3, start: 6, gap: 12, duration: 34, width: 2, from: 60 });
const wave = _rb.audioBars("Voice Wave", 90, -20, 700, 34, [__o.accentColor, "#60A5FA", "#A78BFA"], { maxHeight: 190, barWidth: 7, start: 4, stagger: 0.7, duration: 30, seed: 3 });
track("wave", wave[0]);
const label = _rb.badge("Listening Badge", "Listening", 90, 110, { fill: "#0F2433", color: __o.accentColor, fontSize: 13, height: 30, stroke: true, strokeColor: "#1E4A63" });
_rb.pop(label.pill, 10, 14, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(label.text, 10, 14, { from: 0.5, ease: "SpringOut", fade: false });
const dots = [];
for (let i = 0; i < 3; i++) {
  const d = _rb.dot("Listen Dot " + i, 146 + i * 16, 110, 7, __o.accentColor);
  _rb.kf(d, "opacity", [[14 + i * 4, 25], [22 + i * 4, 100], [30 + i * 4, 25]], "SlowInOut");
  dots.push(d);
}
const remaining = _rb.textRight("0:" + (__o.seconds < 10 ? "0" : "") + __o.seconds, 18, 430, 200, { color: "#F8FAFC" });
_rb.textRight("max length", 10, 430, 174, { color: "#475569" });
track("timer", remaining);
const preview = _rb.text("“Let us ship the new pricing page this week.”", 18, { color: "#94A3B8", x: 90, y: -140 });
_rb.fade(preview, 32, 12, 0, 100, "SlowOut");
_rb.text("Tap the mic again to stop", 11, { color: "#475569", x: 90, y: -176 });
_rb.textLeft("EN", 11, -430, -232, { color: "#475569" });
_rb.textRight("noise suppression on", 11, 430, -232, { color: "#475569" });
`,
  },
  {
    id: "transcription_stream",
    title: "Transcription Stream",
    category: "voice_audio_video",
    description: "A live transcript writes in line by line with a blinking caret, ending in a saved transcript badge.",
    params: {
      lines: { type: "int", default: 5, description: "Transcript lines (3-6)" },
      accentColor: { type: "color", default: "#10B981", description: "Saved colour" },
    },
    code: `
const n = Math.max(3, Math.min(6, __o.lines || 5));
const panel = _rb.rect("Transcript Panel", 900, 620, { fill: "#0B0F14", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Live transcript", 24, -410, 248, { color: "#F8FAFC" });
_rb.badge("Language Badge", "EN  -  auto", 350, 248, { fill: "#111827", color: "#94A3B8", fontSize: 11, height: 26, stroke: true, strokeColor: "#27303F" });
const rec = _rb.dot("Transcript Rec", -390, 246, 9, "#EF4444", { glow: 10 });
_rb.kf(rec, "opacity", [[0, 100], [12, 35], [24, 100], [36, 35], [48, 100]], "SlowInOut");
_rb.textLeft("recording", 10, -376, 232, { color: "#64748B" });
_rb.audioBars("Transcript Wave", 0, 176, 480, 26, ["#334155", __o.accentColor, "#334155"], { maxHeight: 64, barWidth: 5, start: 0, stagger: 0.5, duration: 24, seed: 2 });
const lines = [
  "Thanks for joining the design review today.",
  "We locked the new onboarding flow.",
  "Next step is the billing migration.",
  "Maya will share the motion spec by Friday.",
  "Anything else before we wrap?",
  "Great - I will send the recap."
];
for (let i = 0; i < n; i++) {
  const y = 100 - i * 48;
  const line = _rb.textLeft(lines[i], 22, -410, y, { color: i === n - 1 ? "#F8FAFC" : "#CBD5E1" });
  _rb.fade(line, 8 + i * 8, 14, 0, 100, "SlowOut");
  _rb.kfAt(line, "y", [[8 + i * 8, y - 14], [22 + i * 8, y]], "SlowOut");
  if (i === 0) track("line", line);
}
const caret = _rb.rect("Transcript Caret", 3, 26, { fill: __o.accentColor, x: -80, y: 100 - n * 48 + 12 });
_rb.kf(caret, "opacity", [[8 + n * 8, 100], [14 + n * 8, 0], [20 + n * 8, 100], [26 + n * 8, 0]], "SlowInOut");
_rb.textLeft((n * 9 + 4) + " words", 12, -410, -262, { color: "#475569" });
const saved = _rb.badge("Saved Badge", "\\u2713  Transcript saved", 0, -262, { fill: "#052E22", color: __o.accentColor, fontSize: 13, height: 32, stroke: true, strokeColor: "#065F46" });
_rb.pop(saved.pill, 12 + n * 8, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(saved.text, 12 + n * 8, 16, { from: 0.4, ease: "SpringOut", fade: false });
track("saved", saved.pill);
_rb.textRight("speaker 1  -  98% confidence", 11, 410, -262, { color: "#475569" });
`,
  },
  {
    id: "audio_player_widget",
    title: "Audio Player Widget",
    category: "voice_audio_video",
    description: "A music player card springs in with abstract cover art, a pulsing play control and a progress bar that fills.",
    params: {
      trackTitle: { type: "string", default: "Midnight Drive", description: "Track title" },
      artist: { type: "string", default: "Neon Coast", description: "Artist name" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Accent colour" },
    },
    code: `
const card = _rb.rect("Player Card", 860, 320, { fill: "#101520", radius: 28, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 22, { from: 0.9, ease: "SpringOut", fade: false });
_rb.glow(card, __o.accentColor, 34, 0.35);
track("card", card);
const art = _rb.rect("Album Art", 210, 210, { fill: "#171126", radius: 20, x: -290, y: 0 });
_rb.pop(art, 6, 20, { from: 0.8, ease: "SpringOut", fade: false });
_rb.circle("Art Halo", 86, { fill: __o.accentColor, alpha: 35, x: -320, y: 30 });
_rb.circle("Art Halo B", 52, { fill: "#F472B6", alpha: 28, x: -250, y: -40 });
_rb.circle("Art Core", 20, { fill: "#F8FAFC", alpha: 80, x: -290, y: 0 });
_rb.sonar("Art Ring", -290, 0, 88, __o.accentColor, { count: 2, start: 8, gap: 12, duration: 38, width: 2, from: 40 });
_rb.textLeft("NOW PLAYING", 11, -160, 108, { color: __o.accentColor });
_rb.textLeft(__o.trackTitle, 30, -162, 72, { color: "#F8FAFC" });
_rb.textLeft(__o.artist, 15, -162, 38, { color: "#94A3B8" });
_rb.textLeft("Neon Nights  -  2026", 11, -162, 14, { color: "#475569" });
const play = _rb.circle("Play Button", 34, { fill: __o.accentColor, x: 344, y: 62 });
_rb.poly("Play Triangle", 26, 3, { fill: "#0B0C10", x: 348, y: 62, rotation: -90 });
_rb.pop(play, 12, 16, { from: 0.001, ease: "SpringOut" });
_rb.glow(play, __o.accentColor, 20, 1.2);
track("play", play);
_rb.sonar("Play Sonar", 344, 62, 34, __o.accentColor, { count: 2, start: 18, gap: 8, duration: 26, width: 2, from: 60 });
const progress = _rb.progress("Track Progress", 540, 8, { x: 98, y: -62, pct: 0.62, start: 8, duration: 60, color: __o.accentColor, trackColor: "#1F2937" });
track("progress", progress.fill);
_rb.textLeft("1:24", 10, -162, -88, { color: "#64748B" });
_rb.textRight("3:42", 10, 358, -88, { color: "#64748B" });
_rb.text("previous", 11, { color: "#475569", x: 270, y: 62 });
_rb.text("next", 11, { color: "#475569", x: 408, y: 62 });
_rb.textRight("320 kbps", 10, 380, 116, { color: "#475569" });
`,
  },
  {
    id: "podcast_episode_card",
    title: "Podcast Episode Card",
    category: "voice_audio_video",
    description: "An episode card assembles with cover art, guest details, a play pill and a reacting waveform strip.",
    params: {
      episode: { type: "int", default: 42, description: "Episode number" },
      guest: { type: "string", default: "Maya Chen", description: "Guest name" },
      accentColor: { type: "color", default: "#F59E0B", description: "Cover accent" },
    },
    code: `
const card = _rb.rect("Episode Card", 880, 480, { fill: "#10141B", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 22, { from: 0.92, ease: "SpringOut", fade: false });
track("card", card);
const cover = _rb.rect("Episode Cover", 240, 240, { fill: "#1A1208", radius: 22, x: -290, y: 20 });
_rb.pop(cover, 4, 20, { from: 0.8, ease: "SpringOut", fade: false });
_rb.circle("Cover Sun", 92, { fill: __o.accentColor, alpha: 30, x: -290, y: 60 });
_rb.text("EP", 30, { color: __o.accentColor, x: -290, y: 56 });
_rb.text("42", 84, { color: "#F8FAFC", x: -290, y: 0 });
_rb.text("THE SHIPPING ROOM", 9, { color: "#64748B", x: -290, y: -80 });
const badge = _rb.badge("Episode Badge", "NEW EPISODE", -100, 172, { fill: "#2A1D08", color: __o.accentColor, fontSize: 10, height: 24, stroke: true, strokeColor: "#4A3510" });
_rb.pop(badge.pill, 8, 14, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(badge.text, 8, 14, { from: 0.5, ease: "SpringOut", fade: false });
_rb.textLeft("Designing calm software", 30, -140, 120, { color: "#F8FAFC" });
_rb.textLeft("with " + __o.guest + "  -  Head of Design", 13, -140, 88, { color: "#94A3B8" });
_rb.textLeft("Why fewer notifications, slower defaults and honest", 12, -140, 44, { color: "#64748B" });
_rb.textLeft("empty states make products feel trustworthy.", 12, -140, 22, { color: "#64748B" });
const play = _rb.rect("Episode Play", 220, 50, { fill: __o.accentColor, radius: 14, x: 40, y: -40 });
_rb.text("Play episode", 15, { color: "#1A1208", x: 40, y: -40 });
_rb.pop(play, 16, 16, { from: 0.8, ease: "SpringOut", fade: false });
_rb.glow(play, __o.accentColor, 18, 1.0);
track("play", play);
const sub = _rb.rect("Episode Subscribe", 220, 50, { fill: "#0B0F14", radius: 14, x: 280, y: -40, stroke: true, strokeColor: "#334155", strokeWidth: 1 });
_rb.text("Subscribe", 15, { color: "#CBD5E1", x: 280, y: -40 });
_rb.pop(sub, 20, 16, { from: 0.85, ease: "SpringOut", fade: false });
const wave = _rb.audioBars("Episode Wave", 110, -130, 420, 30, [__o.accentColor, "#FBBF24", "#78350F"], { maxHeight: 80, barWidth: 5, start: 12, stagger: 0.6, duration: 26, seed: 1 });
track("wave", wave[0]);
_rb.textLeft("42:18", 11, -140, -186, { color: "#64748B" });
_rb.textRight("Season 3  -  Episode 42", 11, 380, -186, { color: "#475569" });
`,
  },
  {
    id: "video_call_grid",
    title: "Video Call Grid",
    category: "voice_audio_video",
    description: "A four-up video call pops in, the active speaker glows and the control bar with a red end-call button lands.",
    params: {
      meeting: { type: "string", default: "Design sync", description: "Meeting title" },
      accentColor: { type: "color", default: "#10B981", description: "Speaking colour" },
    },
    code: `
const panel = _rb.rect("Call Panel", 960, 680, { fill: "#0A0F15", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft(__o.meeting, 22, -440, 302, { color: "#F8FAFC" });
_rb.textLeft("4 participants", 11, -440, 274, { color: "#64748B" });
const rec = _rb.dot("Call Live", 360, 300, 9, "#EF4444", { glow: 10 });
_rb.kf(rec, "opacity", [[0, 100], [14, 35], [28, 100], [42, 35], [56, 100]], "SlowInOut");
_rb.textRight("04:32", 16, 440, 300, { color: "#F8FAFC" });
const people = [
  { x: -200, y: 120, name: "Maya Chen", initials: "MC", colour: "#F472B6", speaking: true },
  { x: 200, y: 120, name: "Alex Rivera", initials: "AR", colour: "#8B5CF6", speaking: false },
  { x: -200, y: -110, name: "Priya Shah", initials: "PS", colour: "#38BDF8", speaking: false },
  { x: 200, y: -110, name: "Sam Okafor", initials: "SO", colour: "#FBBF24", speaking: false }
];
for (let i = 0; i < people.length; i++) {
  const p = people[i];
  const tile = _rb.rect("Call Tile " + i, 370, 210, { fill: "#111827", radius: 18, x: p.x, y: p.y, stroke: true, strokeColor: p.speaking ? __o.accentColor : "#27303F", strokeWidth: p.speaking ? 3 : 1 });
  _rb.pop(tile, 2 + i * 5, 18, { from: 0.86, ease: "SpringOut", fade: false });
  const av = _rb.avatar("Call Avatar " + i, 78, p.x, p.y + 8, { fill: p.colour, initials: p.initials, ring: false });
  _rb.text(p.name, 14, { color: "#E2E8F0", x: p.x - 30, y: p.y - 74 });
  const namePill = _rb.pill("Call Name Pill " + i, 148, 28, { fill: "#0B0F14", radius: 8, x: p.x - 52, y: p.y - 74, alpha: 75 });
  const nameText = _rb.text(p.name, 12, { color: "#E2E8F0", x: p.x - 52, y: p.y - 74 });
  if (p.speaking) {
    _rb.sonar("Speaker Sonar", p.x, p.y + 8, 46, __o.accentColor, { count: 2, start: 8, gap: 10, duration: 34, width: 2, from: 60 });
    const speak = _rb.badge("Speaking", "speaking", p.x, p.y + 74, { fill: "#052E22", color: __o.accentColor, fontSize: 10, height: 22 });
    _rb.pop(speak.pill, 14, 12, { from: 0.4, ease: "SpringOut", fade: false });
    _rb.fade(speak.text, 14, 12, 0, 100, "SlowOut");
    track("speaker", tile);
  }
  if (i === 1) {
    _rb.circle("Muted BG", 13, { fill: "#2A1218", x: p.x + 150, y: p.y + 78 });
    _rb.line("Muted Mic", p.x + 146, p.y + 84, p.x + 154, p.y + 72, 2, "#EF4444");
    _rb.line("Muted Mic B", p.x + 154, p.y + 84, p.x + 146, p.y + 72, 2, "#EF4444");
  }
}
const controls = [
  { x: -150, label: "Mic", fill: "#111827", colour: "#CBD5E1" },
  { x: -50, label: "Cam", fill: "#111827", colour: "#CBD5E1" },
  { x: 50, label: "Share", fill: "#111827", colour: "#CBD5E1" },
  { x: 150, label: "End", fill: "#EF4444", colour: "#1A0608" }
];
for (let i = 0; i < controls.length; i++) {
  const c = controls[i];
  const btn = _rb.circle("Call Control " + i, 27, { fill: c.fill, x: c.x, y: -252 });
  _rb.text(c.label, 10, { color: c.colour, x: c.x, y: -252 });
  _rb.pop(btn, 24 + i * 3, 14, { from: 0.001, ease: "SpringOut" });
  if (i === 3) { _rb.glow(btn, "#EF4444", 16, 1.2); track("end", btn); }
}
_rb.textLeft("encrypted  -  end to end", 11, -440, -300, { color: "#475569" });
_rb.textRight("grid view", 11, 440, -300, { color: "#475569" });
`,
  },
  {
    id: "screen_share_focus",
    title: "Screen Share Focus",
    category: "voice_audio_video",
    description: "A shared screen grows to center stage while participant thumbnails shrink aside and a presenting badge announces it.",
    params: {
      shareTitle: { type: "string", default: "Q3 roadmap", description: "Shared content title" },
      accentColor: { type: "color", default: "#10B981", description: "Presenting colour" },
    },
    code: `
const panel = _rb.rect("Share Panel", 960, 640, { fill: "#0A0F15", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Presenting", 22, -440, 282, { color: "#F8FAFC" });
const shareBadge = _rb.badge("Sharing Badge", "You are presenting", 250, 282, { fill: "#052E22", color: __o.accentColor, fontSize: 11, height: 26, stroke: true, strokeColor: "#065F46" });
_rb.pop(shareBadge.pill, 6, 14, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(shareBadge.text, 6, 14, { from: 0.4, ease: "SpringOut", fade: false });
const frame = _rb.browserFrame("Shared Screen", 620, 400, -130, 10, { fill: "#0B0F14", barColor: "#111827", strokeColor: "#1E3A33" });
_rb.pop(frame.frame, 0, 20, { from: 0.82, ease: "SpringOut", fade: false });
_rb.glow(frame.frame, __o.accentColor, 24, 0.5);
track("screen", frame.frame);
_rb.textLeft("cavalry.app/roadmap/q3", 10, -220, 191, { color: "#475569" });
_rb.text(__o.shareTitle, 40, { color: "#F8FAFC", x: -300, y: 60 });
_rb.text("Three bets for the quarter", 14, { color: "#64748B", x: -300, y: 20 });
const miniCards = [
  { x: -430, label: "Templates" },
  { x: -300, label: "Motion" },
  { x: -170, label: "Marketplace" }
];
for (let i = 0; i < miniCards.length; i++) {
  const y = -80;
  const c = _rb.rect("Share Mini Card " + i, 116, 108, { fill: "#111827", radius: 12, x: miniCards[i].x + 70, y: y, stroke: true, strokeColor: "#27303F", strokeWidth: 1 });
  _rb.dot("Share Mini Dot " + i, miniCards[i].x + 32, y + 26, 8, [__o.accentColor, "#38BDF8", "#F472B6"][i]);
  _rb.text(miniCards[i].label, 11, { color: "#CBD5E1", x: miniCards[i].x + 70, y: y - 20 });
  _rb.pop(c, 16 + i * 4, 14, { from: 0.8, ease: "SpringOut", fade: false });
  if (i === 0) track("miniCard", c);
}
const thumbs = [
  { y: 150, name: "Maya", initials: "MC", colour: "#F472B6" },
  { y: 10, name: "Alex", initials: "AR", colour: "#8B5CF6" },
  { y: -130, name: "Priya", initials: "PS", colour: "#38BDF8" }
];
for (let i = 0; i < thumbs.length; i++) {
  const t = thumbs[i];
  const tile = _rb.rect("Share Thumb " + i, 180, 112, { fill: "#111827", radius: 14, x: 370, y: t.y, stroke: true, strokeColor: "#27303F", strokeWidth: 1 });
  _rb.avatar("Share Avatar " + i, 46, 370, t.y + 8, { fill: t.colour, initials: t.initials, ring: false });
  _rb.text(t.name, 10, { color: "#94A3B8", x: 370, y: t.y - 34 });
  _rb.pop(tile, 8 + i * 4, 16, { from: 0.85, ease: "SpringOut", fade: false });
  _rb.kf(tile, "scale.x", [[26, 1], [40, 0.86]], "SlowInOut");
  _rb.kf(tile, "scale.y", [[26, 1], [40, 0.86]], "SlowInOut");
  if (i === 0) track("thumb", tile);
}
const stop = _rb.rect("Stop Share", 220, 48, { fill: "#2A1218", radius: 13, x: 0, y: -280, stroke: true, strokeColor: "#5B1F28", strokeWidth: 1 });
_rb.text("Stop sharing", 14, { color: "#FCA5A5", x: 0, y: -280 });
_rb.pop(stop, 32, 16, { from: 0.85, ease: "SpringOut", fade: false });
_rb.textLeft("share quality  -  1080p", 11, -440, -300, { color: "#475569" });
_rb.textRight("low latency", 11, 440, -300, { color: "#475569" });
`,
  },
  {
    id: "live_stream_badge",
    title: "Live Stream Badge",
    category: "voice_audio_video",
    description: "A live stream frame frames a pulsing LIVE badge while viewers count up and chat messages land on the right.",
    params: {
      viewers: { type: "int", default: 1284, description: "Viewer count" },
      accentColor: { type: "color", default: "#EF4444", description: "Live colour" },
    },
    code: `
const panel = _rb.rect("Stream Panel", 940, 560, { fill: "#0A0F15", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
const screen = _rb.rect("Stream Frame", 520, 320, { fill: "#111827", radius: 20, x: -190, y: 20, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(screen, 0, 20, { from: 0.88, ease: "SpringOut", fade: false });
track("frame", screen);
_rb.circle("Stream Halo A", 130, { fill: __o.accentColor, alpha: 16, x: -330, y: 100 });
_rb.circle("Stream Halo B", 90, { fill: "#8B5CF6", alpha: 20, x: 40, y: -40 });
_rb.text("LIVE", 84, { color: "#1A0608", x: -190, y: 20 });
const liveBadge = _rb.badge("Live Badge", "LIVE", -405, 186, { fill: __o.accentColor, color: "#1A0608", fontSize: 11, height: 24 });
_rb.pop(liveBadge.pill, 4, 12, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(liveBadge.text, 4, 12, { from: 0.4, ease: "SpringOut", fade: false });
_rb.kf(liveBadge.pill, "scale.x", [[8, 1], [14, 1.12], [20, 1], [26, 1.12], [32, 1]], "SlowInOut");
_rb.kf(liveBadge.pill, "scale.y", [[8, 1], [14, 1.12], [20, 1], [26, 1.12], [32, 1]], "SlowInOut");
track("live", liveBadge.pill);
const viewers = _rb.textRight("0", 18, 420, 186, { color: "#F8FAFC" });
_rb.counter(viewers, { from: 0, to: __o.viewers, suffix: " watching", start: 8, duration: 30, ease: "SlowOut", length: 1, delimiter: "," });
_rb.textRight("Design systems weekly", 10, 420, 160, { color: "#64748B" });
const feed = _rb.rect("Chat Feed", 300, 300, { fill: "#0F141B", radius: 18, x: 270, y: 20, stroke: true, strokeColor: "#1F2937", strokeWidth: 1 });
_rb.textLeft("Live chat", 13, 150, 154, { color: "#E2E8F0" });
const messages = [
  { name: "Maya", text: "this transition is so clean", colour: "#F472B6" },
  { name: "Alex", text: "what easing is that?", colour: "#8B5CF6" },
  { name: "Priya", text: "the badges pop perfectly", colour: "#38BDF8" },
  { name: "Sam", text: "shipping this today", colour: "#FBBF24" }
];
for (let i = 0; i < messages.length; i++) {
  const y = 108 - i * 62;
  const bubble = _rb.rect("Chat Bubble " + i, 260, 50, { fill: i % 2 === 0 ? "#151D2A" : "#111827", radius: 12, x: 270, y: y });
  _rb.circle("Chat Dot " + i, 8, { fill: messages[i].colour, x: 158, y: y + 12 });
  _rb.textLeft(messages[i].name, 10, 174, y + 14, { color: messages[i].colour });
  _rb.textLeft(messages[i].text, 10, 174, y - 8, { color: "#94A3B8" });
  _rb.fade(bubble, 14 + i * 7, 10, 0, 100, "SlowOut");
  _rb.kf(bubble, "position.y", [[14 + i * 7, y - 18], [24 + i * 7, y]], "SlowOut");
  if (i === 0) track("message", bubble);
}
_rb.sonar("Live Sonar", -405, 186, 18, __o.accentColor, { count: 2, start: 10, gap: 10, duration: 26, width: 2, from: 70 });
_rb.textLeft("1080p  -  low latency", 11, -440, -248, { color: "#475569" });
_rb.textRight("share", 11, 420, -248, { color: "#475569" });
`,
  },
  {
    id: "voice_note_bubble",
    title: "Voice Note Bubble",
    category: "voice_audio_video",
    description: "A voice note bubble slides in with a play control and waveform, then a reply types back and lands.",
    params: {
      duration: { type: "string", default: "0:18", description: "Voice note length" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Own bubble colour" },
    },
    code: `
const panel = _rb.rect("Chat Panel", 820, 540, { fill: "#0B0F14", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Maya Chen", 16, -380, 236, { color: "#F8FAFC" });
_rb.textLeft("online", 10, -380, 212, { color: "#10B981" });
const out = _rb.chatBubble("Voice Bubble", 440, 112, 120, 130, { fill: __o.accentColor, radius: 20, tail: false });
_rb.pop(out.bubble, 2, 18, { from: 0.86, ease: "SpringOut", fade: false });
track("bubble", out.bubble);
const play = _rb.circle("Voice Play", 22, { fill: "#0B0C10", x: -60, y: 130 });
_rb.poly("Voice Play Triangle", 16, 3, { fill: __o.accentColor, x: -57, y: 130, rotation: -90 });
_rb.pop(play, 10, 14, { from: 0.001, ease: "SpringOut" });
_rb.audioBars("Voice Bars", 140, 110, 260, 24, ["#F8FAFC", "#E9D5FF", "#C4B5FD"], { maxHeight: 54, barWidth: 4, start: 10, stagger: 0.5, duration: 22, seed: 2 });
_rb.textRight(__o.duration, 10, 320, 112, { color: "#E9D5FF" });
_rb.textRight("delivered", 9, 320, 96, { color: "#C4B5FD" });
const outTime = _rb.textRight("2:14 PM", 9, 320, 78, { color: "#A78BFA" });
const replyBubble = _rb.chatBubble("Reply Bubble", 380, 86, -150, -20, { fill: "#1E293B", radius: 20, tail: true });
_rb.pop(replyBubble.bubble, 30, 16, { from: 0.86, ease: "SpringOut" });
_rb.pop(replyBubble.tail, 30, 16, { from: 0.86, ease: "SpringOut" });
const typing = [];
for (let i = 0; i < 3; i++) {
  const dot = _rb.dot("Typing Dot " + i, -300 + i * 22, -20, 8, "#94A3B8");
  _rb.kf(dot, "position.y", [[12 + i * 3, -26], [18 + i * 3, -14], [24 + i * 3, -26]], "SlowInOut");
  _rb.fade(dot, 12, 4, 0, 100, "SlowOut");
  _rb.fade(dot, 30, 6, 100, 0, "SlowOut");
  typing.push(dot);
}
const reply = _rb.textLeft("Sounds great - shipping it today.", 14, -310, -20, { color: "#E2E8F0" });
_rb.fade(reply, 32, 10, 0, 100, "SlowOut");
_rb.textLeft("2:16 PM", 9, -310, -56, { color: "#64748B" });
track("reply", reply);
const mic = _rb.circle("Record Button", 34, { fill: __o.accentColor, x: 0, y: -200 });
_rb.rect("Record Mic", 12, 22, { fill: "#0B0C10", radius: 6, x: 0, y: -194 });
_rb.rect("Record Stem", 3, 10, { fill: "#0B0C10", x: 0, y: -214 });
_rb.pop(mic, 36, 16, { from: 0.001, ease: "SpringOut" });
_rb.glow(mic, __o.accentColor, 18, 1.1);
_rb.sonar("Record Sonar", 0, -200, 34, __o.accentColor, { count: 2, start: 40, gap: 10, duration: 26, width: 2, from: 60 });
_rb.text("Hold to record", 10, { color: "#64748B", x: 0, y: -248 });
`,
  },
  {
    id: "sound_equalizer_bars",
    title: "Sound Equalizer Bars",
    category: "voice_audio_video",
    description: "A wide spectrum equalizer pulses with preset pills, a volume slider and frequency markers.",
    params: {
      preset: { type: "string", default: "Bass Boost", description: "Selected preset" },
      accentColor: { type: "color", default: "#38BDF8", description: "Bar colour" },
    },
    code: `
const panel = _rb.rect("EQ Panel", 960, 580, { fill: "#0A0F15", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Equalizer", 22, -440, 244, { color: "#F8FAFC" });
_rb.textLeft("Real-time spectrum  -  stereo", 12, -440, 216, { color: "#64748B" });
const presets = ["Flat", __o.preset, "Vocal", "Late Night"];
for (let i = 0; i < presets.length; i++) {
  const x = -60 + i * 130;
  const active = i === 1;
  const pill = _rb.pill("EQ Preset " + i, 116, 32, {
    fill: active ? "#0F2433" : "#111827", radius: 16, x: x, y: 238,
    stroke: true, strokeColor: active ? __o.accentColor : "#27303F", strokeWidth: 1
  });
  _rb.text(presets[i], 11, { color: active ? __o.accentColor : "#64748B", x: x, y: 238 });
  _rb.pop(pill, 4 + i * 4, 12, { from: 0.7, ease: "SpringOut", fade: false });
  if (active) track("presetPill", pill);
}
const baseline = _rb.line("EQ Baseline", -440, -60, 440, -60, 2, "#1F2937");
_rb.opacity(baseline, 60);
const bars = _rb.audioBars("EQ Bars", 0, -60, 860, 34, [__o.accentColor, "#60A5FA", "#8B5CF6", "#A78BFA"], {
  maxHeight: 280, barWidth: 8, start: 4, stagger: 0.35, duration: 34, seed: 1
});
track("bars", bars[0]);
for (let i = 0; i < 5; i++) {
  _rb.text(["60", "250", "1k", "4k", "16k"][i], 9, { color: "#475569", x: -420 + i * 210, y: -94 });
}
const volume = _rb.progress("Volume Slider", 420, 8, { x: 0, y: -220, pct: 0.7, start: 12, duration: 30, color: __o.accentColor, trackColor: "#1F2937" });
_rb.textLeft("VOLUME", 9, -430, -220, { color: "#475569" });
_rb.textRight("70%", 10, 340, -220, { color: "#94A3B8" });
track("volume", volume.fill);
_rb.textLeft("44.1 kHz  -  24-bit  -  stereo", 11, -440, -274, { color: "#475569" });
_rb.textRight("preamp  -6 dB", 11, 440, -274, { color: "#475569" });
`,
  },
  {
    id: "subtitle_caption_roller",
    title: "Subtitle Caption Roller",
    category: "voice_audio_video",
    description: "A cinematic frame settles as lower-third caption words roll in one by one with the key word highlighted.",
    params: {
      sentence: { type: "string", default: "Design is how it works, not just how it looks", description: "Caption sentence" },
      speaker: { type: "string", default: "Maya Chen  -  Design Lead", description: "Speaker credit" },
      accentColor: { type: "color", default: "#FBBF24", description: "Highlight colour" },
    },
    code: `
const panel = _rb.rect("Caption Panel", 960, 620, { fill: "#070B10", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
const frame = _rb.rect("Caption Frame", 900, 500, { fill: "#0D1117", radius: 18, x: 0, y: 20, stroke: true, strokeColor: "#1B2330", strokeWidth: 1 });
_rb.pop(frame, 0, 20, { from: 0.9, ease: "SpringOut", fade: false });
_rb.circle("Scene Halo A", 200, { fill: "#1E293B", alpha: 55, x: -300, y: 130 });
_rb.circle("Scene Halo B", 240, { fill: "#111827", alpha: 80, x: 260, y: -40 });
const giant = _rb.text("CALM", 150, { color: "#151D2A", x: -260, y: 10 });
_rb.kfAt(giant, "x", [[4, -300], [38, -260]], "SlowOut");
_rb.fade(giant, 4, 20, 0, 100, "SlowOut");
_rb.badge("Caption Live", "REC", -400, 236, { fill: "#2A1218", color: "#FCA5A5", fontSize: 10, height: 22 });
_rb.textRight("00:42:18", 10, 420, 236, { color: "#64748B" });
_rb.textLeft(__o.speaker, 11, -420, -128, { color: "#94A3B8" });
const bar = _rb.rect("Caption Bar", 820, 84, { fill: "#05080C", radius: 12, x: 0, y: -200, alpha: 85 });
_rb.pop(bar, 8, 16, { from: 0.8, ease: "SpringOut", fade: false });
track("captionBar", bar);
const words = String(__o.sentence).split(" ");
const size = 24;
let total = 0;
for (let i = 0; i < words.length; i++) total += words[i].length * size * 0.55 + (i ? 10 : 0);
let cursor = -total / 2;
for (let i = 0; i < words.length; i++) {
  const w = words[i];
  const active = i === 4;
  const word = _rb.textLeft(w, size, cursor, -200, { color: active ? __o.accentColor : "#F8FAFC" });
  _rb.fade(word, 18 + i * 3, 9, 0, 100, "SlowOut");
  _rb.kfAt(word, "y", [[18 + i * 3, -212], [26 + i * 3, -200]], "SlowOut");
  if (active) {
    _rb.glow(word, __o.accentColor, 14, 1.1);
    track("keyword", word);
  }
  cursor += w.length * size * 0.55 + 10;
}
_rb.text("CC", 11, { color: "#94A3B8", x: 384, y: -260 });
_rb.textRight("auto-generated", 10, 420, -286, { color: "#475569" });
_rb.textLeft("captions on", 10, -420, -286, { color: "#475569" });
`,
  },
];
