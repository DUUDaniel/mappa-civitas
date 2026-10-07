const SPORTS = [
  { id: "basketball", label: "Basketball", keyword: "篮球场", fallback: "basketball court" },
  { id: "tennis", label: "Tennis", keyword: "网球场", fallback: "tennis court" },
  { id: "table-tennis", label: "Table tennis", keyword: "乒乓球馆", fallback: "table tennis" },
  { id: "badminton", label: "Badminton", keyword: "羽毛球场", fallback: "badminton" },
  { id: "golf", label: "Golf", keyword: "高尔夫球场", fallback: "golf course" },
  { id: "bowling", label: "Bowling", keyword: "保龄球馆", fallback: "bowling" },
  { id: "football", label: "Football", keyword: "足球场", fallback: "football pitch" },
  { id: "go-karting", label: "Go-karting", keyword: "卡丁车", fallback: "go kart" },
];

const MODES = [
  { id: "drive", label: "Car" },
  { id: "rail", label: "Light rail" },
  { id: "transit", label: "Public" },
  { id: "walk", label: "Walk" },
  { id: "cycle", label: "Cycle" },
];

const COLORS = ["#b8432f", "#1c1915", "#2f6b4f", "#8a5a2b", "#3d4f7c", "#6b3d5a"];

const state = {
  sport: null,
  courts: [],
  activeCourt: null,
  loading: false,
  note: "",
  partners: [],
  you: null,
  picked: null,
  mode: "drive",
  legs: {},
  routing: false,
  adding: false,
  scoring: false,
  moving: false,
  city: "",
  ranked: [],
  labels: true,
  transitLoading: false,
  transitFor: "",
  detailing: false,
};

let overlays = [];
let peopleOverlays = [];
let pluginsReady = null;
const legJobs = {};

function km(a, b) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function stepsEl() {
  const list = el("ol", "steps");
  [
    "Tap My location, or type your location if the pin is wrong.",
    "Choose a sport.",
    "Add each partner and where they start. A full place works best, such as Guomao, Beijing.",
    "Tap Find courts by car. Courts are ordered by total driving time.",
    "Open a court for hours, rating, and phone. A short note explains the bus or metro for each person. Then try Light rail, Public, Walk, or Cycle.",
  ].forEach((text, index) => {
    const item = el("li");
    const num = el("span", "num", String(index + 1));
    item.append(num, el("span", "", text));
    list.append(item);
  });
  return list;
}

function people() {
  return state.you ? [state.you, ...state.partners] : state.partners;
}

function cleanMetric(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text || text === "[]" || Number(text) === 0) return "";
  return text.replace(/\.00$/, "");
}

function textField() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (typeof value === "string" && value.trim() && value.trim() !== "[]") return value.trim();
  }
  return "";
}

function photoUrls(poi) {
  return (poi.photos || [])
    .map((photo) => (photo && typeof photo.url === "string" ? photo.url : ""))
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 2);
}

function bizOf(poi) {
  return poi.biz_ext || poi.bizExt || {};
}

function formatMinutes(minutes) {
  const whole = Math.max(0, Math.round(Number(minutes) || 0));
  if (whole < 60) return whole + " min";
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? hours + " h " + rest + " min" : hours + " h";
}

function durationPhrase(minutes) {
  const whole = Math.max(0, Math.round(Number(minutes) || 0));
  if (whole < 60) return whole + (whole === 1 ? " minute" : " minutes");
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const hourWord = hours === 1 ? " hour" : " hours";
  return rest ? hours + hourWord + " " + rest + " min" : hours + hourWord;
}

function describeCourt(court, count, totalMinutes) {
  const kind = (court.type || "sports court").split(";").pop().trim() || "sports court";
  const place = [court.area, court.district, court.city].filter(Boolean).join(", ");
  const where = place || court.address || "the area around the group";
  const group = count === 1 ? "1 person" : count + " people";
  const time = durationPhrase(totalMinutes);
  let text = court.name + " is a " + kind + " in " + where + ".";
  if (court.hours) text += " Hours: " + court.hours + ".";
  if (court.rating) text += " Rated " + court.rating + " out of 5.";
  if (court.cost) text += " About ¥" + court.cost + ".";
  if (court.tel) text += " Phone " + court.tel + ".";
  text += " By car, about " + time + " in total for " + group + ".";
  return text;
}

function courtFacts(court) {
  const kind = (court.type || "").split(";").pop().trim();
  return [kind, court.rating ? court.rating + " / 5" : "", court.hours, court.cost ? "about ¥" + court.cost : "", court.area, court.address, court.tel]
    .filter(Boolean)
    .join(" · ");
}

function ensurePlugins() {
  if (!pluginsReady) {
    pluginsReady = new Promise((resolve, reject) => {
      if (!window.AMap || typeof window.AMap.plugin !== "function") {
        pluginsReady = null;
        reject(new Error("map"));
        return;
      }
      window.AMap.plugin(["AMap.PlaceSearch", "AMap.AutoComplete", "AMap.Geocoder", "AMap.Driving", "AMap.Walking", "AMap.Riding", "AMap.Transfer"], () => resolve());
    });
  }
  return pluginsReady;
}

function clearOverlays() {
  overlays.forEach((item) => item.setMap && item.setMap(null));
  overlays = [];
}

function addOverlay(overlay) {
  if (!overlay || !window.__mappaMap) return;
  window.__mappaMap.add(overlay);
  overlays.push(overlay);
}

function fit() {
  const view = [window.__mappaMarker, ...peopleOverlays, ...overlays].filter(Boolean);
  if (view.length && window.__mappaMap && window.__mappaMap.setFitView) {
    window.__mappaMap.setFitView(view, false, [56, 56, 56, 56]);
  }
}

function showPeople(group, fitView, labeled) {
  peopleOverlays.forEach((item) => item.setMap && item.setMap(null));
  peopleOverlays = [];
  if (!window.AMap || !window.__mappaMap) return;
  (group || []).forEach((person, index) => {
    const pin = personPin(COLORS[index % COLORS.length], person.name, labeled !== false);
    if (person.name === "You") {
      window.__mappaPoint = person.position;
      if (window.__mappaMarker) {
        window.__mappaMarker.setPosition(person.position);
        if (window.__mappaMarker.setContent) window.__mappaMarker.setContent(pin);
        return;
      }
      window.__mappaMarker = new window.AMap.Marker({ position: person.position, title: "You", zIndex: 120, content: pin });
      window.__mappaMap.add(window.__mappaMarker);
      return;
    }
    const marker = new window.AMap.Marker({ position: person.position, title: person.name, zIndex: 120, content: pin });
    window.__mappaMap.add(marker);
    peopleOverlays.push(marker);
  });
  if (fitView !== false) fit();
}

