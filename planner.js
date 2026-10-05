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
  { id: "drive", label: "Drive" },
  { id: "transit", label: "Transit" },
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
  city: "",
};

let overlays = [];
let pluginsReady = null;

function km(a, b) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function people() {
  return state.you ? [state.you, ...state.partners] : state.partners;
}

function rank(courts, group) {
  const seen = new Set();
  return courts
    .filter((court) => {
      if (seen.has(court.id)) return false;
      seen.add(court.id);
      return true;
    })
    .map((court) => {
      const totalKm = group.reduce((sum, person) => sum + km(person.position, court.position), 0);
      const kind = (court.type || "sports court").split(";").pop().trim() || "sports court";
      const where = court.address || court.city || "the area around the group";
      const count = group.length === 1 ? "1 person" : group.length + " people";
      return {
        court,
        totalKm,
        description: court.name + " is a " + kind + " at " + where + ". The straight-line total is about " + totalKm.toFixed(1) + " km for " + count + ".",
      };
    })
    .sort((a, b) => a.totalKm - b.totalKm)
    .slice(0, 3);
}

function options() {
  return state.partners.length ? rank(state.courts, people()) : [];
}

function ensurePlugins() {
  if (!pluginsReady) {
    pluginsReady = new Promise((resolve, reject) => {
      if (!window.AMap || typeof window.AMap.plugin !== "function") {
        pluginsReady = null;
        reject(new Error("map"));
        return;
      }
      window.AMap.plugin(["AMap.PlaceSearch", "AMap.Geocoder", "AMap.Driving", "AMap.Walking", "AMap.Riding", "AMap.Transfer"], () => resolve());
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
  const view = [window.__mappaMarker, ...overlays].filter(Boolean);
  if (view.length && window.__mappaMap && window.__mappaMap.setFitView) {
    window.__mappaMap.setFitView(view, false, [56, 56, 56, 56]);
  }
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

function searchCourts(keyword, center, radius) {
  return ensurePlugins().then(() => new Promise((resolve) => {
    const search = new window.AMap.PlaceSearch({ pageSize: 8, pageIndex: 1 });
    search.searchNearBy(keyword, center, radius || 12000, (status, result) => {
      const pois = status === "complete" && result.poiList ? result.poiList.pois || [] : [];
      resolve(pois.filter((poi) => poi.location && poi.name).map((poi, index) => ({
        id: poi.id || keyword + index,
        name: poi.name,
        address: poi.address || "",
        type: poi.type || "",
        city: poi.cityname || "",
        position: [poi.location.lng, poi.location.lat],
      })));
    });
  }));
}

function geocode(address, city) {
  return ensurePlugins().then(() => new Promise((resolve) => {
    const run = (scope) => new Promise((done) => {
      const geocoder = new window.AMap.Geocoder(scope ? { city: scope } : {});
      geocoder.getLocation(address, (status, result) => {
        const location = status === "complete" && result.geocodes && result.geocodes[0] ? result.geocodes[0].location : null;
        done(location ? [location.lng, location.lat] : null);
      });
    });
    if (!city) {
      run("全国").then(resolve);
      return;
    }
    run(city).then((local) => {
      if (local) resolve(local);
      else run("全国").then(resolve);
    });
  }));
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
    const timer = window.setTimeout(() => resolve(null), 8000);
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
    new window.AMap.Transfer({ city: city || "全国" }).search(start, end, (status, result) => done(status, result, (value) => {
      const plan = value.plans && value.plans[0];
      if (!plan) return null;
      const path = [];
      (plan.segments || []).forEach((segment) => {
        if (segment.transit && segment.transit.path) path.push(...segment.transit.path);
        ((segment.walking && segment.walking.steps) || []).forEach((step) => path.push(...(step.path || [])));
      });
      return { minutes: Math.max(1, Math.round((plan.time || 0) / 60)), km: (plan.distance || 0) / 1000, path };
    }));
  });
}

function drawMeeting(list, selectedId, group, legs) {
  clearOverlays();
  list.forEach((option) => {
    addOverlay(new window.AMap.Marker({
      position: option.court.position,
      title: option.court.name,
      label: option.court.id === selectedId ? { content: option.court.name, direction: "top" } : undefined,
    }));
  });
  group.forEach((person, index) => {
    if (person.name === "You") return;
    addOverlay(new window.AMap.Marker({
      position: person.position,
      title: person.name,
      label: { content: person.name, direction: "right" },
    }));
    void index;
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
    const wrap = el("div", "pad");
    wrap.append(el("h2", "", "Sports"));
    wrap.append(el("p", "lead", "Pick one to see courts around you."));
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

  const courts = el("section", "stack");
  courts.append(el("h3", "", "Courts near you"));
  if (state.loading) courts.append(el("p", "lead", "Looking around you…"));
  if (!state.loading && !state.courts.length) courts.append(el("p", "empty", state.note || "No courts yet."));
  state.courts.forEach((court) => {
    const button = el("button", "card" + (court.id === state.activeCourt ? " active" : ""));
    button.type = "button";
    const row = el("span", "row");
    row.append(el("span", "", court.name));
    if (state.you) row.append(el("span", "meta", km(state.you.position, court.position).toFixed(1) + " km"));
    button.append(row);
    if (court.address) button.append(el("span", "meta", court.address));
    button.addEventListener("click", () => {
      state.activeCourt = court.id;
      state.picked = null;
      showCourts(state.courts, court.id);
      render();
    });
    courts.append(button);
  });
  const active = state.courts.find((court) => court.id === state.activeCourt);
  if (active && active.address) courts.append(el("p", "lead", active.name + ". " + active.address + "."));
  wrap.append(courts);

  const partners = el("section", "stack split");
  partners.append(el("h3", "", "Partners"));
  partners.append(el("p", "lead", "Add who is coming, and the place each person leaves from."));
  state.partners.forEach((partner, index) => {
    const row = el("div", "partner");
    const copy = el("div");
    const name = el("p", "who", partner.name);
    name.style.borderLeft = "8px solid " + COLORS[(index + 1) % COLORS.length];
    name.style.paddingLeft = "8px";
    copy.append(name, el("p", "meta", partner.place));
    const remove = el("button", "remove", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      state.partners = state.partners.filter((item) => item.id !== partner.id);
      state.picked = null;
      state.legs = {};
      if (state.partners.length) showCourts(options().map((option) => option.court));
      else showCourts(state.courts, state.activeCourt);
      render();
    });
    row.append(copy, remove);
    partners.append(row);
  });
  const form = el("form", "partner-form");
  const nameInput = el("input");
  nameInput.placeholder = "Name";
  nameInput.required = true;
  const placeInput = el("input");
  placeInput.placeholder = "Where they start, e.g. Guomao, Beijing";
  placeInput.required = true;
  const submit = el("button", "submit", state.adding ? "Finding that place…" : "Add partner");
  submit.type = "submit";
  submit.disabled = state.adding || state.loading;
  form.append(nameInput, placeInput, submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    addPartner(nameInput.value.trim(), placeInput.value.trim());
  });
  partners.append(form);
  if (state.note && state.courts.length) partners.append(el("p", "warn", state.note));
  wrap.append(partners);

  if (state.partners.length) {
    const meetings = el("section", "stack split");
    meetings.append(el("h3", "", "Shortest meetings"));
    meetings.append(el("p", "lead", "Three places with the smallest total distance. Open one for routes."));
    const list = options();
    if (!list.length) meetings.append(el("p", "lead", "No meeting place to compare yet."));
    list.forEach((option, index) => {
      const box = el("div", "option" + (option.court.id === state.picked ? " active" : ""));
      const button = el("button", "card");
      button.type = "button";
      const row = el("span", "row");
      row.append(el("span", "", index + 1 + ". " + option.court.name));
      row.append(el("span", "meta", option.totalKm.toFixed(1) + " km"));
      button.append(row);
      button.addEventListener("click", () => choose(option.court.id, state.mode));
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
          line.append(el("span", "meta", leg.minutes == null ? "Unavailable" : leg.minutes + " min · " + leg.km.toFixed(1) + " km"));
          detail.append(line);
        });
        box.append(detail);
      }
      meetings.append(box);
    });
    wrap.append(meetings);
  }

  rail.append(wrap);
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
    state.note = "Allow location for this site, then choose the sport again.";
    render();
    return;
  }
  state.you = { id: "you", name: "You", place: "Your location", position: point };
  state.city = await nearbyCity(point);
  try {
    let found = await searchCourts(sport.keyword, point);
    if (!found.length) found = await searchCourts(sport.fallback, point, 20000);
    state.courts = found;
    showCourts(found);
    state.note = found.length ? "" : "No courts turned up nearby. Amap covers mainland China best.";
  } catch (error) {
    state.note = "The map is still opening. Choose the sport again in a moment.";
  } finally {
    state.loading = false;
    render();
  }
}

