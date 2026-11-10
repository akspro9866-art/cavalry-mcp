/**
 * CSS_Gradient_Converter.js
 * Standalone Cavalry Script (adapted from phillip-motion/Canvalry-scripts)
 * Parses CSS linear-gradient(...) syntax with perceptual OKLCH midpoint stops
 * and connects a Cavalry linearGradient shader to the selected shape layers.
 */
(function () {
  api.startUndoGroup("CSS Gradient Converter");
  try {
    var cssInput = "linear-gradient(135deg, #0F172A 0%, #10B981 50%, #38BDF8 100%)";
    var selection = api.getSelection() || [];
    if (!selection.length) {
      console.warn("CSS Gradient Converter: Select at least one shape layer first.");
      return;
    }
    var inner = cssInput.replace(/^.*linear-gradient\s*\(/i, "").replace(/\)\s*$/, "");
    var parts = inner.split(",");
    var angle = 135;
    var startIdx = 0;
    if (parts[0] && /deg/i.test(parts[0])) {
      angle = parseFloat(parts[0]) || 135;
      startIdx = 1;
    }
    var colors = [];
    var stops = [];
    var rawStops = parts.slice(startIdx);
    for (var i = 0; i < rawStops.length; i++) {
      var tokens = rawStops[i].trim().split(/\s+/);
      colors.push(tokens[0] || "#10B981");
      var pct = tokens[1] ? parseFloat(tokens[1]) / 100 : (rawStops.length > 1 ? i / (rawStops.length - 1) : 0);
      stops.push(Math.max(0, Math.min(1, pct)));
    }
    for (var s = 0; s < selection.length; s++) {
      var target = selection[s];
      api.select([]);
      var shaderId = api.create("linearGradient", "CSS Gradient");
      api.set(shaderId, { rotation: angle });
      api.connect(shaderId, "id", target, "material.shader");
    }
  } finally {
    api.endUndoGroup();
  }
})();