function showCourts(courts, activeId) {
  clearOverlays();
  courts.forEach((court) => {
    addOverlay(new window.AMap.Marker({
      position: court.position,
      title: court.name,
      label: court.id === activeId ? { content: court.name, direction: "right" } : undefined,
    }));
  });
  const focus = courts.find((court) => court.id === activeId);
  if (focus) {
    window.__mappaMap.setCenter(focus.position);
    window.__mappaMap.setZoom(15);
    return;
  }
  fit();
}

function dedupe(courts) {
  const seen = {};
  return courts.filter((court) => {
    if (seen[court.id]) return false;
    seen[court.id] = true;
    return true;
  });
}

function namedPlace(value) {
  if (Array.isArray(value)) {
    const text = value.find((item) => typeof item === "string" && item.trim() && item.trim() !== "[]");
    return text ? text.trim() : "";
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text && text !== "[]" ? text : "";
  }
  return "";
}

function cityOfPoi(poi) {
  const city = namedPlace(poi.cityname) || namedPlace(poi.city);
  if (city) return city;
  const province = namedPlace(poi.province) || namedPlace(poi.pname);
  if (/北京|上海|天津|重庆|香港|澳门/.test(province)) return province;
  return "";
}

function readPoi(keyword, poi, index) {
  const address = namedPlace(poi.address);
  const city = cityOfPoi(poi);
  const district = namedPlace(poi.adname);
  const full = address && city && address.includes(city) ? address : [city, district, address].filter(Boolean).join("");
  return {
    id: poi.id || keyword + index + (poi.location ? poi.location.lng : ""),
    name: poi.name,
    address: full,
    type: poi.type || "",
    city: city,
    tel: poi.tel || "",
    district: poi.adname || "",
    area: textField(poi.business_area, poi.businessArea, bizOf(poi).business_area),
    website: textField(poi.website),
    hours: textField(bizOf(poi).open_time, bizOf(poi).opentime2, bizOf(poi).opentime),
    rating: cleanMetric(bizOf(poi).rating),
    cost: cleanMetric(bizOf(poi).cost),
    photos: photoUrls(poi),
    position: [poi.location.lng, poi.location.lat],
  };
}

function realPoiId(id) {
  return /^[A-Z0-9]{8,}$/.test(id || "");
}

function prefer(current, next) {
  if (Array.isArray(current) || Array.isArray(next)) return (next && next.length ? next : current) || [];
  return next || current || "";
}

function mergeDetail(court, poi) {
  if (!poi || !poi.location) return court;
  const extra = readPoi(court.name, poi, "detail");
  return {
    ...court,
    address: prefer(court.address, extra.address),
    type: prefer(court.type, extra.type),
    city: prefer(court.city, extra.city),
    tel: prefer(court.tel, extra.tel),
    district: prefer(court.district, extra.district),
    area: prefer(court.area, extra.area),
    website: prefer(court.website, extra.website),
    hours: prefer(court.hours, extra.hours),
    rating: prefer(court.rating, extra.rating),
    cost: prefer(court.cost, extra.cost),
    photos: prefer(court.photos, extra.photos),
  };
}

function poiDetails(id) {
  return new Promise((resolve) => {
    if (!realPoiId(id) || !window.AMap || !window.AMap.PlaceSearch) {
      resolve(null);
      return;
    }
    const timer = window.setTimeout(() => resolve(null), 7000);
    new window.AMap.PlaceSearch({ extensions: "all" }).getDetails(id, (status, result) => {
      window.clearTimeout(timer);
      const list = result && result.poiList && result.poiList.pois;
      const poi = status === "complete" ? (list && list[0]) || result.poi || null : null;
      resolve(poi);
    });
  });
}

async function enrichCourts(courts) {
  const out = [];
  for (let index = 0; index < courts.length; index += 6) {
    const slice = courts.slice(index, index + 6);
    const details = await Promise.all(slice.map((court) => poiDetails(court.id)));
    slice.forEach((court, offset) => out.push(mergeDetail(court, details[offset])));
  }
  return out;
}

function searchCourts(keyword, center, radius) {
  return ensurePlugins().then(async () => {
    const page = (pageIndex) => new Promise((resolve) => {
      const search = new window.AMap.PlaceSearch({ pageSize: 50, pageIndex: pageIndex, extensions: "all" });
      const timer = window.setTimeout(() => resolve([]), 8000);
      search.searchNearBy(keyword, center, Math.min(radius || 50000, 50000), (status, result) => {
        window.clearTimeout(timer);
        const pois = status === "complete" && result.poiList ? result.poiList.pois || [] : [];
        resolve(pois.filter((poi) => poi.location && poi.name).map((poi, index) => readPoi(keyword, poi, pageIndex + "-" + index)));
      });
    });
    const first = await page(1);
    const second = first.length >= 40 ? await page(2) : [];
    return dedupe(first.concat(second));
  });
}

function searchInCity(keyword, city) {
  return ensurePlugins().then(async () => {
    if (!city) return [];
    const page = (pageIndex) => new Promise((resolve) => {
      const search = new window.AMap.PlaceSearch({ pageSize: 50, pageIndex: pageIndex, extensions: "all", city: city, citylimit: true });
      const timer = window.setTimeout(() => resolve([]), 8000);
      search.search(keyword, (status, result) => {
        window.clearTimeout(timer);
        const pois = status === "complete" && result.poiList ? result.poiList.pois || [] : [];
        resolve(pois.filter((poi) => poi.location && poi.name).map((poi, index) => readPoi(keyword, poi, "c" + pageIndex + index)));
      });
    });
    const pages = [];
    for (let index = 1; index <= 3; index += 1) {
      const rows = await page(index);
      pages.push(rows);
      if (rows.length < 40) break;
    }
    return dedupe(pages.flat());
  });
}

