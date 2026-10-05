/** DOM id the Amap JS API must own. */
const AMAP_MOUNT_ID = "amap-mount";

function placeUser(map, position) {
  map.setZoom(15);
  map.setCenter(position);
  if (window.__mappaMarker) {
    window.__mappaMarker.setPosition(position);
    return;
  }
  window.__mappaMarker = new window.AMap.Marker({ position: position, title: "You" });
  map.add(window.__mappaMarker);
}

function locateWithBrowser(map) {
  if (!navigator.geolocation) return Promise.resolve(false);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gps = [position.coords.longitude, position.coords.latitude];
        const finish = (point) => {
          placeUser(map, point);
          resolve(true);
        };
        if (typeof window.AMap.convertFrom === "function") {
          window.AMap.convertFrom(gps, "gps", (status, result) => {
            finish(status === "complete" && result.locations && result.locations[0] ? result.locations[0] : gps);
          });
          return;
        }
        finish(gps);
      },
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

function locateUser() {
  const map = window.__mappaMap;
  const AMap = window.AMap;
  if (!map || !AMap) return Promise.resolve(false);
  if (typeof AMap.plugin !== "function") return locateWithBrowser(map);
  return new Promise((resolve) => {
    AMap.plugin("AMap.Geolocation", () => {
      if (!AMap.Geolocation) {
        locateWithBrowser(map).then(resolve);
        return;
      }
      if (!window.__mappaGeo) {
        window.__mappaGeo = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 10000,
          zoomToAccuracy: true,
          showButton: false,
          showMarker: true,
          showCircle: true,
        });
        map.addControl(window.__mappaGeo);
      }
      window.__mappaGeo.getCurrentPosition((status, result) => {
        if (status === "complete" && result.position) {
          map.setZoom(15);
          map.setCenter(result.position);
          resolve(true);
          return;
        }
        locateWithBrowser(map).then(resolve);
      });
    });
  });
}

/**
 * Inserts the mainland Amap JS API into #amap-mount.
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
    window.__mappaGeo = undefined;
    window.__mappaMarker = undefined;
    if (window.__mappaMap) window.__mappaMap.destroy();
    window.__mappaMap = new window.AMap.Map(AMAP_MOUNT_ID, {
      zoom: config.zoom || 11,
      center: config.center || [116.397, 39.909],
      viewMode: "2D",
    });
    const mount = document.getElementById(AMAP_MOUNT_ID);
    if (mount) mount.setAttribute("data-loaded", "true");
    locateUser();
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
