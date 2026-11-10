/**
 * Localiser.js
 * Standalone Cavalry Script (adapted from phillip-motion/Canvalry-scripts Localiser)
 * Swaps textShape strings across locale variants and resizes auto-sizing pill backgrounds
 * using live api.getBoundingBox measurements.
 */
(function () {
  api.startUndoGroup("Localiser Batch Swap");
  try {
    var locales = {
      en: "Start free trial",
      de: "Kostenlos testen",
      ja: "無料トライアルを開始",
      es: "Iniciar prueba gratis"
    };
    var activeLocale = "de";
    var padX = 28;
    var padY = 16;
    var selection = api.getSelection() || [];
    for (var i = 0; i < selection.length; i++) {
      var id = selection[i];
      if (api.getLayerType(id) === "textShape") {
        api.set(id, { text: locales[activeLocale] });
        var bb = api.getBoundingBox(id, false);
        var parentId = typeof api.getParent === "function" ? api.getParent(id) : null;
        if (parentId && bb && bb.width && bb.height) {
          api.set(parentId, { "generator.dimensions": [bb.width + padX * 2, bb.height + padY * 2] });
        }
      }
    }
  } finally {
    api.endUndoGroup();
  }
})();