const CITY_ALIASES = [
  ["北京", ["北京", "beijing", "peking"]],
  ["上海", ["上海", "shanghai"]],
  ["广州", ["广州", "guangzhou"]],
  ["深圳", ["深圳", "shenzhen"]],
  ["成都", ["成都", "chengdu"]],
  ["杭州", ["杭州", "hangzhou"]],
  ["南京", ["南京", "nanjing"]],
  ["武汉", ["武汉", "wuhan"]],
  ["西安", ["西安", "xian", "xi'an"]],
  ["重庆", ["重庆", "chongqing"]],
  ["天津", ["天津", "tianjin"]],
  ["苏州", ["苏州", "suzhou"]],
  ["厦门", ["厦门", "xiamen"]],
  ["青岛", ["青岛", "qingdao"]],
  ["长沙", ["长沙", "changsha"]],
  ["香港", ["香港", "hong kong", "hongkong"]],
];

function mentionedCity(query) {
  const text = query.trim().toLowerCase();
  for (const pair of CITY_ALIASES) {
    if (pair[1].some((name) => standalone(text, name))) return pair[0];
  }
  return "";
}

function standalone(text, name) {
  if (/[a-z]/i.test(name)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(?:^|[^a-z])" + escaped + "(?:$|[^a-z])", "i").test(text);
  }
  if (text.includes(name + "市")) return true;
  return text.split(/[\s,，]+/).some((part) => part === name);
}

function homeCity(home) {
  const trimmed = String(home || "").replace(/市$/, "").trim();
  if (!trimmed || /省|自治区|全国/.test(home || "")) return "";
  return trimmed;
}

function solidTip(tips, query) {
  const ready = tips.filter((tip) => tip && tip.name && tip.location && tip.location.lng != null && !/停车场|公厕|出入口/.test(tip.name));
  const skipStay = !/酒店|招待所|宾馆/.test(query || "");
  const places = ready.filter((tip) => {
    if (/地铁站|公交站/.test(tip.name)) return false;
    if (skipStay && /招待所|酒店|宾馆/.test(tip.name)) return false;
    return true;
  });
  return places[0] || ready[0] || null;
}

function askTips(keyword, city, limit) {
  return new Promise((resolve) => {
    if (!window.AMap.AutoComplete) {
      resolve([]);
      return;
    }
    const timer = window.setTimeout(() => resolve([]), 8000);
    new window.AMap.AutoComplete({ city: city || "全国", citylimit: limit }).search(keyword, (status, result) => {
      window.clearTimeout(timer);
      resolve(status === "complete" && result.tips ? result.tips : []);
    });
  });
}

function geocode(address, home) {
  return ensurePlugins().then(async () => {
    const hint = mentionedCity(address) || homeCity(home);
    let tips = hint ? await askTips(address, hint, true) : [];
    if (!solidTip(tips, address)) tips = await askTips(address, "全国", false);
    const tip = solidTip(tips, address);
    if (tip) return { position: [tip.location.lng, tip.location.lat], label: [tip.name, tip.district].filter(Boolean).join(", ") };
    const named = tips.find((item) => item && item.name && item.district);
    const fallback = named ? named.district + named.name : address;
    const position = await new Promise((done) => {
      const geocoder = new window.AMap.Geocoder(hint ? { city: hint } : {});
      geocoder.getLocation(fallback, (status, result) => {
        const rows = status === "complete" && result.geocodes ? result.geocodes : [];
        const useful = rows.filter((item) => item.location && !/村庄|乡镇/.test(item.level || ""));
        done(useful[0] && useful[0].location ? [useful[0].location.lng, useful[0].location.lat] : null);
      });
    });
    return position ? { position: position, label: named ? [named.name, named.district].filter(Boolean).join(", ") : address } : null;
  });
}

function nearbyCity(center) {
  return ensurePlugins().then(() => new Promise((resolve) => {
    const geocoder = new window.AMap.Geocoder();
    if (typeof geocoder.getAddress !== "function") {
      resolve("");
      return;
    }
    const timer = window.setTimeout(() => resolve(""), 8000);
    geocoder.getAddress(center, (status, result) => {
      window.clearTimeout(timer);
      const part = status === "complete" && result.regeocode ? result.regeocode.addressComponent : null;
      if (!part) {
        resolve("");
        return;
      }
      resolve(namedPlace(part.city) || namedPlace(part.province));
    });
  }));
}

let routeQueue = Promise.resolve();

function enqueueRoute(job) {
  const run = routeQueue.then(job, job);
  routeQueue = run.then(() => undefined, () => undefined);
  return run;
}

const cityCache = {};

function cityKey(position) {
  return Math.round(position[0] * 1000) / 1000 + "," + Math.round(position[1] * 1000) / 1000;
}

function cachedCity(position) {
  const key = cityKey(position);
  if (!cityCache[key]) cityCache[key] = nearbyCity(position);
  return cityCache[key];
}

function citiesMatch(a, b) {
  const left = namedPlace(a).replace(/市$/, "");
  const right = namedPlace(b).replace(/市$/, "");
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

function secondsOf(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function plausibleSeconds(seconds, meters, maxKmh) {
  if (!seconds) return 0;
  if (meters > 800) {
    const kmh = (meters / 1000) / (seconds / 3600);
    if (kmh > maxKmh) return 0;
  }
  return seconds;
}

function minutesFrom(seconds, meters, speedKmh) {
  let minutes = seconds > 0 ? seconds / 60 : 0;
  if (minutes < 1 && meters > 0 && speedKmh > 0) minutes = (meters / 1000 / speedKmh) * 60;
  if (!minutes) return null;
  return Math.max(1, Math.round(minutes));
}

function clockText(value) {
  const text = namedPlace(value);
  const compact = text.match(/^(\d{2})(\d{2})$/);
  if (compact) return compact[1] + ":" + compact[2];
  return text;
}

function drivingPolicy(traffic) {
  const policies = (window.AMap && window.AMap.DrivingPolicy) || {};
  if (traffic && policies.REAL_TRAFFIC != null) return policies.REAL_TRAFFIC;
  if (policies.LEAST_TIME != null) return policies.LEAST_TIME;
  return traffic ? 4 : 0;
}

function transferPolicy() {
  const policies = (window.AMap && window.AMap.TransferPolicy) || {};
  // 0 is LEAST_TIME. 5 is NO_SUBWAY, which drops the metro and reports the wrong ride.
  return policies.LEAST_TIME != null ? policies.LEAST_TIME : 0;
}

function pathOf(route) {
  return (route.steps || []).flatMap((step) => step.path || []);
}

function readRoute(route, speedKmh) {
  if (!route) return null;
  const distance = Number(route.distance) || 0;
  const stepSeconds = (route.steps || []).reduce((sum, step) => sum + secondsOf(step.time), 0);
  let seconds = plausibleSeconds(secondsOf(route.time), distance, 140);
  if (!seconds) seconds = plausibleSeconds(stepSeconds, distance, 140);
  const minutes = minutesFrom(seconds, distance, speedKmh);
  if (minutes == null || !distance) return null;
  return { minutes: minutes, km: distance / 1000, path: pathOf(route) };
}

function searchService(create, read, timeout) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeout || 12000);
    create((status, result) => {
      window.clearTimeout(timer);
      if (status !== "complete") {
        resolve(null);
        return;
      }
      resolve(read(result));
    });
  });
}

