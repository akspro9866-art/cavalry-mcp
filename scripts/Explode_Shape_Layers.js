/**
 * Explode_Shape_Layers.js
 * Standalone Cavalry Script (adapted from phillip-motion/Canvalry-scripts)
 * Breaks multi-contour editable shapes into individual child layers under a parent Null
 * while preserving world transforms.
 */
(function () {
  api.startUndoGroup("Explode Shape Layers");
  try {
    var selection = api.getSelection() || [];
    for (var i = 0; i < selection.length; i++) {
      var layerId = selection[i];
      var name = typeof api.getNiceName === "function" ? api.getNiceName(layerId) : "Shape";
      var pos = api.get(layerId, "position") || [0, 0];
      var rot = api.get(layerId, "rotation") || 0;
      var scl = api.get(layerId, "scale") || [1, 1];
      api.select([]);
      var group = api.create("null", name + " Exploded");
      api.set(group, { position: pos });
      api.set(group, { rotation: rot });
      api.set(group, { scale: scl });
      if (typeof api.getEditablePath === "function" && typeof api.createEditable === "function") {
        var pathObj = api.getEditablePath(layerId);
        var contours = pathObj && typeof pathObj.contours === "function" ? pathObj.contours() : [];
        for (var c = 0; c < contours.length; c++) {
          var part = api.createEditable(contours[c], name + " Contour " + (c + 1));
          api.parent(part, group);
        }
      }
      api.set(layerId, { hidden: true });
    }
  } finally {
    api.endUndoGroup();
  }
})();
