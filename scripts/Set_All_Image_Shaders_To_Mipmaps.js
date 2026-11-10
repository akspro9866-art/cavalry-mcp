/**
 * Set_All_Image_Shaders_To_Mipmaps.js
 * Standalone Cavalry Script (adapted from phillip-motion/Canvalry-scripts)
 * Scans all imageShader and svgShape nodes in the active composition and enables
 * High + Mipmap filtering (filterQuality: 3) to prevent aliasing on 3D/camera moves.
 */
(function () {
  api.startUndoGroup("Set All Image Shaders to Mipmaps");
  try {
    var layers = api.getCompLayers(false) || [];
    var updated = 0;
    for (var i = 0; i < layers.length; i++) {
      var id = layers[i];
      var type = api.getLayerType(id);
      if (type === "imageShader" || type === "svgShape") {
        api.set(id, { filterQuality: 3, mipmaps: true });
        updated += 1;
      }
    }
    console.log("Enabled mipmap filtering on " + updated + " shader/vector layer(s).");
  } finally {
    api.endUndoGroup();
  }
})();