function searchDriving(start, end, traffic) {
  return searchService((done) => {
    new window.AMap.Driving({ policy: drivingPolicy(traffic) }).search(start, end, done);
  }, (result) => {
    const routes = (result && result.routes) || [];
    const route = routes.slice().sort((a, b) => (secondsOf(a.time) || 1e12) - (secondsOf(b.time) || 1e12))[0];
    return readRoute(route, 28);
  });
}

function segmentMode(segment) {
  return String(segment.transit_mode || segment.transitMode || "").toUpperCase();
}

function isRailMode(mode) {
  return mode === "SUBWAY" || mode === "METRO_RAIL" || mode === "RAILWAY";
}

function lineNames(transit) {
  const names = [];
  const push = (name) => {
    const text = namedPlace(name);
    if (text && names.indexOf(text) === -1) names.push(text);
  };
  listOf(transit.lines).forEach((line) => push(line && line.name));
  push(transit.name);
  return names.slice(0, 2);
}

function planHasRail(plan) {
  return ((plan && plan.segments) || []).some((segment) => {
    const mode = segmentMode(segment);
    if (isRailMode(mode)) return true;
    const transit = segment.transit || {};
    return lineNames(transit).some((name) => /地铁|轻轨|磁悬|有轨|轨道|市郊铁路/.test(name)) || /地铁|轻轨|有轨|磁悬/.test(namedPlace((listOf(transit.lines)[0] || {}).type));
  });
}

function planHasTransit(plan) {
  return ((plan && plan.segments) || []).some((segment) => {
    const mode = segmentMode(segment);
    return mode === "BUS" || isRailMode(mode);
  });
}

function choosePlan(plans, mode) {
  const list = plans || [];
  if (mode === "rail") return list.filter(planHasRail).sort((a, b) => planScore(a) - planScore(b))[0] || null;
  const transit = list.filter(planHasTransit);
  const pool = transit.length ? transit : list;
  return pool.slice().sort((a, b) => planScore(a) - planScore(b))[0] || null;
}

function planScore(plan) {
  return secondsOf(plan.time) || Number.MAX_SAFE_INTEGER;
}

async function transitCities(origin, destination, hinted) {
  const dest = namedPlace(hinted) || await cachedCity(destination);
  const start = await cachedCity(origin);
  return {
    city: namedPlace(start) || namedPlace(dest),
    cityd: citiesMatch(start, dest) ? "" : namedPlace(dest),
  };
}

function searchTransfer(origin, destination, hinted, mode) {
  const start = new window.AMap.LngLat(origin[0], origin[1]);
  const end = new window.AMap.LngLat(destination[0], destination[1]);
  return transitCities(origin, destination, hinted).then((where) => {
    if (!where.city) return null;
    const options = { city: where.city, policy: transferPolicy(), nightflag: true };
    if (where.cityd) options.cityd = where.cityd;
    return searchService((done) => {
      new window.AMap.Transfer(options).search(start, end, done);
    }, (result) => {
      const plan = choosePlan(result && result.plans, mode);
      return plan ? readPlan(plan) : null;
    });
  });
}

function oneLeg(mode, origin, destination, city) {
  return enqueueRoute(() => queryLeg(mode, origin, destination, city));
}

function queryLeg(mode, origin, destination, city) {
  const start = new window.AMap.LngLat(origin[0], origin[1]);
  const end = new window.AMap.LngLat(destination[0], destination[1]);
  if (mode === "drive") {
    return searchDriving(start, end, true).then((found) => found || searchDriving(start, end, false));
  }
  if (mode === "walk") {
    return searchService((done) => {
      new window.AMap.Walking().search(start, end, done);
    }, (result) => readRoute(result && result.routes && result.routes[0], 4.5));
  }
  if (mode === "cycle") {
    return searchService((done) => {
      new window.AMap.Riding().search(start, end, done);
    }, (result) => readRoute(result && result.routes && result.routes[0], 14));
  }
  return searchTransfer(origin, destination, city, mode);
}

function metersText(meters) {
  if (!meters) return "";
  return meters >= 1000 ? (Math.round(meters / 100) / 10) + " km" : Math.round(meters) + " m";
}

