# SaaS Motion Rules (strict)

Normative constraints for every SaaS-style comp this server generates. These
rules exist because the two dominant failure modes in generated motion are
**pacing errors** (text on screen too briefly to read) and **timing
hallucination** (hand-computed keyframe frame numbers that drift out of sync
with the declarative timeline). Both are mechanical problems with mechanical
rules. The injected `_mg` runtime exposes every primitive referenced here:
`_mg.timeline()` combinators, `_mg.solveSpring` / `_mg.bakeSpringKeyframes`,
`_mg.animateCounter`, and `_mg.PARTICLE_PRESETS`.

---

## 1. Typography pacing

- **Minimum hold**: every readable text element holds for at least
  `max(36, wordCount × 12)` frames at 60 fps before its exit begins.
  - One word → 36 frames (0.6 s). A 7-word sentence → 84 frames (1.4 s).
  - Hold frames run *after* the entry settles, *before* any exit.
- **Kinetic word stagger**: when animating words individually (kinetic
  typography), the stagger between word starts is **3 to 5 frames** — never 0
  (reads as a block wipe) and never >5 (reads as a typewriter, not kinetic type).
- **Word timing source**: when a voiceover drives kinetic type, timings come
  from the refclone audio pipeline (`extract_kinetic_word_timings`, word-level
  `{ startFrame, endFrame }`), not from estimates. Only use the formula above
  when there is no audio track.
- Emphasis words (numbers, prices, CTAs) use `_mg.animateCounter` or a spring
  (`stiffness: 180, damping: 18`) — never a linear pop.

## 2. Visual hierarchy (spatial constraints)

- **Primary focal card**: the one UI card the viewer must read occupies
  **55%–70% of the viewport area** (e.g. 950–1200 px wide in a 1280×720 comp).
  Secondary cards sit at 20–35%; anything below 12% is decoration.
- **Safe margins**: every element keeps **≥ 8% padding from composition
  edges** (≥ 102 px horizontal in 1280-wide, ≥ 58 px in 720-tall comps). No
  text, chart axis label, or logo may cross the margin at rest; transient
  overshoot from spring entry may, but must settle inside it.
- **Anchor discipline**: align focal cards to a center or rule-of-thirds
  anchor; never free-float. `x`/`y` are stated once, in round numbers, not
  nudged per preset.

## 3. Choreography (temporal constraints)

- **Enter** with an underdamped spring: `stiffness: 180, damping: 18`
  (`_mg.solveSpring` default in this spec — ~5–6% overshoot, settles < 1 s).
  Bake with `_mg.bakeSpringKeyframes` (extrema + inflections only, never
  per-frame spam).
- **Hold** with subtle micro-drift: `_mg.microBob`-style ±3.5 px at ~0.22
  rad/frame phase-shifted per element. The hold must never be a dead freeze.
- **Exit** in **60% of the entry duration**, using accelerated
  `cubic-bezier(0.4, 0.0, 1.0, 1.0)` (fast start, hard landing). Entries
  overshoot; exits never do.
- **Chains**: elements hand off — the next element's entry starts before the
  previous exit completes (overlap 20–30%), expressed with
  `tl.chain(...)` + `tl.delay(...)`, not with absolute frames.

## 4. Anti-hallucination gate (timing)

- **Forbidden**: raw keyframe frame numbers (`frame: 137`) in generated preset
  code whenever `tl.chain()`, `tl.all()`, or `tl.sequence()` can express the
  timing declaratively. Raw numbers are allowed only for: the comp's global
  `startFrame`/`endFrame` bounds, frame-rate conversions, and
  externally-measured timings (e.g. whisper word frames).
- **Required**: build each scene as
  `const tl = _mg.timeline({ fps: 60 })` and compose
  `tl.all(...)` (parallel), `tl.chain(...)` (sequential),
  `tl.sequence(stagger, ...)` (staggered), `tl.delay(frames, task)`,
  `tl.waitFor(frames)`. The cursor lands on the latest endFrame; presets must
  read `tl.frame`/`tl.endFrame` instead of counting frames by hand.
- **Check**: if a diff adds or changes a literal frame argument inside an
  animation body (not a comp bound), reject it and re-express with a combinator.

---

## Compliance checklist (per generated comp)

1. Every text element's hold ≥ `max(36, wordCount × 12)` frames? (§1)
2. Word stagger within 3–5 frames? (§1)
3. Focal card 55–70% of viewport; ≥ 8% margins respected at rest? (§2)
4. Entries spring `180/18`; holds micro-drift; exits 60% entry duration with
   `(0.4, 0, 1, 1)`? (§3)
5. Zero raw frame numbers inside animation bodies — all timing via
   `tl.chain/all/sequence/delay/waitFor`? (§4)
6. Particles use a `_mg.PARTICLE_PRESETS` entry (`uiDust`, `confettiBurst`,
   `dataStream`) instead of ad-hoc per-particle keyframes? (§3/§4)
