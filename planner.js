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
};

let overlays = [];
let peopleOverlays = [];
let pluginsReady = null;

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
    "Open a court. Car routes show first. Then try Light rail, Public, Walk, or Cycle.",
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

function formatMinutes(minutes) {
  if (minutes < 90) return minutes + " min";
  return Math.round(minutes / 60) + " h";
}

function describeCourt(court, count, totalMinutes) {
  const kind = (court.type || "sports court").split(";").pop().trim() || "sports court";
  const where = court.address || court.city || "the area around the group";
  const phone = court.tel ? " Phone " + court.tel + "." : "";
  const group = count === 1 ? "1 person" : count + " people";
  const time = totalMinutes < 90 ? totalMinutes + " minutes" : Math.round(totalMinutes / 60) + " hours";
  return court.name + " is a " + kind + " at " + where + "." + phone + " By car, about " + time + " in total for " + group + ".";
}

function courtFacts(court) {
  const kind = (court.type || "").split(";").pop().trim();
  return [kind, court.address, court.tel].filter(Boolean).join(" · ");
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

function showPeople(group, fitView) {
  peopleOverlays.forEach((item) => item.setMap && item.setMap(null));
  peopleOverlays = [];
  if (!window.AMap || !window.__mappaMap) return;
  (group || []).forEach((person, index) => {
    const pin = personPin(COLORS[index % COLORS.length], person.name);
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

function readPoi(keyword, poi, index) {
  const address = poi.address || "";
  const city = poi.cityname || "";
  const district = poi.adname || "";
  const full = address && city && address.includes(city) ? address : [city, district, address].filter(Boolean).join("");
  return {
    id: poi.id || keyword + index + (poi.location ? poi.location.lng : ""),
    name: poi.name,
    address: full,
    type: poi.type || "",
    city: city,
    tel: poi.tel || "",
    position: [poi.location.lng, poi.location.lat],
  };
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
    geocoder.getAddress(center, (status, result) => {
      const part = status === "complete" && result.regeocode ? result.regeocode.addressComponent : null;
      const city = part && typeof part.city === "string" && part.city ? part.city : part && part.province;
      resolve(typeof city === "string" ? city : "");
    });
  }));
}

function pathOf(route) {
  return (route.steps || []).flatMap((step) => step.path || []);
}

function oneLeg(mode, origin, destination, city) {
  return new Promise((resolve) => {
    const start = new window.AMap.LngLat(origin[0], origin[1]);
    const end = new window.AMap.LngLat(destination[0], destination[1]);
    const timer = window.setTimeout(() => resolve(null), 15000);
    const done = (status, result, read) => {
      window.clearTimeout(timer);
      if (status !== "complete") {
        resolve(null);
        return;
      }
      resolve(read(result));
    };
    if (mode === "drive") {
      new window.AMap.Driving().search(start, end, (status, result) => done(status, result, (value) => {
        const route = value.routes && value.routes[0];
        if (!route || !route.distance) return null;
        return { minutes: Math.max(1, Math.round((route.time || 0) / 60)), km: route.distance / 1000, path: pathOf(route) };
      }));
      return;
    }
    if (mode === "walk") {
      new window.AMap.Walking().search(start, end, (status, result) => done(status, result, (value) => {
        const route = value.routes && value.routes[0];
        if (!route || !route.distance) return null;
        return { minutes: Math.max(1, Math.round((route.time || 0) / 60)), km: route.distance / 1000, path: pathOf(route) };
      }));
      return;
    }
    if (mode === "cycle") {
      new window.AMap.Riding().search(start, end, (status, result) => done(status, result, (value) => {
        const route = value.routes && value.routes[0];
        if (!route || !route.distance) return null;
        return { minutes: Math.max(1, Math.round((route.time || 0) / 60)), km: route.distance / 1000, path: pathOf(route) };
      }));
      return;
    }
    const policy = mode === "transit" ? 5 : 0;
    new window.AMap.Transfer({ city: city || "全国", policy: policy }).search(start, end, (status, result) => {
      const plans = status === "complete" && result.plans ? result.plans : [];
      const rail = plans.filter((plan) => /地铁|轻轨|磁悬|有轨|轨道/.test(JSON.stringify(plan.segments || [])));
      const plan = mode === "rail" ? rail.sort((a, b) => (a.time || 0) - (b.time || 0))[0] : plans[0];
      if (!plan && mode === "transit") {
        new window.AMap.Transfer({ city: city || "全国" }).search(start, end, (nextStatus, nextResult) => {
          const next = nextStatus === "complete" && nextResult.plans ? nextResult.plans[0] : null;
          window.clearTimeout(timer);
          resolve(next ? readPlan(next) : null);
        });
        return;
      }
      window.clearTimeout(timer);
      resolve(plan ? readPlan(plan) : null);
    });
  });
}

function readPlan(plan) {
  const path = [];
  (plan.segments || []).forEach((segment) => {
    if (segment.transit && segment.transit.path) path.push(...segment.transit.path);
    ((segment.walking && segment.walking.steps) || []).forEach((step) => path.push(...(step.path || [])));
  });
  if (!plan.time && !plan.distance) return null;
  return { minutes: Math.max(1, Math.round((plan.time || 0) / 60)), km: (plan.distance || 0) / 1000, path: path };
}

function drawMeeting(list, selectedId, group, legs) {
  clearOverlays();
  showPeople(group, false);
  list.forEach((option) => {
    addOverlay(new window.AMap.Marker({
      position: option.court.position,
      title: option.court.name,
      label: option.court.id === selectedId ? { content: option.court.name, direction: "top" } : undefined,
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
  const find = el("button", "submit", state.scoring ? "Timing the drive…" : "Find courts by car");
  find.type = "button";
  find.disabled = !state.partners.length || state.scoring || !state.you;
  find.addEventListener("click", () => findCourts());
  partners.append(find);
  if (state.note) partners.append(el("p", "warn", state.note));
  wrap.append(partners);

  if (state.ranked.length) {
    const meetings = el("section", "stack split");
    meetings.append(el("h3", "", "Best by car"));
    meetings.append(el("p", "lead", "Up to 20 courts. More near the middle of the group, fewer toward the edge. The edge is 1.2 times the farthest person from that middle."));
    state.ranked.forEach((option, index) => {
      const box = el("div", "option" + (option.court.id === state.picked ? " active" : ""));
      const button = el("button", "card");
      button.type = "button";
      const row = el("span", "row");
      row.append(el("span", "", index + 1 + ". " + option.court.name));
      row.append(el("span", "meta", formatMinutes(option.totalMinutes)));
      button.append(row);
      const facts = courtFacts(option.court);
      if (facts) button.append(el("span", "meta", facts));
      button.addEventListener("click", () => choose(option.court.id, "drive"));
      box.append(button);
      if (option.court.id === state.picked) {
        const detail = el("div", "detail");
        detail.append(el("p", "lead", option.description));
        const modes = el("div", "modes");
        MODES.forEach((item) => {
          const mode = el("button", "mode" + (state.mode === item.id ? " on" : ""), item.label);
          mode.type = "button";
          mode.addEventListener("click", () => choose(option.court.id, item.id));
          modes.append(mode);
        });
        detail.append(modes);
        if (state.routing) detail.append(el("p", "meta", "Drawing routes…"));
        (state.legs[state.mode] || []).forEach((leg) => {
          const line = el("p", "leg");
          line.style.borderLeft = "8px solid " + leg.color;
          line.append(el("span", "", leg.name));
          line.append(el("span", "meta", leg.minutes == null ? "Unavailable" : (leg.estimated ? "About " : "") + formatMinutes(leg.minutes) + " · " + leg.km.toFixed(1) + " km"));
          detail.append(line);
        });
        box.append(detail);
      }
      meetings.append(box);
    });
    wrap.append(meetings);
  }

  rail.append(wrap);
  if (!state.ranked.length) showPeople(people());
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
    const found = await oneLeg(mode, person.position, option.court.position, option.court.city);
    return {
      name: person.name,
      color: COLORS[index % COLORS.length],
      minutes: found ? found.minutes : null,
      km: found ? found.km : null,
      path: found ? found.path : [],
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
  return { center: center, radiusKm: farthest < 0.3 ? 3 : 1.2 * farthest };
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
  state.note = "";
  state.ranked = [];
  state.picked = null;
  state.legs = {};
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
    if (pool.length < 20) pool = dedupe(pool.concat(await gather(state.sport.fallback)));
    const shortlist = pickByDensity(pool.map((court) => ({
      court: court,
      away: km(frame.center, court.position),
      angle: Math.atan2(court.position[0] - frame.center[0], court.position[1] - frame.center[1]),
    })), frame.radiusKm, 20);
    const scored = [];
    for (const court of shortlist) {
      const drive = (await legsFor({ court: court }, group, "drive")).map((leg, index) => {
        if (leg.minutes != null) return leg;
        const distance = km(group[index].position, court.position);
        return {
          name: leg.name,
          color: leg.color,
          minutes: Math.max(1, Math.round((distance / 35) * 60)),
          km: distance,
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
      drawMeeting(state.ranked, first.court.id, group, first.drive);
    }
  } catch (error) {
    state.note = "The map is still opening. Try again in a moment.";
  } finally {
    state.scoring = false;
    render();
  }
}

async function choose(id, mode) {
  const option = state.ranked.find((item) => item.court.id === id);
  if (!option) return;
  const same = state.picked === id;
  state.picked = id;
  state.mode = mode;
  if (!same) state.legs = { drive: option.drive };
  const existing = mode === "drive" ? option.drive : state.legs[mode];
  if (existing) {
    state.legs = { ...state.legs, [mode]: existing };
    drawMeeting(state.ranked, id, people(), existing);
    render();
    return;
  }
  state.routing = true;
  render();
  const group = people();
  const legs = await legsFor(option, group, mode);
  state.legs = { ...state.legs, [mode]: legs };
  state.routing = false;
  drawMeeting(state.ranked, id, group, legs);
  render();
}

render();