function listOf(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stopName(stop) {
  if (!stop) return "";
  if (typeof stop === "string") return namedPlace(stop);
  return namedPlace(stop.name);
}

function walkPhrase(segment) {
  const walking = segment.walking || {};
  const details = segmentMode(segment) === "WALK" ? segment.transit || {} : {};
  const steps = listOf(walking.steps || details.steps);
  const meters = Number(segment.distance || walking.distance || details.distance) || steps.reduce((sum, step) => sum + (Number(step.distance) || 0), 0);
  if (meters < 40) return "";
  const stepSeconds = steps.reduce((sum, step) => sum + secondsOf(step.time), 0);
  const seconds = plausibleSeconds(secondsOf(segment.time) || secondsOf(walking.time) || secondsOf(details.time) || stepSeconds, meters, 12);
  const minutes = minutesFrom(seconds, meters, 4.5);
  return "Walk " + metersText(meters) + (minutes ? " (" + formatMinutes(minutes) + ")" : "");
}

function ridePhrase(segment) {
  const transit = segment.transit || {};
  const mode = segmentMode(segment);
  const names = lineNames(transit);
  const line = listOf(transit.lines)[0] || {};
  const on = stopName(transit.on_station || transit.departure_stop);
  const off = stopName(transit.off_station || transit.arrival_stop);
  const via = Number(transit.via_num);
  const viaKnown = Number.isFinite(via) && via >= 0;
  const entrance = stopName(transit.entrance);
  const exit = stopName(transit.exit);
  const meters = Number(segment.distance) || 0;
  const minutes = minutesFrom(plausibleSeconds(secondsOf(segment.time), meters, 120), meters, isRailMode(mode) ? 32 : 18);
  if (!names.length && !on && !off) return namedPlace(segment.instruction);
  const railName = names.some((name) => /地铁|轻轨|磁悬|有轨|轨道/.test(name));
  const vehicle = isRailMode(mode) || railName ? "metro" : mode === "RAILWAY" ? "train" : mode === "BUS" ? "bus" : "transit";
  let sentence = names.length ? "Take " + names.join(" or ") : "Take the " + vehicle;
  const open = clockText(line.stime);
  const close = clockText(line.etime);
  if (open && close) sentence += " (" + open + "–" + close + ")";
  if (on) sentence += " from " + on;
  if (entrance) sentence += " (enter at " + entrance + ")";
  if (off) sentence += " to " + off;
  if (exit) sentence += " (leave through " + exit + ")";
  if (viaKnown && via === 0) sentence += ", the next stop";
  else if (viaKnown) sentence += ", " + via + " stop" + (via === 1 ? "" : "s") + " in between";
  if (minutes) sentence += ", " + formatMinutes(minutes);
  return sentence;
}

function summarizePlan(plan) {
  const segments = (plan && plan.segments) || [];
  const parts = [];
  segments.forEach((segment) => {
    const mode = segmentMode(segment);
    if (mode === "WALK" || (!mode && segment.walking)) {
      const phrase = walkPhrase(segment);
      if (phrase) parts.push(phrase);
      return;
    }
    if (mode === "TAXI") {
      const taxi = segment.transit || {};
      const meters = Number(segment.distance || taxi.distance) || 0;
      const minutes = minutesFrom(plausibleSeconds(secondsOf(segment.time || taxi.time), meters, 120), meters, 25);
      const bits = ["Taxi"];
      if (meters) bits.push(metersText(meters));
      if (minutes) bits.push(formatMinutes(minutes));
      parts.push(bits.join(", ").replace("Taxi, ", "Taxi "));
      return;
    }
    const ride = ridePhrase(segment);
    if (ride) parts.push(ride);
  });
  let text = parts.join(". ");
  if (text && !/[.。]$/.test(text)) text += ".";
  const extras = [];
  const fare = Number(plan && plan.cost);
  if (fare > 0) extras.push("fare about ¥" + (Math.round(fare * 10) / 10));
  const walked = Number(plan && plan.walking_distance) || 0;
  if (walked >= 40) extras.push("walking " + metersText(walked) + " in total");
  if (extras.length) text += (text ? " " : "") + extras.join(", ") + ".";
  if (!text) text = segments.map((segment) => namedPlace(segment.instruction)).filter(Boolean).join(" ");
  const total = minutesFrom(plausibleSeconds(secondsOf(plan && plan.time), Number(plan && plan.distance) || 0, 80), 0, 0);
  if (total) text = formatMinutes(total) + " total" + (text ? ". " + text : ".");
  return text;
}

function readPlan(plan) {
  const path = [];
  (plan.segments || []).forEach((segment) => {
    const transit = segment.transit || {};
    const walking = segment.walking || {};
    const direct = transit.path || walking.path;
    if (direct && direct.length) {
      path.push.apply(path, direct);
      return;
    }
    listOf(transit.steps || walking.steps).forEach((step) => path.push.apply(path, step.path || []));
  });
  if (plan.path && plan.path.length && !path.length) path.push.apply(path, plan.path);
  const distance = Number(plan.distance) || 0;
  const minutes = minutesFrom(plausibleSeconds(secondsOf(plan.time), distance, 80), distance, 20);
  if (minutes == null) return null;
  return {
    minutes: minutes,
    km: distance / 1000,
    path: path,
    summary: summarizePlan(plan),
  };
}

function shiftKm(center, eastKm, northKm) {
  const scale = Math.cos((center[1] * Math.PI) / 180) * 111.32;
  return [center[0] + eastKm / scale, center[1] + northKm / 111.32];
}

function levelLabel(text) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative;width:0;height:0;pointer-events:none";
  const label = document.createElement("div");
  label.textContent = text;
  label.style.cssText = "position:absolute;left:6px;top:-10px;font:600 11px/1.2 Georgia,serif;color:#1c1915;background:rgba(246,241,232,.94);border:1px solid #1c1915;border-radius:999px;padding:2px 6px;white-space:nowrap";
  wrap.append(label);
  return wrap;
}

function drawFrame(center, radiusKm, labeled) {
  const rings = 5;
  for (let level = 1; level <= rings; level += 1) {
    const km = (radiusKm * level) / rings;
    if (window.AMap.Circle) {
      addOverlay(new window.AMap.Circle({
        center: center,
        radius: km * 1000,
        strokeColor: "#1c1915",
        strokeOpacity: level === rings ? 0.95 : 0.55,
        strokeWeight: level === rings ? 2 : 1,
        strokeStyle: level === rings ? "solid" : "dashed",
        fillOpacity: 0,
        zIndex: 8 + level,
      }));
    }
    if (labeled) {
      const kmText = km >= 10 ? String(Math.round(km)) : km.toFixed(1);
      addOverlay(new window.AMap.Marker({
        position: shiftKm(center, km * 0.7, km * 0.7),
        zIndex: 80,
        content: levelLabel("Level " + level + " · " + kmText + " km"),
      }));
    }
  }
  addOverlay(new window.AMap.Polyline({
    path: [shiftKm(center, -radiusKm, 0), shiftKm(center, radiusKm, 0)],
    strokeColor: "#b8432f",
    strokeWeight: 2,
    strokeOpacity: 0.85,
    zIndex: 12,
  }));
  addOverlay(new window.AMap.Polyline({
    path: [shiftKm(center, 0, -radiusKm), shiftKm(center, 0, radiusKm)],
    strokeColor: "#b8432f",
    strokeWeight: 2,
    strokeOpacity: 0.85,
    zIndex: 12,
  }));
  if (labeled) {
    addOverlay(new window.AMap.Marker({ position: shiftKm(center, radiusKm, 0), zIndex: 81, content: levelLabel("x") }));
    addOverlay(new window.AMap.Marker({ position: shiftKm(center, 0, radiusKm), zIndex: 81, content: levelLabel("y") }));
  }
}

