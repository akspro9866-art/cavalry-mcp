import type { PresetDef } from "../types.js";

export const CAT14_SOCIAL_PROOF_CTA: PresetDef[] = [
  {
    id: "logo_cloud",
    title: "Logo Cloud",
    category: "social_proof_cta",
    description: "A two-row customer logo wall springs in pill by pill beneath a trust headline, ending on a ratings badge.",
    params: {
      heading: { type: "string", default: "Trusted by 4,000+ product teams", description: "Section heading" },
      accentColor: { type: "color", default: "#10B981", description: "Badge colour" },
    },
    code: `
const heading = _rb.text(__o.heading, 30, { color: "#F8FAFC", x: 0, y: 230 });
_rb.pop(heading, 0, 18, { from: 0.86, ease: "SpringOut" });
const sub = _rb.text("From seed-stage startups to public companies.", 14, { color: "#64748B", x: 0, y: 194 });
_rb.fade(sub, 3, 12, 0, 100, "SlowOut");
const brands = ["Acme", "Vercel", "Linear", "Raycast", "Notion", "Figma", "Loom", "Stripe"];
const marks = ["#F87171", "#38BDF8", "#A78BFA", "#FBBF24", "#E2E8F0", "#F472B6", "#34D399", "#60A5FA"];
for (let i = 0; i < brands.length; i++) {
  const col = i % 4, row = Math.floor(i / 4);
  const x = -420 + col * 280;
  const y = 90 - row * 110;
  const p = _rb.logoPill("Logo " + brands[i], brands[i], x, y, {
    height: 56, fontSize: 18, fill: "#0F141B", strokeColor: "#222B38", color: marks[i]
  });
  const start = 4 + i * 3;
  _rb.pop(p.pill, start, 16, { from: 0.72, ease: "SpringOut" });
  _rb.pop(p.mark, start, 16, { from: 0.001, ease: "SpringOut" });
  _rb.pop(p.text, start, 16, { from: 0.6, ease: "SpringOut" });
  if (i === 0) track("logo", p.pill);
}
const divider = _rb.rect("Logo Divider", 800, 1, { fill: "#1F2937", x: 0, y: -80 });
_rb.kf(divider, "scale.x", [[26, 0.001], [42, 1]], "SlowInOut");
const stats = ["4.9/5 on G2", "SOC 2 Type II", "99.99% uptime"];
for (let i = 0; i < stats.length; i++) {
  const label = _rb.text("\\u2713  " + stats[i], 12, { color: "#94A3B8", x: -280 + i * 280, y: -120, name: "Logo Stat " + i });
  _rb.fade(label, 30 + i * 3, 10, 0, 100, "SlowOut");
}
const badge = _rb.badge("Logo Badge", "Join them in minutes", 0, -190, { fill: "#052E22", color: __o.accentColor, fontSize: 13, height: 34, stroke: true, strokeColor: "#065F46" });
_rb.pop(badge.pill, 38, 16, { from: 0.5, ease: "SpringOut" });
_rb.pop(badge.text, 38, 16, { from: 0.5, ease: "SpringOut" });
track("badge", badge.pill);
`,
  },
  {
    id: "testimonial_card",
    title: "Testimonial Card",
    category: "social_proof_cta",
    description: "A quote card assembles its stars, three quote lines, author avatar and company pill over a soft accent glow.",
    params: {
      name: { type: "string", default: "Maya Chen", description: "Author name" },
      role: { type: "string", default: "Head of Design", description: "Author role" },
      company: { type: "string", default: "ACME", description: "Company wordmark" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Accent colour" },
    },
    code: `
const card = _rb.rect("Testimonial Card", 780, 420, { fill: "#111827", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 20, { from: 0.92, ease: "SpringOut", fade: false });
_rb.glow(card, __o.accentColor, 34, 0.3);
track("card", card);
const quoteMark = _rb.text("\\u201C", 120, { color: __o.accentColor, x: -318, y: 118, name: "Quote Mark" });
_rb.fade(quoteMark, 4, 12, 0, 100, "SlowOut");
_rb.stars("Testimonial Stars", 5, 246, 148, 20, { color: "#FBBF24", pop: [8, 12], stagger: 2 });
const line1 = _rb.textLeft("\\u201CAcme cut our motion delivery time from", 24, -320, 55, { color: "#E2E8F0" });
_rb.fade(line1, 10, 12, 0, 100, "SlowOut");
const line2 = _rb.textLeft("days to minutes. The team actually", 24, -320, 15, { color: "#E2E8F0" });
_rb.fade(line2, 14, 12, 0, 100, "SlowOut");
const line3 = _rb.textLeft("enjoys shipping again.\\u201D", 24, -320, -25, { color: "#E2E8F0" });
_rb.fade(line3, 18, 12, 0, 100, "SlowOut");
const divider = _rb.rect("Testimonial Divider", 700, 1, { fill: "#1F2937", x: 0, y: -70 });
_rb.kf(divider, "scale.x", [[16, 0.001], [30, 1]], "SlowInOut");
const initials = String(__o.name || "Maya Chen").split(" ").map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase();
const avatar = _rb.avatar("Testimonial Avatar", 56, -296, -142, { fill: __o.accentColor, initials: initials, ring: false });
_rb.pop(avatar.bg, 20, 16, { from: 0.001, ease: "SpringOut" });
_rb.pop(avatar.label, 20, 16, { from: 0.4, ease: "SpringOut" });
const name = _rb.textLeft(__o.name, 17, -256, -130, { color: "#F8FAFC" });
_rb.fade(name, 22, 10, 0, 100, "SlowOut");
const role = _rb.textLeft(__o.role, 12, -256, -156, { color: "#64748B" });
_rb.fade(role, 24, 10, 0, 100, "SlowOut");
const logo = _rb.logoPill("Testimonial Brand", __o.company, 280, -142, { width: 130, height: 40, fontSize: 14, fill: "#0B1220", strokeColor: "#27303F", color: __o.accentColor });
_rb.pop(logo.pill, 26, 16, { from: 0.7, ease: "SpringOut" });
_rb.pop(logo.mark, 26, 16, { from: 0.001, ease: "SpringOut" });
_rb.pop(logo.text, 26, 16, { from: 0.6, ease: "SpringOut" });
const verified = _rb.textRight("\\u2713  Verified customer", 11, 345, -182, { color: __o.accentColor });
_rb.fade(verified, 30, 10, 0, 100, "SlowOut");
`,
  },
  {
    id: "rating_summary",
    title: "Rating Summary",
    category: "social_proof_cta",
    description: "A big 4.9 score pops with five stars while the right-hand distribution bars grow row by row.",
    params: {
      rating: { type: "string", default: "4.9", description: "Average score" },
      reviews: { type: "int", default: 2148, description: "Review count" },
      accentColor: { type: "color", default: "#FBBF24", description: "Star colour" },
    },
    code: `
function fmtNum(value) {
  const n = String(Math.round(Number(value) || 0));
  let out = "";
  for (let i = 0; i < n.length; i++) {
    if (i > 0 && (n.length - i) % 3 === 0) out += ",";
    out += n[i];
  }
  return out;
}
const card = _rb.rect("Rating Card", 820, 460, { fill: "#111827", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("card", card);
const title = _rb.textLeft("Rated " + __o.rating + " out of 5", 24, -380, 185, { color: "#F8FAFC" });
_rb.fade(title, 4, 10, 0, 100, "SlowOut");
const sub = _rb.textLeft("Across G2, Capterra and the App Store", 12, -380, 155, { color: "#64748B" });
_rb.fade(sub, 6, 10, 0, 100, "SlowOut");
const score = _rb.text(__o.rating, 104, { color: "#F8FAFC", x: -250, y: 60, name: "Rating Score" });
_rb.pop(score, 6, 20, { from: 0.7, ease: "SpringOut" });
track("score", score);
_rb.stars("Rating Stars", 5, -250, -48, 24, { color: __o.accentColor, pop: [14, 12], stagger: 2 });
const caption = _rb.text("Based on " + fmtNum(__o.reviews || 2148) + " reviews", 12, { color: "#64748B", x: -250, y: -98 });
_rb.fade(caption, 18, 10, 0, 100, "SlowOut");
const divider = _rb.rect("Rating Divider", 1, 300, { fill: "#1F2937", x: 24, y: 10 });
_rb.kf(divider, "scale.y", [[10, 0.001], [24, 1]], "SlowInOut");
const dist = [78, 15, 4, 2, 1];
for (let i = 0; i < 5; i++) {
  const y = 140 - i * 60;
  const label = _rb.text(String(5 - i), 14, { color: "#94A3B8", x: 66, y: y, name: "Rating Label " + i });
  _rb.fade(label, 8 + i * 4, 8, 0, 100, "SlowOut");
  const trackBar = _rb.rect("Rating Track " + i, 250, 10, { fill: "#1F2937", radius: 5, x: 215, y: y });
  _rb.fade(trackBar, 8 + i * 4, 8, 0, 100, "SlowOut");
  const fill = _rb.rect("Rating Fill " + i, 250, 10, { fill: i === 0 ? __o.accentColor : "#475569", radius: 5 });
  _rb.anchor(fill, -1, 0);
  _rb.pos(fill, 90, y);
  _rb.kf(fill, "scale.x", [[10 + i * 5, 0.001], [32 + i * 5, dist[i] / 100]], "SlowOut");
  if (i === 0) track("fill", fill);
  const pct = _rb.textRight(dist[i] + "%", 11, 380, y, { color: "#64748B" });
  _rb.fade(pct, 12 + i * 5, 8, 0, 100, "SlowOut");
}
const badge = _rb.badge("Rating Badge", "94% would recommend", 215, -180, { fill: "#052E22", color: "#34D399", fontSize: 13, height: 34, stroke: true, strokeColor: "#065F46" });
_rb.pop(badge.pill, 38, 16, { from: 0.5, ease: "SpringOut" });
_rb.pop(badge.text, 38, 16, { from: 0.5, ease: "SpringOut" });
track("badge", badge.pill);
`,
  },
  {
    id: "customer_counter",
    title: "Customer Counter",
    category: "social_proof_cta",
    description: "A headline number counts up to twelve thousand while a row of overlapping avatars and star rating pops in below.",
    params: {
      teams: { type: "int", default: 12, description: "Teams in thousands" },
      heading: { type: "string", default: "Join the teams shipping faster", description: "Section heading" },
      accentColor: { type: "color", default: "#38BDF8", description: "Accent colour" },
    },
    code: `
const heading = _rb.text(__o.heading, 30, { color: "#F8FAFC", x: 0, y: 214 });
_rb.pop(heading, 0, 18, { from: 0.86, ease: "SpringOut" });
const seed = (__o.teams || 12) + "k+";
const value = _rb.text(seed, 128, { color: "#F8FAFC", x: 0, y: 88 });
_rb.pop(value, 2, 20, { from: 0.8, ease: "SpringOut" });
_rb.counter(value, { from: 0, to: __o.teams || 12, suffix: "k+", start: 6, duration: 40, ease: "SlowOut", length: 1 });
track("value", value);
const sub = _rb.text("teams onboarded this year", 14, { color: "#64748B", x: 0, y: 4 });
_rb.fade(sub, 8, 12, 0, 100, "SlowOut");
const people = ["MC", "LT", "SK", "JR", "AP"];
const colors = ["#8B5CF6", "#38BDF8", "#10B981", "#F59E0B", "#F472B6"];
for (let i = 0; i < 5; i++) {
  const x = -100 + i * 50;
  const av = _rb.avatar("Customer Avatar " + i, 64, x, -82, { fill: colors[i], initials: people[i], ring: true, ringColor: "#0B0C10" });
  _rb.pop(av.bg, 10 + i * 3, 16, { from: 0.001, ease: "SpringOut" });
  _rb.pop(av.label, 10 + i * 3, 16, { from: 0.4, ease: "SpringOut" });
}
const more = _rb.badge("Customer More", "+2.4k", 172, -82, { fill: "#0F172A", color: "#94A3B8", fontSize: 12, height: 30, stroke: true, strokeColor: "#27303F" });
_rb.pop(more.pill, 26, 14, { from: 0.5, ease: "SpringOut" });
_rb.pop(more.text, 26, 14, { from: 0.5, ease: "SpringOut" });
_rb.stars("Customer Stars", 5, 0, -152, 18, { color: "#FBBF24", pop: [28, 12], stagger: 2 });
const reviews = _rb.text("4.9/5 from 2,148 reviews", 12, { color: "#64748B", x: 0, y: -196 });
_rb.fade(reviews, 32, 10, 0, 100, "SlowOut");
const badge = _rb.badge("Customer Badge", "No credit card required", 0, -252, { fill: "#0F172A", color: "#94A3B8", fontSize: 12, height: 30, stroke: true, strokeColor: "#27303F" });
_rb.pop(badge.pill, 36, 14, { from: 0.5, ease: "SpringOut" });
_rb.pop(badge.text, 36, 14, { from: 0.5, ease: "SpringOut" });
track("badge", badge.pill);
`,
  },
  {
    id: "press_quote_marquee",
    title: "Press Quote Marquee",
    category: "social_proof_cta",
    description: "Two rows of press quote cards glide in opposite directions under a header, dressed with a subtle scroll feel.",
    params: {
      heading: { type: "string", default: "In the press", description: "Section heading" },
      speed: { type: "int", default: 110, description: "Frames per traverse" },
    },
    code: `
const heading = _rb.text(__o.heading, 30, { color: "#F8FAFC", x: 0, y: 232 });
_rb.pop(heading, 0, 18, { from: 0.86, ease: "SpringOut" });
const sub = _rb.text("What the industry is saying about Acme.", 13, { color: "#64748B", x: 0, y: 198 });
_rb.fade(sub, 3, 12, 0, 100, "SlowOut");
const rowA = [
  ["\\u201CThe Figma of motion design.\\u201D", "TechCrunch"],
  ["\\u201CMotion at the speed of thought.\\u201D", "The Verge"],
  ["\\u201CA category-defining tool.\\u201D", "Fast Company"],
  ["\\u201CAnimation finally feels easy.\\u201D", "Wired"],
  ["\\u201CThe fastest way to ship motion.\\u201D", "Mashable"],
  ["\\u201CA must-have for every studio.\\u201D", "It is Nice That"],
  ["\\u201CDesigners are obsessed.\\u201D", "Dribbble"]
];
const rowB = [
  ["\\u201CCavalry changes everything.\\u201D", "Forbes"],
  ["\\u201CSlick and shockingly fast.\\u201D", "Product Hunt"],
  ["\\u201CThe future of motion is here.\\u201D", "Creative Bloq"],
  ["\\u201CA joy to use every day.\\u201D", "Smashing"],
  ["\\u201CPolished output in minutes.\\u201D", "The Next Web"],
  ["\\u201CThe new default for motion.\\u201D", "Dezeen"],
  ["\\u201CWorth switching for alone.\\u201D", "G2"]
];
function pressRow(name, items, y, dir) {
  const group = _rb.layer("null", name, { position: [0, 0] });
  for (let i = 0; i < items.length; i++) {
    const x = -1505 + i * 430;
    const card = _rb.rect(name + " Card " + i, 430, 74, { fill: "#0F141B", radius: 16, x: x, y: y, stroke: true, strokeColor: "#222B38", strokeWidth: 1 });
    const quote = _rb.textLeft(items[i][0], 13, x - 190, y, { color: "#E2E8F0" });
    const pub = _rb.textRight(items[i][1], 11, x + 190, y, { color: "#64748B" });
    api.parent(card, group);
    api.parent(quote, group);
    api.parent(pub, group);
    if (i === 0) track(name === "Press Row A" ? "row" : "rowB", group);
  }
  _rb.kf(group, "position.x", [[0, 0], [__o.speed || 110, dir * 320]], "Linear");
  return group;
}
pressRow("Press Row A", rowA, 70, -1);
pressRow("Press Row B", rowB, -60, 1);
`,
  },
  {
    id: "case_study_stat",
    title: "Case Study Stat",
    category: "social_proof_cta",
    description: "A customer quote and a 3.2x counter anchor a case-study card while before and after bars draw their lengths.",
    params: {
      company: { type: "string", default: "ACME", description: "Customer wordmark" },
      stat: { type: "double", default: 3.2, description: "Stat multiplier" },
      label: { type: "string", default: "faster campaign delivery", description: "Stat label" },
      accentColor: { type: "color", default: "#10B981", description: "After-bar colour" },
    },
    code: `
const card = _rb.rect("Case Study Card", 780, 460, { fill: "#111827", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 20, { from: 0.92, ease: "SpringOut", fade: false });
track("card", card);
const kicker = _rb.textRight("CASE STUDY", 10, 330, 190, { color: "#64748B" });
_rb.fade(kicker, 3, 8, 0, 100, "SlowOut");
const logo = _rb.logoPill("Case Study Brand", __o.company, -280, 152, { width: 124, height: 38, fontSize: 13, fill: "#0B1220", strokeColor: "#27303F", color: __o.accentColor });
_rb.pop(logo.pill, 6, 16, { from: 0.7, ease: "SpringOut" });
_rb.pop(logo.mark, 6, 16, { from: 0.001, ease: "SpringOut" });
_rb.pop(logo.text, 6, 16, { from: 0.6, ease: "SpringOut" });
const quote1 = _rb.textLeft("\\u201CCampaign delivery went from", 18, -330, 92, { color: "#CBD5E1" });
_rb.fade(quote1, 8, 12, 0, 100, "SlowOut");
const quote2 = _rb.textLeft("weeks to days.\\u201D", 18, -330, 64, { color: "#CBD5E1" });
_rb.fade(quote2, 11, 12, 0, 100, "SlowOut");
const statSeed = Number(__o.stat || 3.2).toFixed(1) + "x";
const stat = _rb.textLeft(statSeed, 92, -330, -34, { color: "#F8FAFC" });
_rb.fade(stat, 7, 10, 0, 100, "SlowOut");
_rb.counter(stat, { from: 0, to: Number(__o.stat || 3.2), suffix: "x", start: 8, duration: 30, decimals: 1, ease: "SlowOut", length: 1 });
track("stat", stat);
const statLabel = _rb.textLeft(__o.label, 14, -330, -104, { color: "#94A3B8" });
_rb.fade(statLabel, 12, 10, 0, 100, "SlowOut");
const beforeLabel = _rb.textLeft("Before", 11, -330, -152, { color: "#64748B" });
_rb.fade(beforeLabel, 14, 8, 0, 100, "SlowOut");
const beforeTrack = _rb.rect("Case Before Track", 500, 16, { fill: "#1F2937", radius: 8, x: 30, y: -152 });
_rb.fade(beforeTrack, 14, 8, 0, 100, "SlowOut");
const beforeFill = _rb.rect("Case Before Fill", 500, 16, { fill: "#475569", radius: 8 });
_rb.anchor(beforeFill, -1, 0);
_rb.pos(beforeFill, -220, -152);
_rb.kf(beforeFill, "scale.x", [[16, 0.001], [30, 0.3]], "SlowOut");
const afterLabel = _rb.textLeft("After", 11, -330, -190, { color: "#64748B" });
_rb.fade(afterLabel, 16, 8, 0, 100, "SlowOut");
const afterTrack = _rb.rect("Case After Track", 500, 16, { fill: "#1F2937", radius: 8, x: 30, y: -190 });
_rb.fade(afterTrack, 16, 8, 0, 100, "SlowOut");
const afterFill = _rb.rect("Case After Fill", 500, 16, { fill: __o.accentColor, radius: 8 });
_rb.anchor(afterFill, -1, 0);
_rb.pos(afterFill, -220, -190);
_rb.kf(afterFill, "scale.x", [[20, 0.001], [40, 0.95]], "SlowOut");
_rb.glow(afterFill, __o.accentColor, 16, 0.9);
track("after", afterFill);
const link = _rb.textRight("Read the case study  ->", 12, 330, -220, { color: __o.accentColor });
_rb.fade(link, 36, 10, 0, 100, "SlowOut");
`,
  },
  {
    id: "cta_button_pulse",
    title: "CTA Button Pulse",
    category: "social_proof_cta",
    description: "A primary CTA fires looping outline pulses while a cursor glides in, clicks, and a trial-started toast pops.",
    params: {
      ctaText: { type: "string", default: "Start free trial", description: "Button label" },
      accentColor: { type: "color", default: "#10B981", description: "Button colour" },
    },
    code: `
const heading = _rb.text("Ready when you are", 36, { color: "#F8FAFC", x: 0, y: 152 });
_rb.pop(heading, 0, 18, { from: 0.86, ease: "SpringOut" });
const sub = _rb.text("Spin up your workspace in under a minute.", 15, { color: "#64748B", x: 0, y: 112 });
_rb.fade(sub, 3, 12, 0, 100, "SlowOut");
const button = _rb.pill("CTA Button", 380, 86, { fill: __o.accentColor, x: 0, y: -20 });
_rb.pop(button, 4, 18, { from: 0.5, ease: "SpringOut" });
_rb.glow(button, __o.accentColor, 34, 1.0);
track("button", button);
const buttonText = _rb.text(__o.ctaText, 22, { color: "#04120C", x: 0, y: -20 });
_rb.pop(buttonText, 5, 18, { from: 0.6, ease: "SpringOut" });
for (let i = 0; i < 3; i++) {
  const pulse = _rb.rect("CTA Pulse " + i, 380, 86, { fill: "#000000", alpha: 0, radius: 43, x: 0, y: -20 });
  _rb.stroke(pulse, __o.accentColor, 2, { capStyle: 1, trim: [0, 100] });
  const s = 10 + i * 14;
  _rb.kf(pulse, "scale.x", [[s, 0.98], [s + 26, 1.2]], "SlowOut");
  _rb.kf(pulse, "scale.y", [[s, 0.98], [s + 26, 1.3]], "SlowOut");
  _rb.fade(pulse, s, 26, 45, 0, "SlowOut");
}
const cursor = _rb.cursor("CTA Cursor", 300, -190, "#F8FAFC", "You", { textColor: "#0B0C10" });
_rb.kf(cursor.group, "position.x", [[16, 300], [34, 74]], "SlowInOut");
_rb.kf(cursor.group, "position.y", [[16, -190], [34, -44]], "SlowInOut");
_rb.sonar("Click Ripple", 74, -44, 22, "#F8FAFC", { count: 2, start: 34, gap: 6, duration: 18, width: 2, from: 80 });
const toast = _rb.badge("CTA Toast", "\\u2713  Trial started", 0, -158, { fill: "#052E22", color: "#34D399", fontSize: 14, height: 36, stroke: true, strokeColor: "#065F46" });
_rb.pop(toast.pill, 40, 16, { from: 0.5, ease: "SpringOut" });
_rb.pop(toast.text, 40, 16, { from: 0.5, ease: "SpringOut" });
track("toast", toast.pill);
const note = _rb.text("No credit card required", 11, { color: "#475569", x: 0, y: -220 });
_rb.fade(note, 42, 10, 0, 100, "SlowOut");
`,
  },
  {
    id: "final_cta_statement",
    title: "Final CTA Statement",
    category: "social_proof_cta",
    description: "A two-line hero statement lands with an underline sweep, support copy and a primary CTA paired with a demo link.",
    params: {
      lineOne: { type: "string", default: "Ship your next", description: "Headline line one" },
      lineTwo: { type: "string", default: "big thing.", description: "Accent headline line" },
      ctaText: { type: "string", default: "Get started free", description: "Primary button label" },
      accentColor: { type: "color", default: "#38BDF8", description: "Accent colour" },
    },
    code: `
const kicker = _rb.text("MOTION, SHIPPED", 12, { color: __o.accentColor, x: 0, y: 176 });
_rb.fade(kicker, 0, 10, 0, 100, "SlowOut");
const line1 = _rb.text(__o.lineOne, 64, { color: "#F8FAFC", x: 0, y: 92 });
_rb.pop(line1, 2, 20, { from: 0.9, ease: "SpringOut" });
const line2 = _rb.text(__o.lineTwo, 64, { color: __o.accentColor, x: 0, y: 20 });
_rb.pop(line2, 6, 20, { from: 0.9, ease: "SpringOut" });
const underline = _rb.rect("CTA Underline", 300, 8, { fill: __o.accentColor, radius: 4 });
_rb.anchor(underline, -1, 0);
_rb.pos(underline, -150, -32);
_rb.kf(underline, "scale.x", [[14, 0.001], [26, 1]], "SlowInOut");
_rb.glow(underline, __o.accentColor, 16, 1.2);
track("underline", underline);
const sub = _rb.text("Design, animate and ship motion in one place.", 16, { color: "#94A3B8", x: 0, y: -84 });
_rb.fade(sub, 16, 12, 0, 100, "SlowOut");
const cta = _rb.pill("Final CTA", 280, 64, { fill: __o.accentColor, x: -80, y: -170 });
_rb.pop(cta, 22, 18, { from: 0.5, ease: "SpringOut" });
_rb.glow(cta, __o.accentColor, 26, 0.8);
track("cta", cta);
const ctaText = _rb.text(__o.ctaText, 18, { color: "#04121C", x: -80, y: -170 });
_rb.pop(ctaText, 23, 18, { from: 0.6, ease: "SpringOut" });
const demo = _rb.text("Book a demo  ->", 14, { color: "#94A3B8", x: 224, y: -170 });
_rb.fade(demo, 26, 12, 0, 100, "SlowOut");
const foot = _rb.text("No credit card required", 11, { color: "#475569", x: 0, y: -238 });
_rb.fade(foot, 34, 10, 0, 100, "SlowOut");
`,
  },
  {
    id: "trust_badges_row",
    title: "Trust Badges Row",
    category: "social_proof_cta",
    description: "Four compliance badge cards pop in a row, each with a check seal, followed by a security stats strip.",
    params: {
      heading: { type: "string", default: "Enterprise-grade trust", description: "Section heading" },
      accentColor: { type: "color", default: "#10B981", description: "Badge colour" },
    },
    code: `
const heading = _rb.text(__o.heading, 30, { color: "#F8FAFC", x: 0, y: 210 });
_rb.pop(heading, 0, 18, { from: 0.86, ease: "SpringOut" });
const sub = _rb.text("Security that clears procurement, fast.", 14, { color: "#64748B", x: 0, y: 176 });
_rb.fade(sub, 3, 12, 0, 100, "SlowOut");
const badges = [
  ["SOC 2 Type II", "Audited annually"],
  ["GDPR", "EU data residency"],
  ["ISO 27001", "Certified ISMS"],
  ["HIPAA", "BAAs available"]
];
for (let i = 0; i < 4; i++) {
  const x = -390 + i * 260;
  const card = _rb.rect("Trust Card " + i, 240, 130, { fill: "#0F141B", radius: 18, x: x, y: 30, stroke: true, strokeColor: "#222B38", strokeWidth: 1 });
  _rb.pop(card, 3 + i * 4, 18, { from: 0.85, ease: "SpringOut" });
  const seal = _rb.checkBadge("Trust Seal " + i, x, 62, 38, __o.accentColor);
  _rb.pop(seal.circle, 8 + i * 4, 14, { from: 0.001, ease: "SpringOut" });
  _rb.pop(seal.check, 8 + i * 4, 14, { from: 0.001, ease: "SpringOut" });
  const title = _rb.text(badges[i][0], 16, { color: "#F8FAFC", x: x, y: 4, name: "Trust Title " + i });
  _rb.fade(title, 10 + i * 4, 10, 0, 100, "SlowOut");
  const note = _rb.text(badges[i][1], 11, { color: "#64748B", x: x, y: -24, name: "Trust Note " + i });
  _rb.fade(note, 12 + i * 4, 10, 0, 100, "SlowOut");
  if (i === 0) track("card", card);
}
const divider = _rb.rect("Trust Divider", 800, 1, { fill: "#1F2937", x: 0, y: -82 });
_rb.kf(divider, "scale.x", [[26, 0.001], [40, 1]], "SlowInOut");
const stats = ["256-bit encryption", "99.99% uptime SLA", "SSO and SCIM"];
for (let i = 0; i < stats.length; i++) {
  const label = _rb.text("\\u2713  " + stats[i], 12, { color: "#94A3B8", x: -280 + i * 280, y: -120, name: "Trust Stat " + i });
  _rb.fade(label, 30 + i * 3, 10, 0, 100, "SlowOut");
}
const badge = _rb.badge("Trust Badge", "Trusted by 1,200+ security teams", 0, -186, { fill: "#052E22", color: "#34D399", fontSize: 13, height: 34, stroke: true, strokeColor: "#065F46" });
_rb.pop(badge.pill, 38, 16, { from: 0.5, ease: "SpringOut" });
_rb.pop(badge.text, 38, 16, { from: 0.5, ease: "SpringOut" });
track("badge", badge.pill);
`,
  },
  {
    id: "signup_conversion_flow",
    title: "Signup Conversion Flow",
    category: "social_proof_cta",
    description: "A four-stage funnel fills its visitor, signup, activation and paid bars in sequence with live value readouts.",
    params: {
      visitors: { type: "int", default: 48200, description: "Top-of-funnel visitors" },
      paid: { type: "int", default: 2310, description: "Paid customers" },
      accentColor: { type: "color", default: "#10B981", description: "Paid stage colour" },
    },
    code: `
function fmtNum(value) {
  const n = String(Math.round(Number(value) || 0));
  let out = "";
  for (let i = 0; i < n.length; i++) {
    if (i > 0 && (n.length - i) % 3 === 0) out += ",";
    out += n[i];
  }
  return out;
}
const panel = _rb.rect("Funnel Panel", 940, 500, { fill: "#0B0F14", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
const title = _rb.textLeft("Signup funnel", 26, -430, 210, { color: "#F8FAFC" });
_rb.fade(title, 3, 10, 0, 100, "SlowOut");
const sub = _rb.textLeft("Visitor to paid conversion", 12, -430, 182, { color: "#64748B" });
_rb.fade(sub, 5, 10, 0, 100, "SlowOut");
const live = _rb.badge("Funnel Live", "Live", 398, 212, { fill: "#052E22", color: "#34D399", fontSize: 11, height: 24, stroke: true, strokeColor: "#065F46" });
_rb.fade(live.pill, 6, 8, 0, 100, "SlowOut");
_rb.fade(live.text, 6, 8, 0, 100, "SlowOut");
const total = Math.max(1, __o.visitors || 48200);
const stages = [
  { label: "Visitors", value: total, color: "#38BDF8" },
  { label: "Signups", value: Math.round(total * 0.2), color: "#818CF8" },
  { label: "Activated", value: Math.round(total * 0.127), color: "#A78BFA" },
  { label: "Paid", value: __o.paid || 2310, color: __o.accentColor }
];
for (let i = 0; i < stages.length; i++) {
  const y = 120 - i * 90;
  const ratio = stages[i].value / total;
  const label = _rb.textLeft(stages[i].label, 14, -430, y, { color: "#CBD5E1" });
  _rb.fade(label, 8 + i * 4, 8, 0, 100, "SlowOut");
  const trackBar = _rb.rect("Funnel Track " + i, 620, 36, { fill: "#151A23", radius: 10, x: -20, y: y });
  _rb.fade(trackBar, 6 + i * 4, 8, 0, 100, "SlowOut");
  const fill = _rb.rect("Funnel Fill " + i, 620, 36, { fill: stages[i].color, radius: 10 });
  _rb.anchor(fill, -1, 0);
  _rb.pos(fill, -330, y);
  _rb.kf(fill, "scale.x", [[10 + i * 6, 0.001], [34 + i * 6, ratio]], "SlowOut");
  if (i === 3) track("paid", fill);
  const value = _rb.textRight(fmtNum(stages[i].value), 16, 430, y + 2, { color: "#F8FAFC" });
  _rb.fade(value, 10 + i * 4, 8, 0, 100, "SlowOut");
  const pct = _rb.textRight((ratio * 100).toFixed(ratio < 0.1 ? 1 : 0) + "% of visitors", 10, 430, y - 24, { color: "#475569" });
  _rb.fade(pct, 12 + i * 4, 8, 0, 100, "SlowOut");
}
const footer = _rb.textLeft("Biggest drop-off: visitors to signups", 11, -430, -215, { color: "#64748B" });
_rb.fade(footer, 36, 10, 0, 100, "SlowOut");
const conv = _rb.badge("Funnel Conversion", "4.8% visitor to paid", 270, -215, { fill: "#052E22", color: "#34D399", fontSize: 12, height: 30, stroke: true, strokeColor: "#065F46" });
_rb.pop(conv.pill, 38, 14, { from: 0.5, ease: "SpringOut" });
_rb.pop(conv.text, 38, 14, { from: 0.5, ease: "SpringOut" });
track("conversion", conv.pill);
`,
  },
];
