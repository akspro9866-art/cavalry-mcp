import type { PresetDef } from "../types.js";

export const CAT10_SECURITY_AUTH: PresetDef[] = [
  {
    id: "login_auth_card",
    title: "Login Auth Card",
    category: "security_auth",
    description: "A polished sign-in card assembles field by field, the password dots tick in and a shield check confirms access.",
    params: {
      email: { type: "string", default: "alex@acme.dev", description: "Prefilled email" },
      accentColor: { type: "color", default: "#10B981", description: "Brand accent" },
    },
    code: `
const card = _rb.rect("Login Card", 720, 640, { fill: "#0F141B", radius: 30, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 22, { from: 0.9, ease: "SpringOut", fade: false });
_rb.glow(card, __o.accentColor, 34, 0.3);
track("card", card);
const badge = _rb.circle("Brand Shield", 32, { fill: "#052E22", x: 0, y: 258 });
_rb.stroke(badge, __o.accentColor, 3, { capStyle: 1, trim: [0, 100] });
_rb.poly("Brand Hex", 74, 6, { fill: __o.accentColor, x: 0, y: 258, rotation: 0 });
_rb.text("A", 28, { color: "#04120C", x: 0, y: 258 });
_rb.pop(badge, 2, 14, { from: 0.001, ease: "SpringOut", fade: false });
_rb.text("Welcome back", 34, { color: "#F8FAFC", x: 0, y: 190 });
_rb.text("Sign in to your Acme workspace", 14, { color: "#64748B", x: 0, y: 156 });
_rb.textLeft("Work email", 12, -296, 100, { color: "#94A3B8" });
const emailField = _rb.rect("Email Field", 600, 62, { fill: "#111827", radius: 14, x: 0, y: 58, stroke: true, strokeColor: "#2A3648", strokeWidth: 2 });
_rb.textLeft(__o.email, 16, -276, 58, { color: "#E2E8F0" });
_rb.pop(emailField, 8, 16, { from: 0.92, ease: "SpringOut", fade: false });
_rb.textLeft("Password", 12, -296, -6, { color: "#94A3B8" });
const passField = _rb.rect("Password Field", 600, 62, { fill: "#111827", radius: 14, x: 0, y: -48, stroke: true, strokeColor: "#2A3648", strokeWidth: 2 });
_rb.pop(passField, 14, 16, { from: 0.92, ease: "SpringOut", fade: false });
for (let i = 0; i < 8; i++) {
  const dot = _rb.text("\\u2022", 22, { color: "#CBD5E1", x: -276 + i * 20, y: -48, name: "Password Dot " + i });
  _rb.pop(dot, 20 + i * 2, 8, { from: 0.001, ease: "SpringOut" });
}
const caret = _rb.rect("Password Caret", 2, 22, { fill: __o.accentColor, x: -104, y: -48 });
_rb.kf(caret, "opacity", [[38, 100], [48, 0], [58, 100]], "SlowInOut");
const signIn = _rb.rect("Sign In Button", 600, 62, { fill: __o.accentColor, radius: 14, x: 0, y: -152 });
_rb.glow(signIn, __o.accentColor, 22, 1.1);
const signLabel = _rb.text("Sign in", 18, { color: "#04120C", x: 0, y: -152 });
_rb.pop(signIn, 30, 16, { from: 0.85, ease: "SpringOut", fade: false });
track("button", signIn);
_rb.line("Or Rule", -160, -214, -74, -214, 1, "#27303F");
_rb.line("Or Rule B", 74, -214, 160, -214, 1, "#27303F");
_rb.text("or continue with SSO", 11, { color: "#475569", x: 0, y: -214 });
const sso = _rb.rect("SSO Button", 600, 58, { fill: "#111827", radius: 14, x: 0, y: -276, stroke: true, strokeColor: "#27303F", strokeWidth: 1 });
_rb.text("Continue with SSO", 16, { color: "#CBD5E1", x: 0, y: -276 });
_rb.pop(sso, 36, 16, { from: 0.92, ease: "SpringOut", fade: false });
_rb.kf(signIn, "scale.x", [[46, 1], [51, 1.03], [58, 1]], "SlowInOut");
_rb.kf(signIn, "scale.y", [[46, 1], [51, 1.03], [58, 1]], "SlowInOut");
_rb.fade(signIn, 49, 7, 100, 20, "SlowOut");
_rb.fade(signLabel, 49, 7, 100, 0, "SlowOut");
const ok = _rb.checkBadge("Login Check", 0, -152, 44, __o.accentColor, { glow: 18 });
_rb.pop(ok.circle, 50, 16, { from: 0.001, ease: "SpringOut" });
_rb.pop(ok.check, 50, 16, { from: 0.001, ease: "SpringOut" });
track("check", ok.circle);
_rb.text("Protected by Acme Identity", 11, { color: "#475569", x: 0, y: -330 });
`,
  },
  {
    id: "password_strength_meter",
    title: "Password Strength Meter",
    category: "security_auth",
    description: "Masked password characters tick in, the strength meter fills segment by segment and policy rules check off.",
    params: {
      accentColor: { type: "color", default: "#10B981", description: "Strong-state colour" },
      weakColor: { type: "color", default: "#EF4444", description: "Weak-state colour" },
    },
    code: `
const panel = _rb.rect("Strength Panel", 640, 560, { fill: "#0F141B", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.92, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Create a password", 24, -276, 214, { color: "#F8FAFC" });
_rb.textLeft("Use 8+ characters with a mix of letters, numbers and symbols", 12, -276, 182, { color: "#64748B" });
const field = _rb.rect("Password Field", 560, 66, { fill: "#111827", radius: 14, x: 0, y: 116, stroke: true, strokeColor: "#2A3648", strokeWidth: 2 });
for (let i = 0; i < 10; i++) {
  const dot = _rb.text("\\u2022", 24, { color: "#CBD5E1", x: -252 + i * 22, y: 116, name: "Password Bullet " + i });
  _rb.pop(dot, 4 + i * 3, 8, { from: 0.001, ease: "SpringOut" });
  if (i === 0) track("bullet", dot);
}
const eye = _rb.circle("Reveal Eye", 10, { fill: "#000000", alpha: 0, x: 246, y: 116 });
_rb.stroke(eye, "#64748B", 2, { capStyle: 1, trim: [0, 100] });
const segs = _rb.segmentRow("Strength Meter", 4, 560, 10, 0, 54, { gap: 8, fill: "#1F2937", radius: 5 });
const fills = [__o.weakColor, "#F59E0B", "#FBBF24", __o.accentColor];
for (let i = 0; i < 4; i++) {
  const sx = -280 + i * 142 + 71 - 71;
  const fill = _rb.rect("Meter Fill " + i, 134, 10, { fill: fills[i], radius: 5, x: sx + 71, y: 54 });
  _rb.anchor(fill, -1, 0);
  _rb.pos(fill, -280 + i * 142, 54);
  _rb.kf(fill, "scale.x", [[8 + i * 10, 0.001], [18 + i * 10, 1]], "SpringOut");
  if (i === 3) _rb.glow(fill, __o.accentColor, 14, 1.2);
  if (i === 0) track("meter", fill);
}
const labels = [
  { text: "Weak", colour: __o.weakColor, start: 8 },
  { text: "Fair", colour: "#F59E0B", start: 18 },
  { text: "Good", colour: "#FBBF24", start: 28 },
  { text: "Strong", colour: __o.accentColor, start: 38 }
];
for (let i = 0; i < labels.length; i++) {
  const l = _rb.text(labels[i].text, 13, { color: labels[i].colour, x: 0, y: 20, name: "Strength Label " + i });
  _rb.fade(l, labels[i].start, 6, 0, 100, "SlowOut");
  _rb.fade(l, labels[i].start + 10, 6, 100, 0, "SlowOut");
}
const strong = _rb.badge("Strong Badge", "\\u2713  Strong password", 0, -36, { fill: "#052E22", color: __o.accentColor, fontSize: 13, height: 32, stroke: true, strokeColor: "#065F46" });
_rb.pop(strong.pill, 44, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(strong.text, 44, 16, { from: 0.4, ease: "SpringOut", fade: false });
track("strong", strong.pill);
const rules = ["At least 8 characters", "One uppercase letter", "One number", "One special symbol"];
const met = [8, 18, 28, 38];
for (let i = 0; i < rules.length; i++) {
  const y = -96 - i * 40;
  const ring = _rb.circle("Rule Ring " + i, 11, { fill: "#000000", alpha: 0, x: -248, y: y });
  _rb.stroke(ring, "#334155", 2, { capStyle: 1, trim: [0, 100] });
  const tick = _rb.text("\\u2713", 14, { color: __o.accentColor, x: -248, y: y, name: "Rule Tick " + i });
  _rb.pop(tick, met[i], 10, { from: 0.001, ease: "SpringOut" });
  const label = _rb.textLeft(rules[i], 14, -224, y, { color: "#94A3B8" });
  _rb.fade(label, met[i], 8, 60, 100, "SlowOut");
}
_rb.textLeft("Strength checked locally - never stored", 11, -276, -272, { color: "#475569" });
`,
  },
  {
    id: "two_factor_code",
    title: "Two-Factor Code",
    category: "security_auth",
    description: "Six OTP cells fill one digit at a time with focus rings, then a verified check seals the login.",
    params: {
      code: { type: "string", default: "284196", description: "Six-digit code" },
      accentColor: { type: "color", default: "#10B981", description: "Verified colour" },
    },
    code: `
const card = _rb.rect("OTP Card", 620, 460, { fill: "#0F141B", radius: 28, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 22, { from: 0.9, ease: "SpringOut", fade: false });
track("card", card);
const icon = _rb.circle("Phone Icon", 34, { fill: "#111827", x: 0, y: 168 });
_rb.stroke(icon, __o.accentColor, 3, { capStyle: 1, trim: [0, 100] });
_rb.rect("Phone Icon Body", 16, 26, { fill: __o.accentColor, radius: 4, x: 0, y: 168 });
_rb.text("Check your phone", 26, { color: "#F8FAFC", x: 0, y: 108 });
_rb.text("We sent a 6-digit code to +1 (415) 555-0128", 13, { color: "#64748B", x: 0, y: 74 });
const raw = String(__o.code || "284196");
const digits = raw.padEnd(6, "0").slice(0, 6).split("");
for (let i = 0; i < 6; i++) {
  const x = -215 + i * 86;
  const box = _rb.rect("OTP Box " + i, 66, 82, { fill: "#111827", radius: 14, x: x, y: 4, stroke: true, strokeColor: "#2A3648", strokeWidth: 2 });
  const focus = _rb.rect("OTP Focus " + i, 66, 82, { fill: "#000000", alpha: 0, radius: 14, x: x, y: 4, stroke: true, strokeColor: __o.accentColor, strokeWidth: 3 });
  _rb.opacity(focus, 0);
  const start = 8 + i * 7;
  _rb.fade(focus, start - 5, 4, 0, 100, "SlowOut");
  _rb.fade(focus, start + 4, 5, 100, 0, "SlowOut");
  const digit = _rb.text(digits[i], 38, { color: "#F8FAFC", x: x, y: 4, name: "OTP Digit " + i });
  _rb.pop(digit, start, 12, { from: 0.001, ease: "SpringOut" });
  if (i === 0) track("cell", box);
  if (i === 5) track("lastDigit", digit);
}
const done = _rb.checkBadge("OTP Verified", 0, -106, 44, __o.accentColor, { glow: 18 });
_rb.pop(done.circle, 54, 18, { from: 0.001, ease: "SpringOut" });
_rb.pop(done.check, 54, 18, { from: 0.001, ease: "SpringOut" });
track("verified", done.circle);
_rb.text("Identity verified", 18, { color: "#F8FAFC", x: 0, y: -160 });
_rb.text("You will be redirected in a moment", 12, { color: "#64748B", x: 0, y: -188 });
_rb.textLeft("Didn't get a code?", 12, -252, -216, { color: "#64748B" });
_rb.textRight("Resend in 24s", 12, 252, -216, { color: __o.accentColor });
`,
  },
  {
    id: "biometric_face_scan",
    title: "Biometric Face Scan",
    category: "security_auth",
    description: "A phone face-scan reticle draws, a scan line sweeps the silhouette and the lock springs open with a verified check.",
    params: {
      accentColor: { type: "color", default: "#38BDF8", description: "Scan colour" },
      successColor: { type: "color", default: "#10B981", description: "Verified colour" },
    },
    code: `
const phone = _rb.phoneFrame("Face Phone", 380, 700, 0, 0, { fill: "#05080C", screenColor: "#0B111A", strokeColor: "#27303F", radius: 46 });
_rb.pop(phone.body, 0, 24, { from: 0.9, ease: "SpringOut", fade: false });
track("phone", phone.body);
const face = _rb.circle("Face Oval", 96, { fill: "#000000", alpha: 0, x: 0, y: 40 });
_rb.scale(face, 1, 1.22);
_rb.stroke(face, "#1E3A4A", 2, { capStyle: 1, trim: [0, 100] });
_rb.opacity(face, 80);
const eyeL = _rb.dot("Eye Left", -34, 66, 8, __o.accentColor, { glow: 8 });
const eyeR = _rb.dot("Eye Right", 34, 66, 8, __o.accentColor, { glow: 8 });
const nose = _rb.line("Nose Line", 0, 44, 0, 8, 2, "#1E3A4A");
const mouth = _rb.line("Mouth Line", -26, -20, 26, -20, 2, "#1E3A4A");
for (let i = 0; i < 4; i++) {
  const corner = _rb.rect("Reticle " + i, 34, 4, { fill: __o.accentColor, radius: 2, x: i % 2 ? 96 : -96, y: i < 2 ? 150 : -96, rotation: i % 2 ? 90 : 0 });
  _rb.opacity(corner, 70);
}
const scan = _rb.rect("Scan Line", 220, 3, { fill: __o.accentColor, radius: 2, x: 0, y: 150 });
_rb.glow(scan, __o.accentColor, 18, 1.6);
_rb.kf(scan, "position.y", [[12, 150], [16, -110], [20, 130], [24, -80], [28, 100]], "SlowInOut");
_rb.fade(scan, 10, 3, 0, 100, "SlowOut");
_rb.fade(scan, 30, 6, 100, 0, "SlowOut");
track("scan", scan);
const progress = _rb.circle("Scan Progress", 128, { fill: "#000000", alpha: 0, x: 0, y: 40 });
const ring = _rb.stroke(progress, __o.accentColor, 3, { capStyle: 1, trim: [0, 0] });
_rb.scale(progress, 1, 1.16);
_rb.kf(ring, "trimEnd", [[8, 0], [36, 100]], "SlowInSlowOut");
_rb.text("Face ID", 22, { color: "#F8FAFC", x: 0, y: -170 });
_rb.text("Position your face in the frame", 12, { color: "#64748B", x: 0, y: -200 });
const ok = _rb.checkBadge("Face Verified", 0, 40, 90, __o.successColor, { glow: 26 });
_rb.pop(ok.circle, 38, 20, { from: 0.001, ease: "SpringOut" });
_rb.pop(ok.check, 38, 20, { from: 0.001, ease: "SpringOut" });
track("verified", ok.circle);
_rb.sonar("Face Sonar", 0, 40, 70, __o.successColor, { count: 2, start: 38, gap: 8, duration: 30, width: 3, from: 70 });
_rb.badge("Face Status", "\\u2713  Face verified", 0, -248, { fill: "#052E22", color: __o.successColor, fontSize: 13, height: 32, stroke: true, strokeColor: "#065F46" });
_rb.textRight("Unlocked", 11, 168, -300, { color: __o.successColor });
`,
  },
  {
    id: "sso_redirect_flow",
    title: "SSO Redirect Flow",
    category: "security_auth",
    description: "An app hands off to an identity provider, a signed token travels back and the session is established.",
    params: {
      provider: { type: "string", default: "Okta", description: "Identity provider name" },
      accentColor: { type: "color", default: "#38BDF8", description: "Flow colour" },
      successColor: { type: "color", default: "#10B981", description: "Success colour" },
    },
    code: `
_rb.textLeft("SINGLE SIGN-ON", 12, -470, 292, { color: "#64748B" });
_rb.textRight("SAML 2.0", 12, 470, 298, { color: "#475569" });
function block(name, label, sub, x, colour, glyph) {
  const card = _rb.rect(name, 260, 170, { fill: "#111827", radius: 20, x: x, y: 0, stroke: true, strokeColor: "#2A3648", strokeWidth: 2 });
  _rb.circle(name + " Glyph BG", 30, { fill: "#0B1118", x: x, y: 48 });
  _rb.text(glyph, 24, { color: colour, x: x, y: 48, name: name + " Glyph" });
  _rb.text(label, 20, { color: "#F8FAFC", x: x, y: 2, name: name + " Label" });
  _rb.text(sub, 11, { color: "#64748B", x: x, y: -30, name: name + " Sub" });
  return card;
}
const app = block("SSO App", "Acme workspace", "app.acme.dev", -390, "#F8FAFC", "A");
const idp = block("SSO Provider", __o.provider, "identity provider", 0, __o.accentColor, "ID");
const done = block("SSO Session", "Session live", "signed in as alex", 390, __o.successColor, "\\u2713");
_rb.pop(app, 0, 20, { from: 0.9, ease: "SpringOut", fade: false });
_rb.pop(idp, 8, 20, { from: 0.9, ease: "SpringOut", fade: false });
_rb.pop(done, 36, 20, { from: 0.9, ease: "SpringOut", fade: false });
track("app", app);
track("provider", idp);
track("session", done);
const wire1 = _rb.line("SSO Wire 1", -250, 0, -140, 0, 4, __o.accentColor);
_rb.kf(wire1, "scale.x", [[12, 0.001], [24, 1]], "SlowInSlowOut");
const wire2 = _rb.line("SSO Wire 2", 140, 0, 252, 0, 4, __o.successColor);
_rb.kf(wire2, "scale.x", [[30, 0.001], [42, 1]], "SlowInSlowOut");
_rb.glow(wire2, __o.successColor, 14, 1.2);
track("wire", wire2);
const request = _rb.dot("SSO Request", -250, 0, 14, __o.accentColor, { glow: 16 });
_rb.kf(request, "position.x", [[12, -250], [26, -142]], "SlowInSlowOut");
_rb.fade(request, 26, 4, 100, 0, "SlowOut");
const token = _rb.dot("SSO Token", 140, 0, 14, __o.successColor, { glow: 16 });
_rb.fade(token, 30, 3, 0, 100, "SlowOut");
_rb.kf(token, "position.x", [[30, 140], [44, 252]], "SlowInSlowOut");
_rb.fade(token, 44, 4, 100, 0, "SlowOut");
const lock = _rb.rect("SSO Lock Body", 40, 32, { fill: __o.successColor, radius: 6, x: 0, y: 34 });
const shackle = _rb.circle("SSO Shackle", 15, { fill: "#000000", alpha: 0, x: 0, y: 54 });
_rb.stroke(shackle, __o.successColor, 5, { capStyle: 1, trim: [0, 100] });
_rb.kf(shackle, "position.y", [[40, 66], [48, 54]], "SpringOut");
_rb.text("SSO login", 13, { color: "#94A3B8", x: 0, y: -130 });
_rb.text("No password shared with the app", 11, { color: "#475569", x: 0, y: -152 });
_rb.badge("SSO Badge", "\\u2713  Identity verified", 390, 128, { fill: "#052E22", color: __o.successColor, fontSize: 12, height: 30 });
`,
  },
  {
    id: "permission_scope_dialog",
    title: "Permission Scope Dialog",
    category: "security_auth",
    description: "An OAuth consent sheet lists requested scopes; the approved ones tick, then the allow button confirms access.",
    params: {
      appName: { type: "string", default: "Acme Analytics", description: "Requesting app" },
      accentColor: { type: "color", default: "#10B981", description: "Approve colour" },
    },
    code: `
const modal = _rb.modal("OAuth Modal", 680, 680, { fill: "#0F141B", radius: 28, strokeColor: "#27303F", start: 0, duration: 22, dim: 45 });
track("modal", modal.card);
const appMark = _rb.circle("OAuth App Mark", 36, { fill: __o.accentColor, x: 0, y: 244 });
_rb.text("A", 26, { color: "#04120C", x: 0, y: 244 });
const shield = _rb.circle("OAuth Shield", 20, { fill: "#1E1B33", x: 46, y: 228 });
_rb.stroke(shield, "#A78BFA", 2, { capStyle: 1, trim: [0, 100] });
_rb.text("Access request", 12, { color: "#A78BFA", x: 0, y: 186 });
_rb.text(__o.appName + " wants to access your account", 22, { color: "#F8FAFC", x: 0, y: 148 });
_rb.text("Signed in as alex@acme.dev", 12, { color: "#64748B", x: 0, y: 118 });
const scopes = [
  { title: "Basic profile", sub: "Name, avatar, timezone" },
  { title: "Email address", sub: "alex@acme.dev" },
  { title: "Workspace content", sub: "Read projects and files" },
  { title: "Team directory", sub: "Members and roles" }
];
for (let i = 0; i < scopes.length; i++) {
  const y = 60 - i * 74;
  const row = _rb.rect("Scope Row " + i, 580, 62, { fill: "#111827", radius: 14, x: 0, y: y, stroke: true, strokeColor: "#1F2937", strokeWidth: 1 });
  const box = _rb.rect("Scope Box " + i, 24, 24, { fill: "#000000", alpha: 0, radius: 7, x: -258, y: y, stroke: true, strokeColor: "#475569", strokeWidth: 2 });
  const tick = _rb.text("\\u2713", 16, { color: "#04120C", x: -258, y: y, name: "Scope Tick " + i });
  _rb.fade(row, 8 + i * 5, 12, 0, 100, "SlowOut");
  const title = _rb.textLeft(scopes[i].title, 15, -228, y + 10, { color: "#E2E8F0" });
  const sub = _rb.textLeft(scopes[i].sub, 11, -228, y - 10, { color: "#64748B" });
  _rb.fade(title, 8 + i * 5, 12, 0, 100, "SlowOut");
  _rb.fade(sub, 8 + i * 5, 12, 0, 100, "SlowOut");
  const t = 30 + i * 7;
  _rb.pop(tick, t, 10, { from: 0.001, ease: "SpringOut" });
  _rb.fade(box, t - 4, 4, 0, 100, "SlowOut");
  _rb.fill(box, __o.accentColor);
  if (i === 0) track("scope", row);
}
const allow = _rb.rect("Allow Button", 280, 52, { fill: __o.accentColor, radius: 13, x: -150, y: -262 });
_rb.text("Allow access", 15, { color: "#04120C", x: -150, y: -262 });
const deny = _rb.rect("Deny Button", 280, 52, { fill: "#1E293B", radius: 13, x: 150, y: -262 });
_rb.text("Cancel", 15, { color: "#CBD5E1", x: 150, y: -262 });
_rb.pop(allow, 44, 16, { from: 0.85, ease: "SpringOut", fade: false });
_rb.pop(deny, 48, 16, { from: 0.85, ease: "SpringOut", fade: false });
_rb.glow(allow, __o.accentColor, 20, 1.1);
_rb.kf(allow, "scale.x", [[58, 1], [63, 1.04], [70, 1]], "SlowInOut");
_rb.kf(allow, "scale.y", [[58, 1], [63, 1.04], [70, 1]], "SlowInOut");
const ok = _rb.checkBadge("Scope Approved", -150, -262, 40, __o.accentColor, { glow: 16 });
_rb.pop(ok.circle, 62, 14, { from: 0.001, ease: "SpringOut" });
_rb.pop(ok.check, 62, 14, { from: 0.001, ease: "SpringOut" });
_rb.text("You can revoke access anytime in settings", 11, { color: "#475569", x: 0, y: -318 });
`,
  },
  {
    id: "encrypted_data_lock",
    title: "Encrypted Data Lock",
    category: "security_auth",
    description: "Ciphertext rows stream past as a padlock body springs in and its shackle snaps shut with an AES-256 seal.",
    params: {
      cipher: { type: "string", default: "AES-256-GCM", description: "Cipher suite" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Lock accent" },
    },
    code: `
const panel = _rb.rect("Vault Panel", 900, 560, { fill: "#0B0F14", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("ENCRYPTED AT REST", 12, -410, 232, { color: "#64748B" });
_rb.textLeft("Plaintext is never written to disk", 12, -410, 206, { color: "#334155" });
const hex = ["9f 3c a1 04", "e7 52 b8 1d", "44 0f d9 c2", "7a 18 6e 95", "c1 3b 52 88", "0d 9a f4 27", "b6 40 7c e1", "2e d5 08 9b"];
for (let i = 0; i < hex.length; i++) {
  const y = 156 - i * 48;
  const row = _rb.rect("Cipher Row " + i, 350, 38, { fill: "#111827", radius: 8, x: -235, y: y, stroke: true, strokeColor: "#1B2330", strokeWidth: 1 });
  _rb.textLeft(hex[i], 13, -390, y, { color: i % 3 === 0 ? "#A78BFA" : "#475569" });
  _rb.fade(row, 2 + i * 3, 10, 0, 100, "SlowOut");
  _rb.kf(row, "position.x", [[2 + i * 3, -280], [16 + i * 3, -235]], "SlowOut");
  if (i === 0) track("cipherRow", row);
}
const body = _rb.rect("Lock Body", 250, 190, { fill: "#15121F", radius: 30, x: 250, y: -40, stroke: true, strokeColor: "#332B52", strokeWidth: 3 });
_rb.glow(body, __o.accentColor, 30, 0.7);
_rb.pop(body, 8, 20, { from: 0.85, ease: "SpringOut", fade: false });
track("lock", body);
const shackle = _rb.ringPrim("Lock Shackle", 92, 22, { fill: "#4C4470", x: 250, y: 96 });
_rb.opacity(shackle, 90);
_rb.kf(shackle, "position.y", [[16, 136], [34, 96]], "SpringOut");
track("shackle", shackle);
_rb.circle("Keyhole Top", 16, { fill: __o.accentColor, x: 250, y: -18 });
_rb.rect("Keyhole Stem", 14, 34, { fill: __o.accentColor, radius: 5, x: 250, y: -46 });
_rb.glow(_rb.circle("Keyhole Glow", 8, { fill: __o.accentColor, x: 250, y: -18 }), __o.accentColor, 18, 1.6);
_rb.fade(body, 10, 12, 0, 100, "SlowOut");
const badge = _rb.badge("Cipher Badge", __o.cipher, 250, -180, { fill: "#1E1B33", color: "#C4B5FD", fontSize: 13, height: 32, stroke: true, strokeColor: "#332B52" });
_rb.pop(badge.pill, 40, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(badge.text, 40, 16, { from: 0.4, ease: "SpringOut", fade: false });
track("cipher", badge.pill);
const ok = _rb.checkBadge("Encryption Check", 250, 60, 58, __o.accentColor, { glow: 18 });
_rb.pop(ok.circle, 44, 16, { from: 0.001, ease: "SpringOut" });
_rb.pop(ok.check, 44, 16, { from: 0.001, ease: "SpringOut" });
_rb.sonar("Vault Sonar", 250, 60, 44, __o.accentColor, { count: 2, start: 46, gap: 8, duration: 28, width: 2, from: 60 });
_rb.text("Zero-knowledge encryption", 12, { color: "#475569", x: 250, y: -224 });
`,
  },
  {
    id: "threat_blocked_alert",
    title: "Threat Blocked Alert",
    category: "security_auth",
    description: "A red threat card shakes in while a radar sweep finds an intruder, then the block lands and the panel settles green.",
    params: {
      ip: { type: "string", default: "185.220.101.4", description: "Blocked source IP" },
      alertColor: { type: "color", default: "#EF4444", description: "Threat colour" },
      safeColor: { type: "color", default: "#10B981", description: "Secure colour" },
    },
    code: `
const panel = _rb.rect("Threat Panel", 900, 520, { fill: "#120D11", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#3F1D24", strokeWidth: 2 });
_rb.pop(panel, 0, 18, { from: 0.94, ease: "SpringOut", fade: false });
_rb.kf(panel, "position.x", [[6, 8], [10, -8], [14, 5], [18, 0]], "SlowOut");
track("panel", panel);
const radar = _rb.circle("Radar", 150, { fill: "#0B0F14", alpha: 0, x: -240, y: 20 });
_rb.stroke(radar, "#3F1D24", 3, { capStyle: 1, trim: [0, 100] });
const radar2 = _rb.circle("Radar Inner", 100, { fill: "#000000", alpha: 0, x: -240, y: 20 });
_rb.stroke(radar2, "#2A1418", 2, { capStyle: 1, trim: [0, 100] });
_rb.line("Radar Cross H", -370, 20, -110, 20, 1, "#2A1418");
_rb.line("Radar Cross V", -240, 150, -240, -110, 1, "#2A1418");
const sweep = _rb.line("Radar Sweep", -240, 20, -240, -110, 3, __o.alertColor);
_rb.anchor(sweep, -1, 0);
_rb.kf(sweep, "rotation", [[0, 0], [60, 360]], "Linear");
_rb.glow(sweep, __o.alertColor, 14, 1.4);
_rb.opacity(sweep, 85);
const blip = _rb.dot("Radar Blip", -190, 78, 12, __o.alertColor, { glow: 18, glowIntensity: 1.8 });
_rb.kf(blip, "opacity", [[10, 0], [16, 100], [44, 100], [50, 0]], "SlowInOut");
track("blip", blip);
const panelRight = 190;
_rb.badge("Threat Badge", "THREAT DETECTED", panelRight, 168, { fill: "#2A1218", color: __o.alertColor, fontSize: 11, height: 26, stroke: true, strokeColor: "#5B1F28" });
_rb.textLeft("Suspicious login blocked", 30, -20, 112, { color: "#F8FAFC" });
_rb.textLeft("A request from a known bad network was denied.", 12, -20, 76, { color: "#94A3B8" });
const ipPill = _rb.badge("IP Badge", "IP  " + __o.ip, panelRight, 18, { fill: "#1A1114", color: "#FCA5A5", fontSize: 13, height: 30, stroke: true, strokeColor: "#3F1D24" });
_rb.pop(ipPill.pill, 12, 14, { from: 0.6, ease: "SpringOut", fade: false });
_rb.pop(ipPill.text, 12, 14, { from: 0.6, ease: "SpringOut", fade: false });
const blocked = _rb.badge("Blocked Badge", "BLOCKED", 120, -80, { fill: __o.alertColor, color: "#1A0608", fontSize: 13, height: 30 });
_rb.pop(blocked.pill, 24, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.pop(blocked.text, 24, 16, { from: 0.4, ease: "SpringOut", fade: false });
_rb.glow(blocked.pill, __o.alertColor, 18, 1.3);
track("blocked", blocked.pill);
_rb.textLeft("Risk score", 11, -20, -28, { color: "#64748B" });
const riskTrack = _rb.rect("Risk Track", 360, 8, { fill: "#2A1418", radius: 4, x: 160, y: -34 });
const riskFill = _rb.rect("Risk Fill", 360, 8, { fill: __o.alertColor, radius: 4, x: 160, y: -34 });
_rb.anchor(riskFill, -1, 0);
_rb.pos(riskFill, -20, -34);
_rb.kf(riskFill, "scale.x", [[16, 0.001], [38, 0.94]], "SlowInSlowOut");
_rb.textRight("94 / 100", 11, 340, -28, { color: __o.alertColor });
const safe = _rb.checkBadge("Safe Check", 190, -160, 34, __o.safeColor, { glow: 12 });
_rb.pop(safe.circle, 52, 14, { from: 0.001, ease: "SpringOut" });
_rb.pop(safe.check, 52, 14, { from: 0.001, ease: "SpringOut" });
_rb.textLeft("Workspace secure", 14, 218, -160, { color: __o.safeColor });
_rb.textLeft("Threat blocked  -  no data exposed", 12, 218, -184, { color: "#64748B" });
`,
  },
  {
    id: "session_timeout_clock",
    title: "Session Timeout Clock",
    category: "security_auth",
    description: "A countdown ring drains from 60 to zero, the padlock clicks shut and an extend-session action appears.",
    params: {
      seconds: { type: "int", default: 60, description: "Countdown seconds" },
      accentColor: { type: "color", default: "#38BDF8", description: "Countdown colour" },
      alertColor: { type: "color", default: "#F59E0B", description: "Warning colour" },
    },
    code: `
const panel = _rb.rect("Timeout Panel", 640, 640, { fill: "#0F141B", radius: 30, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.92, ease: "SpringOut", fade: false });
track("panel", panel);
const trackRing = _rb.circle("Timeout Track", 170, { fill: "#000000", alpha: 0, x: 0, y: 60 });
_rb.stroke(trackRing, "#1F2937", 16, { capStyle: 1, trim: [0, 100] });
const ring = _rb.circle("Timeout Ring", 170, { fill: "#000000", alpha: 0, x: 0, y: 60 });
const stroke = _rb.stroke(ring, __o.accentColor, 16, { capStyle: 1, trim: [0, 100] });
_rb.kf(stroke, "trimEnd", [[0, 100], [58, 0]], "SlowInSlowOut");
_rb.kf(ring, "rotation", [[0, 0], [58, -90]], "SlowInSlowOut");
track("ring", ring);
const secs = _rb.text(String(__o.seconds), 84, { color: "#F8FAFC", x: 0, y: 66 });
_rb.counter(secs, { from: __o.seconds, to: 0, start: 0, duration: 58, ease: "SlowInSlowOut", length: 2 });
_rb.text("seconds", 13, { color: "#64748B", x: 0, y: 10 });
track("countdown", secs);
_rb.text("Session expires", 26, { color: "#F8FAFC", x: 0, y: -136 });
_rb.text("You have been idle for 25 minutes", 13, { color: "#64748B", x: 0, y: -168 });
const warn = _rb.text("Extend to keep working", 13, { color: __o.alertColor, x: 0, y: -208 });
_rb.kf(warn, "opacity", [[34, 0], [44, 100]], "SlowOut");
const body = _rb.rect("Timeout Lock Body", 74, 56, { fill: "#1E293B", radius: 10, x: 250, y: 260, stroke: true, strokeColor: "#334155", strokeWidth: 2 });
const shackle = _rb.circle("Timeout Shackle", 26, { fill: "#000000", alpha: 0, x: 250, y: 286 });
_rb.stroke(shackle, "#334155", 7, { capStyle: 1, trim: [0, 100] });
_rb.kf(shackle, "position.y", [[48, 314], [56, 286]], "SpringOut");
_rb.kf(body, "position.y", [[48, 274], [56, 260]], "SpringOut");
const extend = _rb.rect("Extend Button", 320, 56, { fill: __o.accentColor, radius: 14, x: 0, y: -276 });
_rb.pop(extend, 56, 18, { from: 0.001, ease: "SpringOut" });
_rb.text("Extend session", 16, { color: "#04120C", x: 0, y: -276 });
_rb.glow(extend, __o.accentColor, 20, 1.2);
track("extend", extend);
const locked = _rb.badge("Locked Badge", "Session locked", 0, -228, { fill: "#2A1218", color: "#FCA5A5", fontSize: 12, height: 28, stroke: true, strokeColor: "#3F1D24" });
_rb.pop(locked.pill, 58, 14, { from: 0.5, ease: "SpringOut", fade: false });
_rb.pop(locked.text, 58, 14, { from: 0.5, ease: "SpringOut", fade: false });
_rb.text("Sign in again to continue", 11, { color: "#475569", x: 0, y: -306 });
`,
  },
  {
    id: "audit_log_stream",
    title: "Audit Log Stream",
    category: "security_auth",
    description: "Audit entries stream into a live console with actors, events and pass/warn states while a live dot beats.",
    params: {
      rows: { type: "int", default: 7, description: "Log rows (4-9)" },
      accentColor: { type: "color", default: "#10B981", description: "OK state colour" },
      warnColor: { type: "color", default: "#F59E0B", description: "Warn state colour" },
    },
    code: `
const n = Math.max(4, Math.min(9, __o.rows || 7));
const panel = _rb.rect("Audit Panel", 960, 640, { fill: "#0B0F14", radius: 22, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
_rb.textLeft("Audit log", 22, -430, 276, { color: "#F8FAFC" });
const live = _rb.dot("Audit Live", -298, 284, 8, __o.accentColor, { glow: 10 });
_rb.kf(live, "opacity", [[0, 100], [10, 30], [20, 100], [30, 30], [40, 100], [50, 30], [60, 100]], "SlowInOut");
_rb.textLeft("live", 11, -286, 270, { color: "#64748B" });
_rb.badge("Audit Range", "Last 24 hours", 380, 274, { fill: "#111827", color: "#94A3B8", fontSize: 11, height: 26, stroke: true, strokeColor: "#27303F" });
_rb.line("Audit Rule", -430, 232, 430, 232, 1, "#1F2937");
_rb.textLeft("TIME", 10, -430, 204, { color: "#475569" });
_rb.textLeft("ACTOR", 10, -330, 204, { color: "#475569" });
_rb.textLeft("EVENT", 10, -170, 204, { color: "#475569" });
_rb.textRight("RESULT", 10, 430, 204, { color: "#475569" });
const entries = [
  { time: "12:42:08", actor: "alex@acme.dev", event: "sso.login.success", ok: true },
  { time: "12:39:51", actor: "maya@acme.dev", event: "document.shared", ok: true },
  { time: "12:36:14", actor: "api_key:ci_82f", event: "token.rotated", ok: true },
  { time: "12:31:02", actor: "185.220.101.4", event: "login.blocked", ok: false },
  { time: "12:28:45", actor: "priya@acme.dev", event: "role.updated", ok: true },
  { time: "12:21:19", actor: "sam@acme.dev", event: "mfa.enrolled", ok: true },
  { time: "12:14:33", actor: "audit.bot", event: "policy.evaluated", ok: true },
  { time: "12:08:07", actor: "noah@acme.dev", event: "session.revoked", ok: false },
  { time: "12:01:56", actor: "alex@acme.dev", event: "workspace.export", ok: true }
];
for (let i = 0; i < n; i++) {
  const e = entries[i];
  const y = 164 - i * 46;
  const row = _rb.rect("Audit Row " + i, 860, 38, { fill: i % 2 === 0 ? "#0F151D" : "#0B0F14", radius: 8, x: 0, y: y });
  const time = _rb.textLeft(e.time, 12, -430, y, { color: "#64748B" });
  const actor = _rb.textLeft(e.actor, 12, -330, y, { color: "#CBD5E1" });
  const event = _rb.textLeft(e.event, 12, -170, y, { color: "#94A3B8" });
  const colour = e.ok ? __o.accentColor : __o.warnColor;
  const result = _rb.badge("Audit Result " + i, e.ok ? "PASS" : "FLAG", 392, y, { fill: e.ok ? "#052E22" : "#2A1D08", color: colour, fontSize: 10, height: 20 });
  _rb.fade(row, 4 + i * 4, 10, 0, 100, "SlowOut");
  _rb.kf(row, "position.x", [[4 + i * 4, -40], [18 + i * 4, 0]], "SlowOut");
  _rb.fade(time, 6 + i * 4, 10, 0, 100, "SlowOut");
  _rb.fade(actor, 6 + i * 4, 10, 0, 100, "SlowOut");
  _rb.fade(event, 6 + i * 4, 10, 0, 100, "SlowOut");
  _rb.fade(result.pill, 8 + i * 4, 10, 0, 100, "SlowOut");
  _rb.fade(result.text, 8 + i * 4, 10, 0, 100, "SlowOut");
  if (i === 3) track("flagged", result.pill);
  if (i === 0) track("row", row);
}
_rb.textLeft(__o.rows + " events  -  1 policy block", 11, -430, -292, { color: "#475569" });
_rb.textRight("export  -  filter", 11, 430, -292, { color: "#475569" });
`,
  },
];