function drawMeeting(list, selectedId, group, legs) {
  const labeled = state.labels !== false;
  clearOverlays();
  showPeople(group, false, labeled);
  const frame = groupFrame(group);
  drawFrame(frame.center, frame.radiusKm, labeled);
  list.forEach((option) => {
    addOverlay(new window.AMap.Marker({
      position: option.court.position,
      title: option.court.name,
      label: labeled && option.court.id === selectedId ? { content: option.court.name, direction: "top" } : undefined,
    }));
  });
  (legs || []).forEach((leg) => {
    if (!leg.path || !leg.path.length) return;
    addOverlay(new window.AMap.Polyline({
      path: leg.path,
      strokeColor: leg.color,
      strokeWeight: 5,
      strokeOpacity: 0.9,
      lineJoin: "round",
    }));
  });
  addOverlay(new window.AMap.Marker({ position: frame.center, title: "Center", zIndex: 300, content: centerPin(labeled) }));
  fit();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function render() {
  const rail = document.getElementById("rail");
  if (!rail) return;
  rail.replaceChildren();
  if (!state.sport) {
    showPeople([]);
    const wrap = el("div", "pad");
    wrap.append(el("h2", "", "Sports"));
    wrap.append(el("p", "lead", "Follow these steps. Amap finds courts best in mainland China."));
    wrap.append(stepsEl());
    const grid = el("div", "sports");
    SPORTS.forEach((sport) => {
      const button = el("button", "sport", sport.label);
      button.type = "button";
      button.addEventListener("click", () => openSport(sport));
      grid.append(button);
    });
    wrap.append(grid);
    rail.append(wrap);
    return;
  }

  const wrap = el("div", "pad stack");
  const head = el("div", "head");
  const back = el("button", "back", "All sports");
  back.type = "button";
  back.addEventListener("click", () => {
    state.sport = null;
    state.note = "";
    render();
  });
  head.append(back, el("h2", "", state.sport.label));
  wrap.append(head);
  wrap.append(stepsEl());

  const partners = el("section", "stack");
  partners.append(el("h3", "", "Starting places"));
  partners.append(el("p", "lead", "Add each partner and where they leave from. The court is chosen after that, by car time."));
  if (state.you) {
    const you = el("div", "partner");
    const copy = el("div");
    const name = el("p", "who", "You");
    name.style.borderLeft = "8px solid #b8432f";
    name.style.paddingLeft = "8px";
    copy.append(name, el("p", "meta", state.you.matched || state.city || "Your location"));
    you.append(copy);
    partners.append(you);
  } else partners.append(el("p", "lead", state.loading ? "Finding you…" : "Type your location if the map cannot find you."));
  const selfForm = el("form", "partner-form");
  const selfInput = el("input");
  selfInput.placeholder = "Your location, if the pin is wrong";
  selfInput.required = true;
  const selfButton = el("button", "ghost", state.moving ? "Moving your pin…" : "Use this location");
  selfButton.type = "submit";
  selfButton.disabled = state.moving;
  selfForm.append(selfInput, selfButton);
  selfForm.addEventListener("submit", (event) => {
    event.preventDefault();
    useMyPlace(selfInput.value.trim());
  });
  partners.append(selfForm);
  state.partners.forEach((partner, index) => {
    const row = el("div", "partner");
    const copy = el("div");
    const name = el("p", "who", partner.name);
    name.style.borderLeft = "8px solid " + COLORS[(index + 1) % COLORS.length];
    name.style.paddingLeft = "8px";
    copy.append(name, el("p", "meta", partner.matched || partner.place));
    const remove = el("button", "remove", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      state.partners = state.partners.filter((item) => item.id !== partner.id);
      state.ranked = [];
      state.picked = null;
      state.legs = {};
      render();
    });
    row.append(copy, remove);
    partners.append(row);
  });
  const form = el("form", "partner-form");
  const nameInput = el("input");
  nameInput.placeholder = "Partner name";
  nameInput.required = true;
  const placeInput = el("input");
  placeInput.placeholder = "Place and city, e.g. 鸟巢 北京 or Guomao, Beijing";
  placeInput.required = true;
  const submit = el("button", "ghost", state.adding ? "Finding that place…" : "Add partner");
  submit.type = "submit";
  submit.disabled = state.adding || state.loading || !state.you;
  form.append(nameInput, placeInput, submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    addPartner(nameInput.value.trim(), placeInput.value.trim());
  });
  partners.append(form);
  const findLabel = state.detailing ? "Reading each court…" : state.scoring ? "Timing the drive…" : "Find courts by car";
  const find = el("button", "submit", findLabel);
  find.type = "button";
  find.disabled = !state.partners.length || state.scoring || !state.you;
  find.addEventListener("click", () => findCourts());
  partners.append(find);
  if (state.note) partners.append(el("p", "warn", state.note));
  wrap.append(partners);

  if (state.ranked.length) {
    const meetings = el("section", "stack split");
    meetings.append(el("h3", "", "Best by car"));
    meetings.append(el("p", "lead", "Each court lists the type, hours, rating, and address when Amap has them. Open one for a public-transit description. More courts sit near the middle of the group."));
    const toggle = el("button", "ghost", state.labels ? "Hide the labels" : "Show the labels");
    toggle.type = "button";
    toggle.addEventListener("click", () => {
      state.labels = !state.labels;
      drawMeeting(state.ranked, state.picked, people(), state.legs[state.mode] || []);
      render();
    });
    meetings.append(toggle);
    state.ranked.forEach((option, index) => {
      const box = el("div", "option" + (option.court.id === state.picked ? " active" : ""));
      const button = el("button", "card");
      button.type = "button";
      const row = el("span", "row");
      row.append(el("span", "", index + 1 + ". " + option.court.name));
      row.append(el("span", "meta", formatMinutes(option.totalMinutes)));
      button.append(row);
      appendCourtLines(button, option.court);
      button.addEventListener("click", () => choose(option.court.id, "drive"));
      box.append(button);
      if (option.court.id === state.picked) box.append(courtDetail(option));
      meetings.append(box);
    });
    wrap.append(meetings);
  }

  rail.append(wrap);
  if (!state.ranked.length) showPeople(people());
}

function appendCourtLines(parent, court) {
  const kind = (court.type || "").split(";").pop().trim();
  const headline = [kind, court.rating ? "Rated " + court.rating + " / 5" : "", court.cost ? "about ¥" + court.cost : ""].filter(Boolean).join(" · ");
  if (headline) parent.append(el("span", "meta", headline));
  if (court.hours) parent.append(el("span", "meta", "Hours " + court.hours));
  if (court.area) parent.append(el("span", "meta", court.area));
  if (court.address) parent.append(el("span", "meta", court.address));
  if (court.tel) parent.append(el("span", "meta", court.tel));
}

