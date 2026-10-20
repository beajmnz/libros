"use strict";

const GROUPS = [
  { id: "pre", short: "0–4", name: "Prelectores" },
  { id: "pri", short: "5+", name: "Primeros" },
  { id: "gra", short: "8+", name: "Grandes" },
  { id: "jov", short: "11+", name: "Jóvenes" },
];
const GROUP_NAME = Object.fromEntries(GROUPS.map(g => [g.id, g.name]));

const STATUS = {
  "Sí": { label: "En la Isla", cls: "s-si" },
  "Parcial": { label: "Otro de la serie", cls: "s-parcial" },
  "Revisar": { label: "Preguntar", cls: "s-revisar" },
  "No": { label: "No está", cls: "s-no" },
};

const FILTERS = [
  { id: "isla", label: "En la Isla", test: b => b.s === "Sí" },
  { id: "quiza", label: "Quizá", test: b => b.s === "Parcial" || b.s === "Revisar" },
  { id: "pendientes", label: "Sin leer", test: b => !readSet.has(b.id) },
  { id: "leidos", label: "Leídos", test: b => readSet.has(b.id) },
  { id: "todos", label: "Todos", test: () => true },
];

// Books already read when the list was made (from the library loan history).
const STARTING_READ = ["b132"];

const STORE_READ = "libros.leidos.v1";
const STORE_PREFS = "libros.prefs.v1";

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: stars last for this visit only */ }
  },
};

let books = [];
const readSet = new Set(store.get(STORE_READ, STARTING_READ));
const prefs = Object.assign({ group: "pre", filter: "isla" }, store.get(STORE_PREFS, {}));
let query = "";

const $ = id => document.getElementById(id);
const els = {
  groups: $("groups"), chips: $("chips"), q: $("q"), list: $("list"),
  summary: $("summary"), empty: $("empty"),
};

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.34 1.05 6.13L12 16.88l-5.5 2.89 1.05-6.13L3.1 9.3l6.15-.9z"/></svg>';

function norm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function saveRead() { store.set(STORE_READ, [...readSet].sort()); }
function savePrefs() { store.set(STORE_PREFS, prefs); }

function renderGroups() {
  els.groups.innerHTML = "";
  for (const g of GROUPS) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", String(prefs.group === g.id));
    b.innerHTML = `<b>${g.short}</b><span>${g.name}</span>`;
    b.addEventListener("click", () => {
      prefs.group = g.id; savePrefs(); renderGroups(); renderChips(); renderList();
      window.scrollTo({ top: 0 });
    });
    els.groups.append(b);
  }
}

function renderChips() {
  const inGroup = books.filter(b => b.g === prefs.group);
  els.chips.innerHTML = "";
  for (const f of FILTERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", String(prefs.filter === f.id));
    b.textContent = `${f.label} ${inGroup.filter(f.test).length}`;
    b.addEventListener("click", () => {
      prefs.filter = f.id; savePrefs(); renderChips(); renderList();
    });
    els.chips.append(b);
  }
}

