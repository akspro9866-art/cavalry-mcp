/**
 * Easey.js
 * Standalone Cavalry Script (adapted from phillip-motion/Canvalry-scripts Easey)
 * Applies SpringOut / OvershootOut Magic Easing or damped spring curves across all
 * animated attributes of the currently selected layers.
 */
(function () {
  api.startUndoGroup("Easey Magic Spring");
  try {
    var targetEase = "SpringOut";
    var selection = api.getSelection() || [];
    for (var i = 0; i < selection.length; i++) {
      var id = selection[i];
      var attrs = typeof api.getAnimatedAttributes === "function" ? api.getAnimatedAttributes(id) || [] : [];
      for (var a = 0; a < attrs.length; a++) {
        var attr = attrs[a];
        var frames = typeof api.getKeyframeTimes === "function" ? api.getKeyframeTimes(id, attr) || [] : [];
        for (var f = 0; f < frames.length - 1; f++) {
          api.magicEasing(id, attr, frames[f], targetEase);
        }
      }
    }
  } finally {
    api.endUndoGroup();
  }
})();