function appendLeg(parent, leg) {
  const line = el("p", "leg");
  line.style.borderLeft = "8px solid " + leg.color;
  line.append(el("span", "", leg.name));
  const timing = leg.minutes == null ? "Unavailable" : (leg.estimated ? "About " : "") + formatMinutes(leg.minutes) + (leg.km == null ? "" : " · " + leg.km.toFixed(1) + " km");
  line.append(el("span", "meta", timing));
  parent.append(line);
  if (leg.summary) parent.append(el("p", "blurb", leg.summary));
}

function courtDetail(option) {
  const court = option.court;
  const detail = el("div", "detail");
  if (court.photos && court.photos[0]) {
    const img = document.createElement("img");
    img.className = "shot";
    img.alt = court.name;
    img.referrerPolicy = "no-referrer";
    img.src = court.photos[0];
    img.addEventListener("error", () => img.remove());
    detail.append(img);
  }
  detail.append(el("p", "lead", option.description));
  if (court.website && /^https?:\/\//i.test(court.website)) {
    const link = document.createElement("a");
    link.className = "site";
    link.href = court.website;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Website";
    detail.append(link);
  }
  const modes = el("div", "modes");
  MODES.forEach((item) => {
    const mode = el("button", "mode" + (state.mode === item.id ? " on" : ""), item.label);
    mode.type = "button";
    mode.addEventListener("click", () => choose(court.id, item.id));
    modes.append(mode);
  });
  detail.append(modes);
  if (state.routing) detail.append(el("p", "meta", "Drawing routes…"));
  (state.legs[state.mode] || []).forEach((leg) => appendLeg(detail, leg));
  if (state.mode !== "transit") detail.append(publicTransitBlock(court.id));
  return detail;
}

function publicTransitBlock(courtId) {
  const how = el("div", "howto");
  how.append(el("h3", "", "By public transit"));
  const option = state.ranked.find((item) => item.court.id === courtId);
  const ready = state.transitFor === courtId;
  const transitLegs = ready ? state.legs.transit || [] : [];
  if ((!ready || state.transitLoading) && !transitLegs.length) {
    how.append(el("p", "meta", "Looking up buses and metro…"));
    return how;
  }
  if (!transitLegs.length) {
    how.append(el("p", "meta", "No public transit route was found."));
    return how;
  }
  transitLegs.forEach((leg, index) => {
    const ride = el("div", "ride");
    const title = el("p", "who", leg.name);
    title.style.borderLeft = "8px solid " + leg.color;
    title.style.paddingLeft = "8px";
    ride.append(title);
    ride.append(el("p", leg.summary ? "blurb" : "meta", leg.summary || transitFallback(leg, option && option.drive[index])));
    how.append(ride);
  });
  return how;
}

function transitFallback(leg, drive) {
  if (drive && drive.km != null && drive.km < 1.5) {
    const walkMin = Math.max(1, Math.round((drive.km / 4.8) * 60));
    return "No bus or metro is needed. Walk about " + walkMin + " min (" + drive.km.toFixed(1) + " km).";
  }
  if (leg.minutes == null) return "No bus or metro route from this start.";
  return "About " + formatMinutes(leg.minutes) + ". Amap did not list the stops.";
}

async function openSport(sport) {
  const located = window.__mappaPoint ? Promise.resolve(true) : locateUser();
  state.sport = sport;
  state.courts = [];
  state.activeCourt = null;
  state.partners = [];
  state.picked = null;
  state.legs = {};
  state.loading = true;
  state.note = "";
  render();
  const ok = await located;
  const point = window.__mappaPoint;
  if (!ok || !point) {
    state.loading = false;
    state.you = null;
    state.note = "Automatic location was blocked. Type your location below.";
    render();
    return;
  }
  state.you = { id: "you", name: "You", place: "Your location", position: point };
  state.city = await nearbyCity(point);
  state.loading = false;
  render();
}

async function useMyPlace(place) {
  if (!place) return;
  state.moving = true;
  state.note = "";
  render();
  const found = await geocode(place, state.city);
  state.moving = false;
  if (!found) {
    state.note = "That place was not found. Add the city, for example Chaoyang, Beijing.";
    render();
    return;
  }
  state.you = { id: "you", name: "You", place: place, matched: found.label, position: found.position };
  state.city = await nearbyCity(found.position);
  state.ranked = [];
  state.picked = null;
  state.legs = {};
  render();
}

async function addPartner(name, place) {
  if (!name || !place) return;
  state.adding = true;
  state.note = "";
  render();
  const found = await geocode(place, state.city);
  state.adding = false;
  if (!found) {
    state.note = "That place was not found. Add the city, for example Guomao, Beijing.";
    render();
    return;
  }
  state.partners = state.partners.concat([{ id: String(Date.now()), name, place, matched: found.label, position: found.position }]);
  state.ranked = [];
  state.picked = null;
  state.legs = {};
  render();
}

async function legsFor(option, group, mode) {
  return Promise.all(group.map(async (person, index) => {
    const found = await oneLeg(mode, person.position, option.court.position, namedPlace(option.court.city));
    return {
      name: person.name,
      color: COLORS[index % COLORS.length],
      minutes: found ? found.minutes : null,
      km: found ? found.km : null,
      path: found ? found.path : [],
      summary: found && found.summary ? found.summary : "",
    };
  }));
}

function groupFrame(group) {
  const lat0 = group.reduce((sum, person) => sum + person.position[1], 0) / group.length;
  const scale = Math.cos((lat0 * Math.PI) / 180) * 111.32;
  const xs = group.map((person) => person.position[0] * scale);
  const ys = group.map((person) => person.position[1] * 111.32);
  const x = xs.reduce((sum, value) => sum + value, 0) / group.length;
  const y = ys.reduce((sum, value) => sum + value, 0) / group.length;
  const center = [x / scale, y / 111.32];
  const farthest = Math.max.apply(null, group.map((person) => km(center, person.position)));
  return { center: center, radiusKm: farthest < 0.3 ? 3 : 2 * farthest };
}

