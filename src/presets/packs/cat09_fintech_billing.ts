import type { PresetDef } from "../types.js";

export const CAT09_FINTECH_BILLING: PresetDef[] = [
  {
    id: "payment_card_checkout",
    title: "Payment Card Checkout",
    category: "fintech_billing",
    description: "A checkout sheet springs in with a credit card, total due and a pulsing pay button that resolves into a success check.",
    params: {
      amount: { type: "string", default: "$248.00", description: "Total due" },
      accentColor: { type: "color", default: "#10B981", description: "Brand accent" },
      cardLast4: { type: "string", default: "4242", description: "Card digits" },
    },
    code: `
const shell = _rb.rect("Checkout Sheet", 560, 660, {
  fill: "#0F141B", radius: 28, x: 0, y: 0,
  stroke: true, strokeColor: "#27303F", strokeWidth: 2
});
_rb.pop(shell, 0, 22, { from: 0.9, ease: "SpringOut", fade: false });
_rb.glow(shell, __o.accentColor, 34, 0.35);
track("sheet", shell);
_rb.textLeft("Complete payment", 26, -236, 278, { color: "#F8FAFC" });
_rb.textLeft("Secure checkout - 256-bit TLS", 12, -236, 246, { color: "#64748B" });
const mini = _rb.rect("Credit Card", 456, 214, {
  fill: "#121B28", radius: 20, x: 0, y: 120,
  stroke: true, strokeColor: "#2A3648", strokeWidth: 2
});
_rb.pop(mini, 6, 20, { from: 0.9, ease: "SpringOut", fade: false });
_rb.glow(mini, __o.accentColor, 26, 0.3);
track("card", mini);
_rb.rect("Card Chip", 48, 36, { fill: "#C7A254", radius: 7, x: -160, y: 148 });
_rb.textLeft("ACME  BANK", 15, -204, 196, { color: "#94A3B8" });
_rb.text("****   ****   ****   " + __o.cardLast4, 22, { color: "#E2E8F0", x: 0, y: 88 });
_rb.textLeft("ALEX RIVERA", 12, -204, 38, { color: "#64748B" });
_rb.textRight("09/28", 12, 204, 38, { color: "#64748B" });
_rb.textLeft("Total due", 15, -236, -86, { color: "#94A3B8" });
const total = _rb.textRight(__o.amount, 52, 236, -94, { color: "#F8FAFC" });
_rb.pop(total, 14, 18, { from: 0.5, ease: "SpringOut", fade: false });
track("total", total);
_rb.textLeft("Visa ending " + __o.cardLast4, 12, -236, -152, { color: "#475569" });
_rb.textRight("edit", 12, 236, -158, { color: __o.accentColor });
const btn = _rb.rect("Pay Button", 464, 62, { fill: __o.accentColor, radius: 16, x: 0, y: -236 });
_rb.pop(btn, 18, 18, { from: 0.85, ease: "SpringOut", fade: false });
_rb.glow(btn, __o.accentColor, 22, 1.1);
track("button", btn);
const btnLabel = _rb.text("Pay " + __o.amount, 19, { color: "#04120C", x: 0, y: -236 });
_rb.kf(btn, "scale.x", [[26, 1], [31, 1.045], [38, 1]], "SlowInOut");
_rb.kf(btn, "scale.y", [[26, 1], [31, 1.045], [38, 1]], "SlowInOut");
_rb.kf(btnLabel, "opacity", [[38, 100], [42, 0]], "SlowOut");
_rb.sonar("Tap Ripple", 0, -236, 42, __o.accentColor, { count: 2, start: 34, gap: 5, duration: 24, width: 3, from: 80 });
const ok = _rb.checkBadge("Paid Check", 0, -236, 46, __o.accentColor, { glow: 20 });
_rb.pop(ok.circle, 40, 18, { from: 0.001, ease: "SpringOut", fade: true });
_rb.pop(ok.check, 40, 18, { from: 0.001, ease: "SpringOut", fade: true });
track("check", ok.circle);
_rb.confetti("Payment Confetti", 0, -220, 22, [__o.accentColor, "#38BDF8", "#FBBF24"], { start: 42, duration: 30, spread: 210, lift: 40 });
_rb.text("Receipt sent to alex@acme.dev", 12, { color: "#64748B", x: 0, y: -292 });
`,
  },
  {
    id: "subscription_tier_cards",
    title: "Subscription Tier Cards",
    category: "fintech_billing",
    description: "Three pricing tiers rise in sequence, feature checks cascade and the popular plan glows with a badge.",
    params: {
      starterPrice: { type: "int", default: 19, description: "Starter monthly price" },
      growthPrice: { type: "int", default: 49, description: "Growth monthly price" },
      scalePrice: { type: "int", default: 99, description: "Scale monthly price" },
      accentColor: { type: "color", default: "#10B981", description: "Highlight colour" },
    },
    code: `
_rb.text("Simple pricing for every stage", 34, { color: "#F8FAFC", x: 0, y: 318 });
_rb.text("Start free. Upgrade when the team grows.", 14, { color: "#64748B", x: 0, y: 282 });
const plans = [
  { name: "Starter", price: __o.starterPrice, features: ["3 projects", "1 seat", "Community support"], hot: false },
  { name: "Growth", price: __o.growthPrice, features: ["Unlimited projects", "10 seats", "Priority support", "Analytics"], hot: true },
  { name: "Scale", price: __o.scalePrice, features: ["Unlimited seats", "SSO + SCIM", "Dedicated CSM", "Audit log"], hot: false }
];
for (let i = 0; i < plans.length; i++) {
  const p = plans[i];
  const x = -380 + i * 380, y = 0;
  const card = _rb.rect("Plan " + p.name, 330, 460, {
    fill: p.hot ? "#101B18" : "#111827", radius: 24, x: x, y: y,
    stroke: true, strokeColor: p.hot ? __o.accentColor : "#27303F", strokeWidth: p.hot ? 3 : 1
  });
  if (p.hot) _rb.glow(card, __o.accentColor, 30, 0.6);
  _rb.pop(card, 6 + i * 10, 22, { from: 0.86, ease: "SpringOut", fade: false });
  _rb.textLeft(p.name, 18, x - 143, y + 172, { color: p.hot ? __o.accentColor : "#94A3B8" });
  _rb.textLeft("$" + p.price, 56, x - 146, y + 100, { color: "#F8FAFC" });
  _rb.textLeft("/mo", 14, x - 62, y + 82, { color: "#64748B" });
  const divider = _rb.line("Plan Divider " + i, x - 142, y + 48, x + 142, y + 48, 1, "#27303F");
  _rb.fade(divider, 10 + i * 10, 12, 0, 100, "SlowOut");
  for (let f = 0; f < p.features.length; f++) {
    const fy = y + 6 - f * 40;
    const check = _rb.text("\\u2713", 15, { color: __o.accentColor, x: x - 128, y: fy, name: "Feature Check " + i + "-" + f });
    const label = _rb.textLeft(p.features[f], 14, x - 108, fy, { color: "#CBD5E1" });
    _rb.pop(check, 22 + i * 6 + f * 4, 12, { from: 0.001, ease: "SpringOut" });
    _rb.fade(label, 22 + i * 6 + f * 4, 12, 0, 100, "SlowOut");
  }
  const cta = _rb.rect("Plan CTA " + i, 250, 44, { fill: p.hot ? __o.accentColor : "#1E293B", radius: 12, x: x, y: y - 172 });
  _rb.text(p.hot ? "Start free trial" : "Choose " + p.name, 14, { color: p.hot ? "#04120C" : "#E2E8F0", x: x, y: y - 172 });
  _rb.pop(cta, 34 + i * 6, 14, { from: 0.85, ease: "SpringOut", fade: false });
  if (p.hot) {
    const badge = _rb.badge("Popular", "MOST POPULAR", x, y + 256, { fill: __o.accentColor, color: "#04120C", fontSize: 11, height: 26 });
    _rb.pop(badge.pill, 42, 16, { from: 0.4, ease: "SpringOut", fade: false });
    _rb.pop(badge.text, 42, 16, { from: 0.4, ease: "SpringOut", fade: false });
    track("popular", badge.pill);
  }
  if (i === 1) track("growthCard", card);
}
`,
  },
  {
    id: "revenue_growth_dashboard",
    title: "Revenue Growth Dashboard",
    category: "fintech_billing",
    description: "Three KPI tiles pop above a revenue chart whose bars grow month by month behind a rising trend line.",
    params: {
      mrr: { type: "string", default: "$84.2k", description: "Monthly recurring revenue" },
      subs: { type: "string", default: "2,481", description: "Active subscriptions" },
      churn: { type: "string", default: "0.8%", description: "Monthly churn" },
      accentColor: { type: "color", default: "#10B981", description: "Chart colour" },
    },
    code: `
_rb.textLeft("REVENUE", 12, -470, 302, { color: "#64748B" });
_rb.textRight("Last 8 months", 12, 470, 302, { color: "#475569" });
const kpis = [
  { label: "Recurring revenue", value: __o.mrr, delta: "+18.4%", x: -330 },
  { label: "Active subscriptions", value: __o.subs, delta: "+6.1%", x: 0 },
  { label: "Monthly churn", value: __o.churn, delta: "-0.2%", x: 330 }
];
for (let i = 0; i < kpis.length; i++) {
  const k = kpis[i];
  const tile = _rb.kpiCard("KPI " + i, k.label, k.value, k.x, 196, 300, 140, {
    delta: k.delta, valueSize: 40, strokeColor: i === 0 ? __o.accentColor : "#27303F",
    deltaFill: i === 2 ? "#1F1315" : "#052E22", deltaColor: i === 2 ? "#FCA5A5" : "#34D399"
  });
  _rb.pop(tile.card, i * 6, 18, { from: 0.9, ease: "SpringOut", fade: false });
  _rb.fade(tile.caption, i * 6 + 4, 12, 0, 100, "SlowOut");
  _rb.fade(tile.value, i * 6 + 4, 12, 0, 100, "SlowOut");
  if (i === 0) track("kpi", tile.card);
}
const panel = _rb.rect("Revenue Chart Panel", 960, 420, { fill: "#0D1117", radius: 22, x: 0, y: -170, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
track("panel", panel);
const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
const values = [38, 46, 42, 58, 62, 71, 78, 92];
const baseY = -330, chartH = 260, gap = 104;
for (let i = 0; i < values.length; i++) {
  const x = -364 + i * gap;
  const h = chartH * values[i] / 100;
  const bar = _rb.rect("Revenue Bar " + i, 54, h, { fill: i === values.length - 1 ? __o.accentColor : "#1E3A33", radius: 8, x: x, y: baseY + h / 2 });
  _rb.anchor(bar, 0, 1);
  _rb.pos(bar, x, baseY);
  _rb.kf(bar, "scale.y", [[12 + i * 3, 0.001], [32 + i * 3, 1]], "SlowInSlowOut");
  if (i === values.length - 1) { _rb.glow(bar, __o.accentColor, 18, 1.2); track("lastBar", bar); }
  _rb.text(months[i], 11, { color: "#475569", x: x, y: -352, name: "Month " + i });
  _rb.text("$" + values[i] + "k", 10, { color: i === values.length - 1 ? __o.accentColor : "#334155", x: x, y: baseY + h + 16, name: "Value " + i });
}
const trend = _rb.sparkline("Revenue Trend", [28, 42, 38, 52, 58, 68, 74, 94], 790, 170, 0, -146, "#F8FAFC", 3, { start: 26, stagger: 3, glow: 10, dotSize: 12 });
track("trend", trend.dot);
_rb.textLeft("MRR", 12, -440, -166, { color: "#475569" });
_rb.textRight("82% of target", 11, 440, -166, { color: __o.accentColor });
`,
  },
  {
    id: "invoice_generation",
    title: "Invoice Generation",
    category: "fintech_billing",
    description: "An invoice sheet builds line by line, totals roll up and a PAID stamp lands with a springy thud.",
    params: {
      invoiceNo: { type: "string", default: "INV-2048", description: "Invoice number" },
      client: { type: "string", default: "Northwind Labs", description: "Client name" },
      accentColor: { type: "color", default: "#10B981", description: "Paid stamp colour" },
    },
    code: `
const sheet = _rb.rect("Invoice Sheet", 600, 740, { fill: "#F8FAFC", radius: 18, x: 0, y: 0 });
_rb.pop(sheet, 0, 22, { from: 0.92, ease: "SpringOut", fade: false });
_rb.kf(sheet, "position.y", [[0, -40], [24, 0]], "SlowOut");
track("sheet", sheet);
_rb.textLeft("ACME", 30, -250, 300, { color: "#0B0C10" });
_rb.textLeft("Studio invoice", 12, -250, 270, { color: "#64748B" });
_rb.textRight("INVOICE", 12, 250, 306, { color: "#94A3B8" });
_rb.textRight(__o.invoiceNo, 18, 250, 282, { color: "#0B0C10" });
_rb.textLeft("Billed to", 11, -250, 220, { color: "#94A3B8" });
_rb.textLeft(__o.client, 16, -250, 196, { color: "#334155" });
_rb.textRight("Issued 24 Oct 2026", 11, 250, 220, { color: "#94A3B8" });
const head = _rb.line("Invoice Head", -250, 152, 250, 152, 2, "#CBD5E1");
_rb.fade(head, 8, 10, 0, 100, "SlowOut");
const items = [
  { name: "Brand identity system", meta: "Fixed scope", amt: "$6,400.00" },
  { name: "Motion toolkit", meta: "12 presets", amt: "$2,800.00" },
  { name: "Design retainer", meta: "October", amt: "$1,500.00" },
  { name: "Performance review", meta: "4 sessions", amt: "$900.00" }
];
let sum = 0, sumLabel = "$0";
for (let i = 0; i < items.length; i++) {
  const y = 104 - i * 68;
  const title = _rb.textLeft(items[i].name, 16, -250, y + 10, { color: "#0B0C10" });
  const meta = _rb.textLeft(items[i].meta, 11, -250, y - 10, { color: "#94A3B8" });
  const amt = _rb.textRight(items[i].amt, 15, 250, y, { color: "#334155" });
  _rb.fade(title, 12 + i * 6, 12, 0, 100, "SlowOut");
  _rb.fade(meta, 12 + i * 6, 12, 0, 100, "SlowOut");
  _rb.fade(amt, 12 + i * 6, 12, 0, 100, "SlowOut");
  const rowLine = _rb.line("Row Line " + i, -250, y - 28, 250, y - 28, 1, "#E2E8F0");
  _rb.fade(rowLine, 12 + i * 6, 12, 0, 100, "SlowOut");
  if (i === 0) track("firstRow", title);
}
_rb.line("Total Rule", -250, -196, 250, -196, 2, "#94A3B8");
_rb.textLeft("Subtotal", 13, -250, -230, { color: "#64748B" });
_rb.textRight("$11,600.00", 13, 250, -230, { color: "#334155" });
_rb.textLeft("Tax (8%)", 13, -250, -256, { color: "#64748B" });
_rb.textRight("$928.00", 13, 250, -256, { color: "#334155" });
_rb.textLeft("Total due", 18, -250, -296, { color: "#0B0C10" });
const total = _rb.textRight("$12,528.00", 30, 250, -300, { color: "#0B0C10" });
_rb.fade(total, 34, 16, 0, 100, "SlowOut");
track("total", total);
const stamp = _rb.rect("Paid Stamp", 190, 72, { fill: "#000000", alpha: 0, radius: 10, x: 62, y: -302, stroke: true, strokeColor: __o.accentColor, strokeWidth: 4 });
_rb.rot(stamp, -12);
const stampText = _rb.text("PAID", 38, { color: __o.accentColor, x: 62, y: -302 });
_rb.pop(stamp, 44, 18, { from: 0.4, ease: "SpringOut" });
_rb.pop(stampText, 44, 18, { from: 0.4, ease: "SpringOut" });
track("stamp", stamp);
_rb.text("Thanks for building with us.", 12, { color: "#94A3B8", x: 0, y: -364 });
`,
  },
  {
    id: "wallet_balance_card",
    title: "Wallet Balance Card",
    category: "fintech_billing",
    description: "A premium wallet card springs in, its balance rolls up and reward coins pop around the edge.",
    params: {
      startBalance: { type: "int", default: 0, description: "Counter start" },
      endBalance: { type: "int", default: 12480, description: "Balance target" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Wallet accent" },
    },
    code: `
const halo = _rb.circle("Wallet Halo", 240, { fill: __o.accentColor, alpha: 18, x: 250, y: 150 });
_rb.fade(halo, 0, 20, 0, 100, "SlowOut");
const card = _rb.rect("Wallet Card", 640, 360, { fill: "#12101F", radius: 30, x: 0, y: 10, stroke: true, strokeColor: "#332B52", strokeWidth: 2 });
_rb.pop(card, 0, 24, { from: 0.88, ease: "SpringOut", fade: false });
_rb.glow(card, __o.accentColor, 40, 0.55);
track("card", card);
_rb.textLeft("Available balance", 14, -280, 108, { color: "#A5B4FC" });
const amount = _rb.textLeft("$" + _rb.fmt(__o.endBalance), 58, -282, 44, { color: "#F8FAFC" });
track("balance", amount);
_rb.counter(amount, { from: __o.startBalance, to: __o.endBalance, prefix: "$", start: 6, duration: 48, ease: "SlowInSlowOut", length: 1, delimiter: "," });
_rb.textLeft("****  4821", 14, -280, -54, { color: "#94A3B8" });
_rb.textLeft("ALEX RIVERA", 12, -280, -136, { color: "#64748B" });
const mark = _rb.circle("Wallet Mark A", 44, { fill: "#000000", alpha: 0, x: 214, y: 54 });
_rb.stroke(mark, __o.accentColor, 8, { capStyle: 1, trim: [0, 100] });
const markB = _rb.circle("Wallet Mark B", 44, { fill: "#000000", alpha: 0, x: 258, y: 54 });
_rb.stroke(markB, "#A78BFA", 8, { capStyle: 1, trim: [0, 100] });
_rb.opacity(mark, 70);
_rb.opacity(markB, 55);
_rb.textRight("VISA", 22, 282, 122, { color: "#C4B5FD" });
const coins = [
  { x: -300, y: 210, c: "#FBBF24" },
  { x: 330, y: 196, c: "#F472B6" },
  { x: -340, y: -160, c: "#38BDF8" },
  { x: 314, y: -176, c: "#34D399" }
];
for (let i = 0; i < coins.length; i++) {
  const coin = _rb.circle("Coin " + i, 26, { fill: coins[i].c, x: coins[i].x, y: coins[i].y });
  _rb.glow(coin, coins[i].c, 18, 1.1);
  const glyph = _rb.text("$", 18, { color: "#0B0C10", x: coins[i].x, y: coins[i].y, name: "Coin Glyph " + i });
  _rb.pop(coin, 26 + i * 5, 16, { from: 0.001, ease: "SpringOut", fade: false });
  _rb.pop(glyph, 26 + i * 5, 16, { from: 0.001, ease: "SpringOut", fade: false });
  _rb.kf(coin, "position.y", [[26 + i * 5, coins[i].y - 26], [44 + i * 5, coins[i].y]], "SlowOut");
  _rb.kfAt(glyph, "y", [[26 + i * 5, coins[i].y - 26], [44 + i * 5, coins[i].y]], "SlowOut");
  if (i === 0) track("coin", coin);
}
const label = _rb.badge("Wallet Status", "Rewards active", 0, -226, { fill: "#1E1B33", color: "#C4B5FD", fontSize: 13, height: 32, stroke: true, strokeColor: "#332B52" });
_rb.pop(label.pill, 34, 16, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(label.text, 34, 16, { from: 0.5, ease: "SpringOut", fade: false });
`,
  },
  {
    id: "transaction_feed",
    title: "Transaction Feed",
    category: "fintech_billing",
    description: "A finance feed streams merchant rows into place while the running balance clicks upward at the top.",
    params: {
      balance: { type: "int", default: 8420, description: "Header balance" },
      rows: { type: "int", default: 6, description: "Feed rows (4-8)" },
      accentColor: { type: "color", default: "#10B981", description: "Positive amount colour" },
    },
    code: `
const n = Math.max(4, Math.min(8, __o.rows || 6));
const panel = _rb.rect("Feed Panel", 540, 740, { fill: "#0F141B", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.92, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Transactions", 20, -236, 314, { color: "#F8FAFC" });
_rb.textRight("Today", 12, 236, 318, { color: "#64748B" });
const bal = _rb.textLeft("$" + _rb.fmt(__o.balance), 44, -238, 256, { color: "#F8FAFC" });
_rb.counter(bal, { from: 0, to: __o.balance, prefix: "$", start: 2, duration: 34, ease: "SlowOut", length: 1, delimiter: "," });
track("balance", bal);
_rb.textLeft("Available balance", 12, -236, 224, { color: "#64748B" });
_rb.line("Feed Rule", -236, 192, 236, 192, 1, "#1F2937");
const rows = [
  { name: "Stripe payout", meta: "09:42 AM", amt: "+$8,200.00", good: true },
  { name: "Figma", meta: "08:15 AM", amt: "-$45.00", good: false },
  { name: "AWS", meta: "07:48 AM", amt: "-$1,284.20", good: false },
  { name: "Northwind Labs", meta: "Yesterday", amt: "+$4,800.00", good: true },
  { name: "Slack", meta: "Yesterday", amt: "-$96.00", good: false },
  { name: "Linear", meta: "Mon", amt: "-$32.00", good: false },
  { name: "Vercel", meta: "Mon", amt: "-$20.00", good: false },
  { name: "Acme retainer", meta: "Sun", amt: "+$2,400.00", good: true }
];
const initials = ["ST", "FG", "AW", "NL", "SL", "LN", "VC", "AC"];
const colours = ["#635BFF", "#F24E1E", "#FF9900", "#10B981", "#611F69", "#5E6AD2", "#F8FAFC", "#8B5CF6"];
for (let i = 0; i < n; i++) {
  const r = rows[i];
  const y = 142 - i * 78;
  const row = _rb.rect("Feed Row " + i, 476, 66, { fill: i === 0 ? "#151D2A" : "#111827", radius: 14, x: 0, y: y, stroke: true, strokeColor: i === 0 ? "#2A3648" : "#1B2330", strokeWidth: 1 });
  _rb.avatar("Feed Avatar " + i, 36, -198, y, { fill: colours[i], initials: initials[i], ring: false });
  _rb.textLeft(r.name, 15, -166, y + 12, { color: "#E2E8F0" });
  _rb.textLeft(r.meta, 11, -166, y - 12, { color: "#64748B" });
  _rb.textRight(r.amt, 15, 222, y, { color: r.good ? __o.accentColor : "#E2E8F0" });
  _rb.fade(row, 8 + i * 5, 12, 0, 100, "SlowOut");
  _rb.kf(row, "position.y", [[8 + i * 5, y + 26], [24 + i * 5, y]], "SlowOut");
  if (i === 0) track("row", row);
}
_rb.badge("New Badge", "+ 4 new", 188, 314, { fill: "#052E22", color: __o.accentColor, fontSize: 11, height: 24 });
`,
  },
  {
    id: "split_bill_pay",
    title: "Split Bill Pay",
    category: "fintech_billing",
    description: "Four friends split a dinner bill; each share lights up a meter segment and a check until the table settles.",
    params: {
      total: { type: "string", default: "$186.40", description: "Bill total" },
      people: { type: "int", default: 4, description: "Diners (3-5)" },
      accentColor: { type: "color", default: "#10B981", description: "Paid colour" },
    },
    code: `
const n = Math.max(3, Math.min(5, __o.people || 4));
const card = _rb.rect("Split Bill Card", 620, 640, { fill: "#111827", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 20, { from: 0.9, ease: "SpringOut", fade: false });
track("card", card);
_rb.textLeft("Dinner at Osteria", 24, -270, 270, { color: "#F8FAFC" });
_rb.textLeft("Table 12 - " + n + " diners", 12, -270, 238, { color: "#64748B" });
const total = _rb.textRight(__o.total, 34, 270, 262, { color: "#F8FAFC" });
track("total", total);
const segs = _rb.segmentRow("Split Progress", n, 520, 12, 0, 158, { gap: 8, fill: "#1F2937", radius: 6 });
const names = ["Maya", "Alex", "Priya", "Sam", "Noah"];
const colours = ["#F472B6", "#8B5CF6", "#38BDF8", "#FBBF24", "#34D399"];
const sum = Number(String(__o.total).replace(/[^0-9.]/g, "")) || 186.4;
const per = sum / n;
for (let i = 0; i < n; i++) {
  const x = _rb.rowX(i, n, 118);
  const av = _rb.avatar("Diner " + i, 66, x, 72, { fill: colours[i], initials: names[i].slice(0, 1), ring: true, ringColor: "#111827" });
  _rb.text(names[i], 13, { color: "#CBD5E1", x: x, y: 18, name: "Diner Name " + i });
  _rb.text("$" + per.toFixed(2), 12, { color: "#64748B", x: x, y: -8, name: "Diner Share " + i });
  _rb.pop(av.bg, 8 + i * 4, 14, { from: 0.001, ease: "SpringOut", fade: false });
  const paid = 20 + i * 12;
  const check = _rb.checkBadge("Paid " + i, x + 24, 96, 26, __o.accentColor, { glow: 10 });
  _rb.pop(check.circle, paid, 14, { from: 0.001, ease: "SpringOut", fade: false });
  _rb.pop(check.check, paid, 14, { from: 0.001, ease: "SpringOut", fade: false });
  const fill = _rb.rect("Segment Fill " + i, (520 - 8 * (n - 1)) / n, 12, { fill: __o.accentColor, radius: 6, x: 0, y: 158 });
  _rb.anchor(fill, -1, 0);
  const segW = (520 - 8 * (n - 1)) / n;
  _rb.pos(fill, -260 + i * (segW + 8), 158);
  _rb.kf(fill, "scale.x", [[paid, 0.001], [paid + 10, 1]], "SpringOut");
  _rb.glow(fill, __o.accentColor, 10, 1.0);
  if (i === 0) track("segment", fill);
  if (i === n - 1) track("lastCheck", check.circle);
}
_rb.textLeft("Paid by the group", 12, -270, -196, { color: "#64748B" });
_rb.textRight("$" + (per * n).toFixed(2), 14, 270, -196, { color: "#94A3B8" });
const settled = _rb.badge("Settled", "\\u2713  All settled up", 0, -268, { fill: "#052E22", color: __o.accentColor, fontSize: 15, height: 38, stroke: true, strokeColor: "#065F46" });
_rb.pop(settled.pill, 24 + n * 12, 18, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(settled.text, 24 + n * 12, 18, { from: 0.4, ease: "SpringOut", fade: false });
track("settled", settled.pill);
_rb.confetti("Settle Confetti", 0, -230, 18, [__o.accentColor, "#F472B6", "#FBBF24"], { start: 32 + n * 10, duration: 26, spread: 180 });
`,
  },
  {
    id: "crypto_price_ticker",
    title: "Crypto Price Ticker",
    category: "fintech_billing",
    description: "A dark trading panel draws candlesticks one by one while the live price counter climbs and a pulse dot blinks.",
    params: {
      pair: { type: "string", default: "BTC / USD", description: "Trading pair" },
      startPrice: { type: "int", default: 61200, description: "Counter start" },
      endPrice: { type: "int", default: 67482, description: "Counter target" },
      accentColor: { type: "color", default: "#10B981", description: "Up candle colour" },
    },
    code: `
const panel = _rb.rect("Trading Panel", 940, 620, { fill: "#0B0F14", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft(__o.pair, 18, -430, 246, { color: "#94A3B8" });
_rb.textLeft("24h volume 1.8B", 12, -430, 214, { color: "#475569" });
const price = _rb.textRight("$" + _rb.fmt(__o.endPrice), 44, 400, 238, { color: "#F8FAFC" });
_rb.counter(price, { from: __o.startPrice, to: __o.endPrice, prefix: "$", start: 4, duration: 52, ease: "SlowInSlowOut", length: 1, delimiter: "," });
track("price", price);
const change = _rb.textRight("+2.41%", 16, 430, 196, { color: __o.accentColor });
_rb.fade(change, 28, 12, 0, 100, "SlowOut");
const live = _rb.dot("Live Dot", -466, 262, 10, __o.accentColor, { glow: 12, glowIntensity: 1.4 });
_rb.kf(live, "opacity", [[0, 100], [12, 30], [24, 100], [36, 30], [48, 100]], "SlowInOut");
for (let g = 0; g < 4; g++) {
  const gl = _rb.line("Grid Line " + g, -430, 130 - g * 86, 430, 130 - g * 86, 1, "#151D2A");
  _rb.fade(gl, 2 + g * 3, 10, 0, 100, "SlowOut");
}
const baseY = -242;
for (let i = 0; i < 16; i++) {
  const x = -404 + i * 54;
  const up = (i % 5) !== 3 && (i % 7) !== 2;
  const h = 34 + ((i * 37) % 92);
  const wickH = h + 34 + ((i * 13) % 26);
  const colour = up ? __o.accentColor : "#EF4444";
  const wick = _rb.rect("Wick " + i, 3, wickH, { fill: colour, radius: 2, x: x, y: baseY + wickH / 2, opacity: 55 });
  const body = _rb.rect("Candle " + i, 26, h, { fill: colour, radius: 4, x: x, y: baseY + h / 2 + (i % 3) * 8 });
  _rb.anchor(body, 0, 1);
  _rb.pos(body, x, baseY + (i % 3) * 8);
  _rb.kf(body, "scale.y", [[8 + i * 2, 0.001], [24 + i * 2, 1]], "SlowInSlowOut");
  _rb.fade(wick, 8 + i * 2, 10, 0, 55, "SlowOut");
  if (i === 15) { _rb.glow(body, colour, 18, 1.2); track("lastCandle", body); }
}
const line = _rb.sparkline("Price Line", [30, 44, 38, 62, 55, 74, 68, 88, 82, 100], 840, 190, 0, -120, "#F8FAFC", 2, { start: 38, stagger: 2, segmentDuration: 10, dotSize: 10, glow: 8 });
track("trendDot", line.dot);
_rb.textLeft("09:00", 11, -430, -278, { color: "#475569" });
_rb.textRight("now", 11, 430, -278, { color: "#475569" });
_rb.textLeft("MARKET", 11, -430, 292, { color: "#475569" });
_rb.textRight("LIVE", 12, 426, 292, { color: __o.accentColor });
`,
  },
  {
    id: "payout_success_burst",
    title: "Payout Success Burst",
    category: "fintech_billing",
    description: "A payout lands: sonar rings radiate from a big check, the amount stamps in and confetti celebrates the transfer.",
    params: {
      amount: { type: "string", default: "$4,820.00", description: "Payout amount" },
      recipient: { type: "string", default: "Northwind Labs", description: "Recipient name" },
      accentColor: { type: "color", default: "#10B981", description: "Success colour" },
    },
    code: `
_rb.text("Payout complete", 46, { color: "#F8FAFC", x: 0, y: 190 });
_rb.text("Funds are on the way to your bank", 15, { color: "#64748B", x: 0, y: 146 });
const check = _rb.checkBadge("Payout Check", 0, 20, 124, __o.accentColor, { glow: 30 });
_rb.pop(check.circle, 0, 24, { from: 0.001, ease: "SpringOut", fade: true });
_rb.pop(check.check, 4, 24, { from: 0.001, ease: "SpringOut", fade: true });
_rb.glow(check.circle, __o.accentColor, 40, 1.6);
track("check", check.circle);
_rb.sonar("Payout Sonar", 0, 20, 92, __o.accentColor, { count: 3, start: 4, gap: 12, duration: 42, width: 3, from: 70 });
const amount = _rb.text(__o.amount, 64, { color: "#F8FAFC", x: 0, y: -122 });
_rb.kfAt(amount, "y", [[10, -100], [32, -122]], "SpringOut");
_rb.fade(amount, 10, 18, 0, 100, "SpringOut");
track("amount", amount);
const to = _rb.badge("Recipient", "to  " + __o.recipient, 0, -196, { fill: "#052E22", color: __o.accentColor, fontSize: 14, height: 34, stroke: true, strokeColor: "#065F46" });
_rb.pop(to.pill, 22, 16, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(to.text, 22, 16, { from: 0.5, ease: "SpringOut", fade: false });
const id = _rb.text("Transfer ID  po_8f31c2", 12, { color: "#475569", x: 0, y: -262 });
_rb.fade(id, 30, 12, 0, 100, "SlowOut");
_rb.confetti("Payout Confetti", 0, 30, 34, [__o.accentColor, "#38BDF8", "#FBBF24", "#F472B6"], { start: 12, duration: 38, spread: 300, lift: 60 });
_rb.textLeft("Arrives in 1-2 business days", 12, -470, -300, { color: "#475569" });
_rb.textRight("No fees", 12, 470, -300, { color: "#475569" });
`,
  },
  {
    id: "pricing_toggle_billing",
    title: "Pricing Billing Toggle",
    category: "fintech_billing",
    description: "A monthly/yearly switch slides across, the price rolls from monthly to annual and a savings badge pops.",
    params: {
      monthlyPrice: { type: "int", default: 49, description: "Monthly price" },
      yearlyPrice: { type: "int", default: 39, description: "Annual effective price" },
      accentColor: { type: "color", default: "#10B981", description: "Accent colour" },
    },
    code: `
const card = _rb.rect("Pricing Card", 640, 660, { fill: "#0F141B", radius: 30, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 22, { from: 0.9, ease: "SpringOut", fade: false });
track("card", card);
_rb.badge("Plan Tag", "PRO PLAN", 0, 270, { fill: "#052E22", color: __o.accentColor, fontSize: 11, height: 26 });
_rb.text("Monthly", 14, { color: "#94A3B8", x: -102, y: 202 });
_rb.text("Yearly", 14, { color: "#64748B", x: 104, y: 202 });
const toggle = _rb.toggle("Billing Toggle", 0, 202, { width: 88, height: 40, onColor: __o.accentColor, offColor: "#1E293B" });
_rb.kf(toggle.knob, "position.x", [[24, -22], [40, 22]], "SpringOut");
_rb.kf(toggle.on, "opacity", [[24, 0], [36, 100]], "SlowOut");
_rb.text("Save 20%", 11, { color: __o.accentColor, x: 190, y: 202 });
const price = _rb.text("$" + __o.yearlyPrice, 108, { color: "#F8FAFC", x: 0, y: 64 });
_rb.counter(price, { from: __o.monthlyPrice, to: __o.yearlyPrice, prefix: "$", start: 26, duration: 22, ease: "SlowInSlowOut", length: 1 });
_rb.kf(price, "scale.x", [[26, 1], [32, 1.08], [42, 1]], "SpringOut");
_rb.kf(price, "scale.y", [[26, 1], [32, 1.08], [42, 1]], "SpringOut");
track("price", price);
_rb.text("/ month, billed yearly", 13, { color: "#64748B", x: 0, y: -6 });
const divider = _rb.line("Pricing Divider", -270, -50, 270, -50, 1, "#27303F");
_rb.fade(divider, 8, 12, 0, 100, "SlowOut");
const features = ["Unlimited design projects", "Motion preset library", "Priority render queue", "SSO and audit log"];
for (let i = 0; i < features.length; i++) {
  const y = -92 - i * 40;
  _rb.text("\\u2713", 15, { color: __o.accentColor, x: -246, y: y, name: "Pricing Check " + i });
  const label = _rb.textLeft(features[i], 14, -222, y, { color: "#CBD5E1" });
  _rb.fade(label, 10 + i * 4, 12, 0, 100, "SlowOut");
}
const savings = _rb.badge("Savings", "Save $" + (__o.monthlyPrice - __o.yearlyPrice) * 12 + " / yr", 0, -252, { fill: "#1E1B33", color: "#C4B5FD", fontSize: 12, height: 30, stroke: true, strokeColor: "#332B52" });
_rb.pop(savings.pill, 42, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(savings.text, 42, 16, { from: 0.4, ease: "SpringOut", fade: false });
track("savings", savings.pill);
const cta = _rb.rect("Pricing CTA", 400, 54, { fill: __o.accentColor, radius: 14, x: 0, y: -302 });
_rb.text("Start 14-day trial", 16, { color: "#04120C", x: 0, y: -302 });
_rb.pop(cta, 36, 16, { from: 0.85, ease: "SpringOut", fade: false });
_rb.glow(cta, __o.accentColor, 20, 1.1);
`,
  },
];
