/** DOM id the Amap JS API must own. */
const AMAP_MOUNT_ID = "amap-mount";

/**
 * Inserts the mainland Amap JS API into #amap-mount.
 * Not called until a Web (JS API) key exists.
 *
 *   loadAmap({ key, securityJsCode, center: [116.397, 39.909], zoom: 11 });
 */
function loadAmap(config) {
  const key = (config.key || "").trim();
  const securityJsCode = (config.securityJsCode || "").trim();
  if (!key || !securityJsCode) {
    return Promise.reject(new Error("Amap key and security code are required."));
  }
  window._AMapSecurityConfig = { securityJsCode };
  const paint = () => {
    if (!window.AMap) throw new Error("Amap loaded without a map constructor.");
    new window.AMap.Map(AMAP_MOUNT_ID, {
      zoom: config.zoom || 11,
      center: config.center || [116.397, 39.909],
      viewMode: "2D",
    });
    const mount = document.getElementById(AMAP_MOUNT_ID);
    if (mount) mount.setAttribute("data-loaded", "true");
  };
  if (window.AMap) {
    paint();
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://webapi.amap.com/maps?v=2.0&key=" + encodeURIComponent(key);
    script.async = true;
    script.onload = () => {
      try {
        paint();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error("Amap script could not be loaded."));
    document.head.appendChild(script);
  });
}