function pickByDensity(items, radiusKm, limit) {
  const inside = items.filter((item) => item.away <= radiusKm + 0.05);
  if (inside.length <= limit) return inside.map((item) => item.court);
  const rings = 5;
  const edge = Math.max(radiusKm, 0.001);
  const mass = (value) => (value * value) / 2 - (value * value * value) / (3 * edge);
  const weights = [];
  for (let index = 0; index < rings; index += 1) {
    weights.push(Math.max(0, mass((radiusKm * (index + 1)) / rings) - mass((radiusKm * index) / rings)));
  }
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  const slots = weights.map((value) => Math.floor((value / total) * limit));
  let spare = limit - slots.reduce((sum, value) => sum + value, 0);
  weights
    .map((value, index) => ({ index: index, extra: (value / total) * limit - slots[index] }))
    .sort((a, b) => b.extra - a.extra || a.index - b.index)
    .forEach((item) => {
      if (spare <= 0) return;
      slots[item.index] += 1;
      spare -= 1;
    });
  const chosen = [];
  const used = {};
  slots.forEach((count, index) => {
    const inner = (radiusKm * index) / rings;
    const outer = (radiusKm * (index + 1)) / rings;
    const bucket = inside
      .filter((item) => item.away >= inner && item.away <= outer + (index === rings - 1 ? 0.05 : 0))
      .sort((a, b) => a.angle - b.angle);
    const take = Math.min(count, bucket.length);
    const step = bucket.length / Math.max(take, 1);
    for (let pick = 0; pick < take; pick += 1) {
      const item = bucket[Math.min(bucket.length - 1, Math.floor(pick * step))];
      if (!item || used[item.court.id]) continue;
      used[item.court.id] = true;
      chosen.push(item.court);
    }
  });
  inside
    .filter((item) => !used[item.court.id])
    .sort((a, b) => a.away - b.away)
    .forEach((item) => {
      if (chosen.length >= limit) return;
      chosen.push(item.court);
    });
  return chosen.slice(0, limit);
}

async function findCourts() {
  if (!state.sport || !state.you || !state.partners.length) return;
  state.scoring = true;
  state.detailing = false;
  state.note = "";
  state.ranked = [];
  state.picked = null;
  state.legs = {};
  state.transitFor = "";
  state.transitLoading = false;
  Object.keys(legJobs).forEach((key) => delete legJobs[key]);
  render();
  try {
    const group = people();
    const frame = groupFrame(group);
    const radiusM = frame.radiusKm * 1000;
    async function gather(keyword) {
      let found = await searchCourts(keyword, frame.center, radiusM);
      if (frame.radiusKm > 50) {
        const extra = await Promise.all(group.map((person) => searchCourts(keyword, person.position, 50000)));
        found = dedupe(found.concat(extra.flat()));
      }
      return found.filter((court) => km(frame.center, court.position) <= frame.radiusKm + 0.05);
    }
    let pool = await gather(state.sport.keyword);
    if (pool.length < 24) pool = dedupe(pool.concat(await gather(state.sport.fallback)));
    const shortlist = pickByDensity(pool.map((court) => ({
      court: court,
      away: km(frame.center, court.position),
      angle: Math.atan2(court.position[0] - frame.center[0], court.position[1] - frame.center[1]),
    })), frame.radiusKm, 24);
    state.detailing = true;
    render();
    const detailed = await enrichCourts(shortlist);
    state.detailing = false;
    const scored = [];
    for (const court of detailed) {
      const drive = (await legsFor({ court: court }, group, "drive")).map((leg, index) => {
        if (leg.minutes != null) return leg;
        const distance = km(group[index].position, court.position);
        const roadKm = distance * 1.35;
        return {
          name: leg.name,
          color: leg.color,
          minutes: Math.max(1, Math.round((roadKm / 24) * 60)),
          km: roadKm,
          path: [],
          estimated: true,
        };
      });
      const totalMinutes = drive.reduce((sum, leg) => sum + leg.minutes, 0);
      const estimated = drive.some((leg) => leg.estimated);
      scored.push({
        court: court,
        totalMinutes: totalMinutes,
        description: describeCourt(court, group.length, totalMinutes) + (estimated ? " Amap did not return every driving route, so a missing time is estimated from distance." : ""),
        drive: drive,
      });
    }
    scored.sort((a, b) => a.totalMinutes - b.totalMinutes);
    state.ranked = scored;
    if (!state.ranked.length) {
      state.note = "Amap found no courts near these starting places. Use a place in mainland China, such as Chaoyang, Beijing.";
    } else {
      const first = state.ranked[0];
      state.picked = first.court.id;
      state.mode = "drive";
      state.legs = { drive: first.drive };
      state.labels = true;
      state.transitFor = first.court.id;
      state.transitLoading = true;
      drawMeeting(state.ranked, first.court.id, group, first.drive);
    }
  } catch (error) {
    state.note = "The map is still opening. Try again in a moment.";
  } finally {
    state.scoring = false;
    state.detailing = false;
    render();
  }
  const opened = state.ranked.find((item) => item.court.id === state.picked);
  if (opened) ensurePublicTransit(opened);
}

function legJob(option, mode) {
  if (mode === "drive") return Promise.resolve(option.drive);
  const key = option.court.id + ":" + mode;
  if (!legJobs[key]) legJobs[key] = legsFor(option, people(), mode);
  return legJobs[key];
}

function ensurePublicTransit(option) {
  const id = option.court.id;
  if (state.legs.transit && state.transitFor === id && !state.transitLoading) return;
  state.transitFor = id;
  state.transitLoading = true;
  legJob(option, "transit").then((legs) => {
    if (state.picked !== id) return;
    state.legs = { ...state.legs, transit: legs };
    state.transitLoading = false;
    if (state.mode === "transit") drawMeeting(state.ranked, id, people(), legs);
    render();
  }).catch(() => {
    if (state.picked !== id) return;
    state.transitLoading = false;
    state.legs = { ...state.legs, transit: state.legs.transit || [] };
    render();
  });
}

async function choose(id, mode) {
  const option = state.ranked.find((item) => item.court.id === id);
  if (!option) return;
  const same = state.picked === id;
  state.picked = id;
  state.mode = mode;
  if (!same) {
    state.legs = { drive: option.drive };
    state.transitFor = "";
    state.transitLoading = false;
  }
  const existing = mode === "drive" ? option.drive : state.legs[mode];
  if (existing) {
    state.legs = { ...state.legs, [mode]: existing };
    drawMeeting(state.ranked, id, people(), existing);
    state.routing = false;
    render();
    if (mode !== "transit") ensurePublicTransit(option);
    return;
  }
  state.routing = true;
  render();
  if (mode !== "transit") ensurePublicTransit(option);
  const legs = await legJob(option, mode);
  if (state.picked !== id || state.mode !== mode) {
    state.legs = { ...state.legs, [mode]: legs };
    return;
  }
  state.legs = { ...state.legs, [mode]: legs };
  state.routing = false;
  if (mode === "transit") {
    state.transitFor = id;
    state.transitLoading = false;
  }
  drawMeeting(state.ranked, id, people(), legs);
  render();
}

render();
