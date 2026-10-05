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
  city: "",
  ranked: [],
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

function describeCourt(court, count, totalMinutes) {
  const kind = (court.type || "sports court").split(";").pop().trim() || "sports court";
  const where = court.address || court.city || "the area around the group";
  const group = count === 1 ? "1 person" : count + " people";
  return court.name + " is a " + kind + " at " + where + ". By car, about " + totalMinutes + " minutes in total for " + group + ".";
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
    wrap.append(el("p", "lead", "Pick a sport, then add where each partner starts."));
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

  const partners = el("section", "stack");
  partners.append(el("h3", "", "Starting places"));
  partners.append(el("p", "lead", "Add each partner and where they leave from. The court is chosen after that, by car time."));
  if (state.you) {
    const you = el("div", "partner");
    const copy = el("div");
    const name = el("p", "who", "You");
    name.style.borderLeft = "8px solid #b8432f";
    name.style.paddingLeft = "8px";
    copy.append(name, el("p", "meta", state.city || "Your location"));
    you.append(copy);
    partners.append(you);
  } else partners.append(el("p", "lead", state.loading ? "Finding you…" : state.note || "Location is needed."));
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
  placeInput.placeholder = "Where they start, e.g. Guomao, Beijing";
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
    meetings.append(el("p", "lead", "Ranked by total driving time. Open one for light rail, public transit, walking, or cycling."));
    state.ranked.forEach((option, index) => {
      const box = el("div", "option" + (option.court.id === state.picked ? " active" : ""));
      const button = el("button", "card");
      button.type = "button";
      const row = el("span", "row");
      row.append(el("span", "", index + 1 + ". " + option.court.name));
      row.append(el("span", "meta", option.totalMinutes + " min"));
      button.append(row);
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
  state.loading = false;
  render();
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
    const center = [
      group.reduce((sum, person) => sum + person.position[0], 0) / group.length,
      group.reduce((sum, person) => sum + person.position[1], 0) / group.length,
    ];
    const farthest = Math.max.apply(null, group.map((person) => km(person.position, center)));
    const radius = Math.min(30000, Math.max(8000, Math.round(farthest * 1600)));
    let courts = await searchCourts(state.sport.keyword, center, radius);
    if (courts.length < 4) {
      const extra = await searchCourts(state.sport.fallback, center, Math.min(30000, radius * 2));
      const seen = {};
      courts.forEach((court) => { seen[court.id] = true; });
      courts = courts.concat(extra.filter((court) => !seen[court.id]));
    }
    courts = courts.slice(0, 6);
    const scored = [];
    for (const court of courts) {
      const drive = await legsFor({ court: court }, group, "drive");
      if (drive.some((leg) => leg.minutes == null)) continue;
      const totalMinutes = drive.reduce((sum, leg) => sum + leg.minutes, 0);
      const kind = (court.type || "sports court").split(";").pop().trim() || "sports court";
      scored.push({
        court: court,
        totalMinutes: totalMinutes,
        description: describeCourt(court, group.length, totalMinutes),
        drive: drive,
      });
      void kind;
    }
    scored.sort((a, b) => a.totalMinutes - b.totalMinutes);
    state.ranked = scored.slice(0, 3);
    if (!state.ranked.length) {
      state.note = "No court could be timed by car for this group. Amap covers mainland China best.";
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