async function addPartner(name, place) {
  if (!name || !place) return;
  state.adding = true;
  state.note = "";
  render();
  const position = await geocode(place, state.city);
  state.adding = false;
  if (!position) {
    state.note = "That place was not found. Try a fuller address.";
    render();
    return;
  }
  state.partners = state.partners.concat([{ id: String(Date.now()), name, place, position }]);
  state.picked = null;
  state.legs = {};
  const list = options();
  if (list.length) showCourts(list.map((option) => option.court));
  render();
}

async function choose(id, mode) {
  const list = options();
  const option = list.find((item) => item.court.id === id);
  if (!option) return;
  const same = state.picked === id;
  state.picked = id;
  state.mode = mode;
  state.activeCourt = null;
  if (!same) state.legs = {};
  const existing = state.legs[mode];
  if (existing) {
    drawMeeting(list, id, people(), existing);
    render();
    return;
  }
  state.routing = true;
  render();
  const group = people();
  const legs = await Promise.all(group.map(async (person, index) => {
    const found = await oneLeg(mode, person.position, option.court.position, option.court.city);
    return {
      name: person.name,
      color: COLORS[index % COLORS.length],
      minutes: found ? found.minutes : null,
      km: found ? found.km : null,
      path: found ? found.path : [],
    };
  }));
  state.legs = { ...state.legs, [mode]: legs };
  state.routing = false;
  drawMeeting(list, id, group, legs);
  render();
}

render();