function bookItem(b, showGroup) {
  const li = document.createElement("li");
  li.className = "book" + (readSet.has(b.id) ? " is-read" : "");

  let cover;
  if (b.cv) {
    cover = document.createElement("img");
    cover.className = "cover";
    cover.src = `covers/${b.id}.jpg`;
    cover.alt = "";
    cover.loading = "lazy";
    cover.decoding = "async";
    cover.width = 64; cover.height = 88;
  } else {
    cover = document.createElement("div");
    cover.className = "cover blank";
    cover.textContent = b.t.replace(/^[¡¿"“]+/, "").charAt(0);
    cover.setAttribute("aria-hidden", "true");
  }

  const info = document.createElement("div");
  info.className = "info";
  const st = STATUS[b.s] || STATUS.No;
  const h = document.createElement("h2"); h.textContent = b.t;
  const a = document.createElement("p"); a.className = "author"; a.textContent = b.a;
  const meta = document.createElement("div"); meta.className = "meta";
  const pill = document.createElement("span"); pill.className = `pill ${st.cls}`; pill.textContent = st.label;
  meta.append(pill);
  const tag = document.createElement("span"); tag.className = "tag";
  tag.textContent = showGroup ? `${GROUP_NAME[b.g]} · nº ${b.n}` : `nº ${b.n}`;
  meta.append(tag);
  info.append(h, a, meta);

  const cleanCatalog = b.c && b.c !== b.t ? b.c : "";
  if (cleanCatalog && b.s !== "No") {
    const c = document.createElement("p"); c.className = "catalog";
    const lbl = document.createElement("span");
    lbl.textContent = b.c.includes("|") ? "En la Isla: " : "Allí se llama: ";
    c.append(lbl, b.c.split(" | ").join(" · "));
    info.append(c);
  }
  if (b.note) {
    const n = document.createElement("p"); n.className = "note"; n.textContent = b.note;
    info.append(n);
  }

  const star = document.createElement("button");
  star.type = "button";
  star.className = "star";
  star.innerHTML = STAR;
  const setStar = () => {
    const on = readSet.has(b.id);
    star.setAttribute("aria-pressed", String(on));
    star.setAttribute("aria-label", on ? `Quitar «${b.t}» de leídos` : `Marcar «${b.t}» como leído`);
    li.classList.toggle("is-read", on);
  };
  setStar();
  star.addEventListener("click", () => {
    if (readSet.has(b.id)) readSet.delete(b.id); else readSet.add(b.id);
    saveRead(); setStar(); renderSummary(); renderChips();
  });

  li.append(cover, info, star);
  return li;
}

function visibleBooks() {
  if (query) {
    const q = norm(query);
    return books.filter(b => norm(b.t + " " + b.a + " " + b.c).includes(q));
  }
  const f = FILTERS.find(x => x.id === prefs.filter) || FILTERS[0];
  return books.filter(b => b.g === prefs.group && f.test(b));
}

function renderSummary() {
  const inGroup = books.filter(b => b.g === prefs.group);
  const read = inGroup.filter(b => readSet.has(b.id)).length;
  const there = inGroup.filter(b => b.s === "Sí").length;
  const name = GROUP_NAME[prefs.group];
  els.summary.innerHTML = query
    ? `Buscando en las cuatro guías`
    : `${name}: <strong>★ ${read} de ${inGroup.length}</strong> leídos · ${there} en La Isla Misteriosa`;
}

function renderList() {
  const list = visibleBooks();
  els.list.replaceChildren(...list.map(b => bookItem(b, !!query)));
  els.empty.hidden = list.length > 0;
  if (!list.length) {
    els.empty.textContent = query
      ? `Ningún libro de las guías coincide con «${query}».`
      : prefs.filter === "leidos"
        ? "Todavía no hay estrellas en este grupo. Toca la estrella de un libro cuando lo leáis."
        : "No hay libros con este filtro.";
  }
  renderSummary();
}

function setupBackup() {
  const copyMsg = $("copy-msg"), importMsg = $("import-msg"), text = $("import-text");
  $("copy").addEventListener("click", async () => {
    const code = [...readSet].sort().join(",");
    if (!code) { copyMsg.textContent = "Aún no hay estrellas."; return; }
    try {
      await navigator.clipboard.writeText(code);
      copyMsg.textContent = `Copiado (${readSet.size} libros).`;
    } catch {
      text.value = code; text.select();
      copyMsg.textContent = "Selecciona el texto de abajo y cópialo.";
    }
  });
  $("import").addEventListener("click", () => {
    const ids = (text.value.match(/b\d{3}/g) || []).filter(id => books.some(b => b.id === id));
    if (!ids.length) { importMsg.textContent = "Ese código no tiene libros reconocibles."; return; }
    const before = readSet.size;
    ids.forEach(id => readSet.add(id));
    saveRead(); renderChips(); renderList();
    importMsg.textContent = `Añadidas ${readSet.size - before} estrellas nuevas.`;
    text.value = "";
  });
}

let searchTimer;
els.q.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { query = els.q.value.trim(); renderList(); }, 150);
});

async function start() {
  renderGroups();
  try {
    const res = await fetch("data/books.json");
    books = await res.json();
  } catch {
    els.empty.hidden = false;
    els.empty.textContent = "No se pudo cargar la lista. Comprueba la conexión y vuelve a abrir la página.";
    return;
  }
  renderChips();
  renderList();
  setupBackup();
}

start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
