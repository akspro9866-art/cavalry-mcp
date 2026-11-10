/** Theme tokens and applyTheme retinting. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_THEME_SOURCE = String.raw`  theme() {
    return _rb.theme();
  },

  ASTRYX_THEMES: {
    neutral: { bgSurface: "#0F1115", cardFill: "#181B20", textPrimary: "#F3F4F6", textMuted: "#9CA3AF", accentPrimary: "#3B82F6", strokeColor: "#262A32", cardCornerRadius: 12, layoutPadding: 24 },
    matcha: { bgSurface: "#0D1512", cardFill: "#14221C", textPrimary: "#ECFDF5", textMuted: "#86EFAC", accentPrimary: "#10B981", strokeColor: "#1F352B", cardCornerRadius: 14, layoutPadding: 24 },
    gothic: { bgSurface: "#09090B", cardFill: "#121216", textPrimary: "#FAFAFA", textMuted: "#A1A1AA", accentPrimary: "#8B5CF6", strokeColor: "#27272A", cardCornerRadius: 6, layoutPadding: 20 },
    butter: { bgSurface: "#18150E", cardFill: "#241F14", textPrimary: "#FEFCE8", textMuted: "#FDE047", accentPrimary: "#EAB308", strokeColor: "#362E1D", cardCornerRadius: 16, layoutPadding: 24 },
    stone: { bgSurface: "#141413", cardFill: "#1F1E1D", textPrimary: "#F5F5F4", textMuted: "#A8A29E", accentPrimary: "#EA580C", strokeColor: "#2E2C2A", cardCornerRadius: 8, layoutPadding: 24 },
    chocolate: { bgSurface: "#16110E", cardFill: "#231B16", textPrimary: "#FAF5F0", textMuted: "#D6C2B2", accentPrimary: "#D97706", strokeColor: "#362922", cardCornerRadius: 12, layoutPadding: 24 },
    y2k: { bgSurface: "#0A0D1A", cardFill: "#131930", textPrimary: "#E0F2FE", textMuted: "#7DD3FC", accentPrimary: "#EC4899", strokeColor: "#253159", cardCornerRadius: 20, layoutPadding: 28 }
  },

  applySceneTheme(themeName = "neutral") {
    const rawKey = typeof themeName === "string" ? themeName.trim().toLowerCase() : "neutral";
    const key = Object.prototype.hasOwnProperty.call(this.ASTRYX_THEMES, rawKey) ? rawKey : "neutral";
    const palette = this.ASTRYX_THEMES[key];
    const tokens = Object.assign({ themeName: key }, palette);
    try {
      Object.assign(this.theme, tokens);
    } catch (e) {}
    try {
      globalThis.__mgAstryxTheme = tokens;
    } catch (e) {}
    try {
      this.applyTheme({
        colors: {
          background: palette.bgSurface,
          surface: palette.cardFill,
          card: palette.cardFill,
          primary: palette.accentPrimary,
          accent: palette.accentPrimary,
          text: palette.textPrimary,
          muted: palette.textMuted,
          border: palette.strokeColor
        },
        radius: {
          md: palette.cardCornerRadius,
          scale: palette.cardCornerRadius / 12
        },
        apply: false
      });
      if (globalThis.__mgTheme && typeof globalThis.__mgTheme === "object") {
        Object.assign(globalThis.__mgTheme, tokens);
      }
    } catch (e) {}
    try {
      const comp = api.getActiveComp();
      if (comp) {
        _rb.set(comp, { backgroundColor: _rb.c(palette.bgSurface) });
      }
    } catch (e) {}
    return tokens;
  },

  /**
   * Bind a palette / typography / radius theme to the scene and every preset.
   *
   * tokens = {
   *   colors: { primary, secondary, accent, text, muted, background, ... },
   *   typography: { font, style, scale },
   *   radius: { scale, sm, md, lg, pill },
   *   palette?: false, apply?: false, target?: "selection"|"preset"|"comp"|ids,
   *   ids?: string[], recolor?: false, registerOnly?: true
   * }
   *
   * Forward binding is automatic: _rb.c maps the catalogue's design colours
   * through the theme, so every preset compiled after this call picks it up.
   * Passing targets (or calling with a selection / tracked preset) also retints
   * existing layers in place, with no rebuild. applyTheme(null) clears the theme.
   */
  applyTheme(tokens) {
    if (tokens === null || tokens === undefined) {
      let prev = null;
      try { prev = globalThis.__mgTheme || null; delete globalThis.__mgTheme; } catch (e) {}
      return { cleared: true, previous: prev };
    }
    if (typeof tokens !== "object") throw new Error("applyTheme: tokens must be an object");

    const prev = this.theme() || {};
    const prevColors = prev.colors || {};
    const colors = {};
    const prevKeys = Object.keys(prevColors);
    for (let i = 0; i < prevKeys.length; i++) colors[prevKeys[i]] = prevColors[prevKeys[i]];
    const provided = tokens.colors || tokens.paletteColors || {};
    const providedKeys = Object.keys(provided);
    for (let i = 0; i < providedKeys.length; i++) {
      if (provided[providedKeys[i]] != null) colors[providedKeys[i]] = provided[providedKeys[i]];
    }

    const typography = Object.assign({}, prev.typography || {}, tokens.typography || {});
    const radius = Object.assign({}, prev.radius || {}, tokens.radius || {});
    const prevTypeScale = prev.typography && Number(prev.typography.scale) > 0 ? Number(prev.typography.scale) : 1;
    const prevRadiusScale = prev.radius && Number(prev.radius.scale) > 0 ? Number(prev.radius.scale) : 1;
    const theme = {
      colors: colors,
      typography: typography,
      radius: radius,
      at: Date.now(),
      palette: prev.palette || null
    };

    // Register the palette so artists can pick the same swatches by hand.
    if (tokens.palette !== false && tokens.register !== false) {
      let paletteId = null;
      try { paletteId = api.getScenePalette(); } catch (e) {}
      if (paletteId) {
        const swatches = {};
        const roleKeys = Object.keys(colors);
        for (let i = 0; i < roleKeys.length; i++) {
          const role = roleKeys[i];
          const reuse = prev.palette && prev.palette.id === paletteId &&
            prev.palette.swatches && prev.palette.swatches[role] != null &&
            prevColors[role] === colors[role];
          if (reuse) {
            swatches[role] = prev.palette.swatches[role];
            continue;
          }
          try {
            swatches[role] = api.addSceneSwatch(_rb.rawColor(colors[role]), "theme/" + role);
          } catch (e) {}
        }
        theme.palette = { id: paletteId, swatches: swatches };
      }
    }
    try { globalThis.__mgTheme = theme; } catch (e) {}

    let targets = [];
    if (Array.isArray(tokens.ids) && tokens.ids.length) {
      targets = tokens.ids.slice();
    } else if (tokens.target === "comp") {
      try { targets = api.getCompLayers(true) || []; } catch (e) { targets = []; }
    } else if (typeof tokens.target === "string" && tokens.target.indexOf("#") >= 0) {
      targets = [tokens.target];
    } else {
      try { targets = this.__patchTargets({ target: tokens.target || "auto" }); } catch (e) { targets = []; }
    }

    const all = [];
    const seen = {};
    const walk = (id, depth) => {
      if (!id || seen[id] || depth > 8) return;
      seen[id] = true;
      all.push(id);
      let kids = null;
      try { kids = api.getChildren(id); } catch (e) { kids = null; }
      if (kids && kids.length) {
        for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
      }
    };
    for (let i = 0; i < targets.length; i++) walk(targets[i], 0);

    const shouldApply = tokens.apply !== false && tokens.registerOnly !== true;
    let recolored = 0;
    let fonts = 0;
    let radii = 0;

    if (shouldApply) {
      const recolor = tokens.recolor !== false;
      const nextTypeScale = Number(typography.scale) > 0 ? Number(typography.scale) : 1;
      const fontRatio = prevTypeScale > 0 ? nextTypeScale / prevTypeScale : 1;
      const nextRadiusScale = Number(radius.scale) > 0 ? Number(radius.scale) : 1;
      const radiusRatio = prevRadiusScale > 0 ? nextRadiusScale / prevRadiusScale : 1;

      for (let i = 0; i < all.length; i++) {
        const id = all[i];
        let type = "";
        try { type = api.getLayerType(id) || ""; } catch (e) {}

        if (recolor) {
          let colorAttr = null;
          if (type === "basicShape" || type === "textShape") colorAttr = "material.materialColor";
          else if (type === "strokeMaterial") colorAttr = "strokeColor";
          else if (type === "glowFilter") colorAttr = "glowColor";
          if (colorAttr) {
            let current = null;
            try { current = api.get(id, colorAttr); } catch (e) { current = null; }
            if (current != null) {
              const mapped = _rb.themeColor(current);
              if (_rb.hex(mapped) !== _rb.hex(current)) {
                try {
                  _rb.set(id, _rb.one(colorAttr, mapped));
                  recolored += 1;
                } catch (e) {}
              }
            }
          }
        }

        if (type === "textShape") {
          if (typography.font) {
            try {
              _rb.set(id, { font: { font: typography.font, style: typography.style || "Regular" } });
              fonts += 1;
            } catch (e) {}
          }
          if (fontRatio !== 1) {
            try {
              const size = Number(api.get(id, "fontSize")) || 0;
              if (size) {
                _rb.set(id, { fontSize: size * fontRatio });
                fonts += 1;
              }
            } catch (e) {}
          }
        }

        if (type === "basicShape" && radiusRatio !== 1) {
          try {
            const r = Number(api.get(id, "generator.cornerRadius")) || 0;
            if (r) {
              _rb.set(id, { "generator.cornerRadius": r * radiusRatio });
              radii += 1;
            }
          } catch (e) {}
        }
      }
    }

    return {
      theme: { colors: colors, typography: typography, radius: radius },
      palette: theme.palette,
      targets: targets,
      recolored: recolored,
      fonts: fonts,
      radii: radii,
      applied: shouldApply
    };
  },

  /**
   * Attach a behaviour to an attribute without rebuilding the layer.
   *
   *   _mg.modulate(layerId, "position.y", "organicFloat")
   *   _mg.modulate(layerId, ["rotation", "opacity"], { type: "organicFloat", amplitude: 12 })
   *   _mg.modulate(layerId, "scale.x", { type: "spring", amplitude: 0.2, duration: 40 })
   *   _mg.modulate(duplicatorId, "shapeTimeOffset", { type: "staggerFalloff", offset: 3 })
   *
   * organicFloat creates a noise node (or oscillator when type is oscillator);
   * spring has no native node in Cavalry 2.8, so it bakes a damped cosine into
   * keyframes; staggerFalloff wires a falloff into a stagger on the target.
   *
   * Every branch is idempotent: a node of the requested type already driving that
   * attribute is retuned in place and reported under reused, and the wire is
   * skipped when it is already connected. Pass force to build a second node.
   * stiffness / dampingRatio / overshoot / holdFrames are taken through _mg.rig.
   */
`;
