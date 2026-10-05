/** DOM id the Amap JS API must own. */
const AMAP_MOUNT_ID = "amap-mount";

function personPin(color, name, labeled) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative;width:0;height:0;pointer-events:none";
  const dot = document.createElement("div");
  dot.style.cssText = "position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:999px;background:" + color + ";border:3px solid #fff;box-shadow:0 1px 4px rgba(28,25,21,.45)";
  wrap.append(dot);
  if (labeled === false) return wrap;
  const label = document.createElement("div");
  label.textContent = name;
  label.style.cssText = "position:absolute;left:16px;top:-9px;font:600 12px/1.2 Georgia,serif;color:#1c1915;background:#f6f1e8;border:1px solid #d8cfc2;border-radius:999px;padding:3px 8px;white-space:nowrap";
  wrap.append(label);
  return wrap;
}

function centerPin(labeled) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative;width:0;height:0;pointer-events:none";
  const mark = document.createElement("div");
  mark.style.cssText = "position:absolute;left:-9px;top:-9px;width:18px;height:18px;background:#b8432f;border:3px solid #fff;transform:rotate(45deg);box-shadow:0 1px 4px rgba(28,25,21,.45)";
  wrap.append(mark);
  if (!labeled) return wrap;
  const label = document.createElement("div");
  label.textContent = "Center";
  label.style.cssText = "position:absolute;left:14px;top:-10px;font:600 12px/1.2 Georgia,serif;color:#1c1915;background:#f6f1e8;border:1px solid #1c1915;border-radius:999px;padding:3px 8px;white-space:nowrap";
  wrap.append(label);
  return wrap;
}

function placeUser(map, position) {
  const point = Array.isArray(position) ? position : [position.lng, position.lat];
  window.__mappaPoint = point;
  map.setZoom(15);
  map.setCenter(point);
  const pin = personPin("#b8432f", "You");
  if (window.__mappaMarker) {
    window.__mappaMarker.setPosition(point);
    if (window.__mappaMarker.setContent) window.__mappaMarker.setContent(pin);
    return;
  }
  window.__mappaMarker = new window.AMap.Marker({ position: point, title: "You", zIndex: 120, content: pin });
  map.add(window.__mappaMarker);
}

function locateUser() {
  const map = window.__mappaMap;
  const AMap = window.AMap;
  if (!map || !AMap || !navigator.geolocation) return Promise.resolve(false);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gps = [position.coords.longitude, position.coords.latitude];
        if (typeof AMap.convertFrom !== "function") {
          placeUser(map, gps);
          resolve(true);
          return;
        }
        let settled = false;
        const finish = (point) => {
          if (settled) return;
          settled = true;
          placeUser(map, point);
          resolve(true);
        };
        const timer = window.setTimeout(() => finish(gps), 4000);
        AMap.convertFrom(gps, "gps", (status, result) => {
          window.clearTimeout(timer);
          finish(status === "complete" && result.locations && result.locations[0] ? result.locations[0] : gps);
        });
      },
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
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
