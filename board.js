const SPORTS = [
  { id: "basketball", label: "Basketball" },
  { id: "football", label: "Football" },
  { id: "badminton", label: "Badminton" },
  { id: "tennis", label: "Tennis" },
  { id: "table-tennis", label: "Table tennis" },
  { id: "running", label: "Running" },
];

const SAMPLES = [
  { id: "sample-bj", sport: "basketball", place: "Chaoyang outdoor court", city: "Beijing", when: "Tonight, 19:00", host: "Sample", enrolled: 6, mine: false },
  { id: "sample-sh", sport: "badminton", place: "Jing'an hall, court 3", city: "Shanghai", when: "Saturday, 10:00", host: "Sample", enrolled: 4, mine: false },
  { id: "sample-sz", sport: "football", place: "Nanshan five-a-side pitch", city: "Shenzhen", when: "Sunday, 16:30", host: "Sample", enrolled: 9, mine: false },
  { id: "sample-cd", sport: "running", place: "Jinjiang river path", city: "Chengdu", when: "Weekday dawn", host: "Sample", enrolled: 3, mine: false },
  { id: "sample-hz", sport: "table-tennis", place: "West Lake community tables", city: "Hangzhou", when: "Friday, 18:30", host: "Sample", enrolled: 2, mine: false },
];

const KEY = "mappa-civitas-pages";
const state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    /* keep samples */
  }
  return { sport: "all", selectedId: SAMPLES[0].id, gatherings: SAMPLES };
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function label(id) {
  const found = SPORTS.find((sport) => sport.id === id);
  return found ? found.label : id;
}

const filters = document.getElementById("filters");
const list = document.getElementById("list");
const selected = document.getElementById("selected");
const sportSelect = document.getElementById("sport-select");

SPORTS.forEach((sport) => {
  const option = document.createElement("option");
  option.value = sport.id;
  option.textContent = sport.label;
  sportSelect.appendChild(option);
});

function renderFilters() {
  filters.replaceChildren();
  const all = document.createElement("button");
  all.type = "button";
  all.className = "chip" + (state.sport === "all" ? " active" : "");
  all.textContent = "All";
  all.addEventListener("click", () => {
    state.sport = "all";
    save();
    render();
  });
  filters.appendChild(all);
  SPORTS.forEach((sport) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.sport === sport.id ? " active" : "");
    button.textContent = sport.label;
    button.addEventListener("click", () => {
      state.sport = sport.id;
      save();
      render();
    });
    filters.appendChild(button);
  });
}

function render() {
  renderFilters();
  const visible = state.gatherings.filter((item) => state.sport === "all" || item.sport === state.sport);
  list.replaceChildren();
  const head = document.createElement("div");
  head.className = "list-head";
  const title = document.createElement("h2");
  title.textContent = "Board";
  const count = document.createElement("span");
  count.className = "count";
  count.textContent = visible.length + " open";
  head.append(title, count);
  list.appendChild(head);

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No gatherings for this sport yet.";
    list.appendChild(empty);
  } else {
    visible.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card" + (item.id === state.selectedId ? " active" : "");
      const row = document.createElement("span");
      row.className = "row";
      const place = document.createElement("span");
      place.textContent = item.place;
      row.appendChild(place);
      if (item.mine) {
        const yours = document.createElement("span");
        yours.className = "yours");
        yours.textContent = "Yours";
        row.appendChild(yours);
      }
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = item.city + " \u00b7 " + label(item.sport) + " \u00b7 " + item.when;
      const enrolled = document.createElement("span");
      enrolled.className = "meta";
      enrolled.textContent = item.enrolled + " enrolled \u00b7 " + item.host;
      button.append(row, meta, enrolled);
      button.addEventListener("click", () => {
        state.selectedId = item.id;
        save();
        render();
      });
      list.appendChild(button);
    });
  }

  const current = state.gatherings.find((item) => item.id === state.selectedId);
  if (!selected) return;
  selected.replaceChildren();
  if (!current) return;
  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = current.place;
  const span = document.createElement("span");
  span.textContent = current.city + " \u00b7 " + label(current.sport) + " \u00b7 directions after Amap";
  copy.append(strong, span);
  selected.appendChild(copy);
}

document.getElementById("enroll").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const host = String(data.get("host") || "").trim();
  const place = String(data.get("place") || "").trim();
  const city = String(data.get("city") || "").trim();
  const when = String(data.get("when") || "").trim();
  const sport = String(data.get("sport") || "basketball");
  if (!host || !place || !city || !when) return;
  const gathering = {
    id: crypto.randomUUID(),
    sport,
    place,
    city,
    when,
    host,
    enrolled: 1,
    mine: true,
  };
  state.gatherings.unshift(gathering);
  state.selectedId = gathering.id;
  state.sport = "all";
  save();
  event.currentTarget.reset();
  render();
});

render();
