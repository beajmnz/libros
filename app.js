"use strict";

/*
 * The books, the settings, the stars and the reviews live in a Google Sheet.
 * A small Apps Script in that sheet (apps-script/Code.gs) is the bridge: each
 * family has its own sheet and script, and opens the site with
 * ?lista=<script address>. Without that link the site shows the bundled list
 * (data/books.json) and keeps changes on the phone until a list is connected.
 */

const STORE_LIST = "libros.lista.v1";
const STORE_DATA = "libros.datos.v3";
const STORE_PENDING = "libros.pendiente.v3";
const STORE_MOVED = "libros.migrado.v3";
const STORE_PREFS = "libros.prefs.v1";
const STORE_OLD_STATE = "libros.estado.v2";
const STORE_OLD_READ = "libros.leidos.v1";

const REFRESH_EVERY = 2 * 60 * 1000;

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: this visit only */ }
  },
};

const prefs = Object.assign({ group: "", filter: "isla" }, store.get(STORE_PREFS, {}));
let data = { settings: {}, books: [] };
let pending = store.get(STORE_PENDING, {});   // changes not yet saved in the sheet, by book id
let listUrl = "";
let query = "";
let openEditor = null;
let lastRefresh = 0;
let flushing = false;
let saveFailed = false;
let flushTimer;

function savePrefs() { store.set(STORE_PREFS, prefs); }
function savePending() { store.set(STORE_PENDING, pending); }

/* ---------- Reading a book, with changes not yet saved applied on top ---------- */

const books = () => data.books;
function view(b) { return Object.assign({}, b, pending[b.id]); }
const isRead = b => view(b).read === true;
const hearts = b => view(b).hearts || 0;
const isGift = b => view(b).gift === true;
const reviewText = b => view(b).review || "";
const hasReview = b => hearts(b) > 0 || isGift(b) || reviewText(b) !== "";

function change(b, patch) {
  pending[b.id] = Object.assign({}, pending[b.id], patch);
  savePending();
  queueFlush();
}

/* ---------- Names that come from the sheet ---------- */

const setting = (key, fallback) => data.settings[key] || fallback;
const library = () => setting("Biblioteca", "la biblioteca");
const shortName = () => setting("Nombre corto", "la biblioteca");
const inLibrary = () => `En ${shortName()}`;

const STATUS = () => ({
  "Sí": { label: inLibrary(), cls: "s-si" },
  "Parcial": { label: "Otro de la serie", cls: "s-parcial" },
  "Revisar": { label: "Preguntar", cls: "s-revisar" },
  "No": { label: "No está", cls: "s-no" },
});

// "Primeros lectores (5+)" becomes { name: "Primeros", short: "5+" }.
function groupParts(group) {
  const m = group.match(/\(([^)]*)\)/);
  const short = m ? m[1].replace(/\s*años/i, "").replace(/(\d)-(\d)/, "$1–$2").trim() : "";
  return { name: group.replace(/\s*\(.*$/, "").split(" ")[0], short };
}
function groups() { return [...new Set(books().map(b => b.g))]; }

function filters() {
  return [
    { id: "isla", label: inLibrary(), test: b => b.s === "Sí" },
    { id: "quiza", label: "Quizá", test: b => b.s === "Parcial" || b.s === "Revisar" },
    { id: "pendientes", label: "Sin leer", test: b => !isRead(b) },
    { id: "leidos", label: "Leídos", test: isRead },
    { id: "favoritos", label: "Favoritos", test: b => hearts(b) >= 4, sort: byHearts },
    { id: "regalos", label: "Para regalar", test: isGift, all: true, sort: byHearts },
    { id: "todos", label: "Todos", test: () => true },
  ];
}
function byHearts(a, b) { return hearts(b) - hearts(a); }
function currentFilter() {
  const list = filters();
  return list.find(x => x.id === prefs.filter) || list[0];
}

const $ = id => document.getElementById(id);
const els = {
  groups: $("groups"), chips: $("chips"), q: $("q"), list: $("list"), summary: $("summary"),
  empty: $("empty"), notice: $("notice"), sync: $("sync"), toast: $("toast"),
};

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.34 1.05 6.13L12 16.88l-5.5 2.89 1.05-6.13L3.1 9.3l6.15-.9z"/></svg>';
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.6-4.6-9.2-9.1C1.7 8 3.6 4.6 7 4.6c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.3 3.4 4.2 6.6-1.6 4.5-9.2 9.1-9.2 9.1z"/></svg>';
const GIFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v7.5h14v-7.5M12 8.5V20M12 8.5c-1.5-3.6-6-4.4-6-1.6 0 1.6 3 1.6 6 1.6zm0 0c1.5-3.6 6-4.4 6-1.6 0 1.6-3 1.6-6 1.6z"/></svg>';

function norm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { els.toast.hidden = true; }, 3200);
}

function renderBranding() {
  const lib = library(), town = setting("Localidad", "");
  $("brand-num").textContent = setting("Número", "100");
  $("brand-title").textContent = setting("Título", "libros para leer antes de crecer");
  $("brand-place").textContent = `Biblioteca ${lib}${town ? " · " + town : ""}`;
  document.title = `${setting("Número", "100")} libros · ${lib}`;
  $("legend-si").textContent = inLibrary();
  $("legend-no").textContent = `No aparece en el catálogo de ${lib}.`;
  $("legend-source").textContent = `Comprobado en ${setting("Comprobado en", "el catálogo de la biblioteca")}.`;
  const link = $("sheet-link");
  link.hidden = !data.sheetUrl;
  if (data.sheetUrl) link.href = data.sheetUrl;
}

/* ---------- Header: age groups and filters ---------- */

function renderGroups() {
  const list = groups();
  if (!list.includes(prefs.group)) prefs.group = list[0] || "";
  els.groups.innerHTML = "";
  els.groups.style.setProperty("--groups", Math.max(list.length, 1));
  for (const g of list) {
    const { name, short } = groupParts(g);
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", String(prefs.group === g));
    const big = document.createElement("b"); big.textContent = short || name;
    const small = document.createElement("span"); small.textContent = short ? name : "";
    b.append(big, small);
    b.addEventListener("click", () => {
      prefs.group = g; savePrefs(); renderGroups(); renderChips(); renderList();
      window.scrollTo({ top: 0 });
    });
    els.groups.append(b);
  }
}

function renderChips() {
  const inGroup = books().filter(b => b.g === prefs.group);
  els.chips.innerHTML = "";
  for (const f of filters()) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", String(prefs.filter === f.id));
    b.textContent = `${f.label} ${(f.all ? books() : inGroup).filter(f.test).length}`;
    b.addEventListener("click", () => {
      prefs.filter = f.id; savePrefs(); renderChips(); renderList();
    });
    els.chips.append(b);
  }
}

/* ---------- Book cards ---------- */

function coverElement(b) {
  const blank = () => {
    const box = document.createElement("div");
    box.className = "cover blank";
    box.textContent = b.t.replace(/^[¡¿"“]+/, "").charAt(0);
    box.setAttribute("aria-hidden", "true");
    return box;
  };
  const local = `covers/${b.id}.jpg`;
  const img = document.createElement("img");
  img.className = "cover";
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.width = 64; img.height = 88;
  // The link in the sheet comes first; the bundled thumbnail covers offline use and broken links.
  const remote = /^https:\/\//i.test(b.cover || "") ? b.cover : "";
  img.src = remote || local;
  img.addEventListener("error", () => {
    if (img.getAttribute("src") === local) img.replaceWith(blank());
    else img.src = local;
  });
  return img;
}

function reviewSummary(b) {
  const box = document.createElement("div");
  box.className = "review-summary";
  if (!hasReview(b)) { box.hidden = true; return box; }
  if (hearts(b) > 0) {
    const h = document.createElement("span");
    h.className = "hearts-small";
    h.setAttribute("aria-label", `${hearts(b)} de 5 corazones`);
    h.innerHTML = HEART.repeat(hearts(b));
    box.append(h);
  }
  if (isGift(b)) {
    const g = document.createElement("span");
    g.className = "gift-tag";
    g.innerHTML = GIFT + "<span>Para regalar</span>";
    box.append(g);
  }
  if (reviewText(b)) {
    const n = document.createElement("p");
    n.className = "review-note";
    n.textContent = reviewText(b);
    box.append(n);
  }
  return box;
}

function reviewEditor(b, onChange) {
  const ed = document.createElement("div");
  ed.className = "editor";
  ed.hidden = true;

  const q = document.createElement("p");
  q.className = "editor-label";
  q.textContent = "¿Os gustó?";

  const heartRow = document.createElement("div");
  heartRow.className = "hearts";
  heartRow.setAttribute("role", "group");
  heartRow.setAttribute("aria-label", "Valoración de 1 a 5");
  const heartBtns = [];
  for (let n = 1; n <= 5; n++) {
    const h = document.createElement("button");
    h.type = "button";
    h.innerHTML = HEART;
    h.setAttribute("aria-label", `${n} de 5`);
    h.addEventListener("click", () => {
      change(b, { hearts: hearts(b) === n ? 0 : n });
      paint(); onChange();
    });
    heartBtns.push(h);
    heartRow.append(h);
  }

  const gift = document.createElement("button");
  gift.type = "button";
  gift.className = "gift-toggle";
  gift.innerHTML = GIFT + "<span>Para regalar</span>";
  gift.addEventListener("click", () => {
    change(b, { gift: !isGift(b) });
    paint(); onChange();
  });

  const noteId = `nota-${b.id}`;
  const lbl = document.createElement("label");
  lbl.className = "editor-label";
  lbl.htmlFor = noteId;
  lbl.textContent = "Nota (opcional)";
  const note = document.createElement("textarea");
  note.id = noteId;
  note.rows = 2;
  note.maxLength = 280;
  note.placeholder = "Por qué nos gustó, para quién sería un buen regalo…";
  let noteTimer;
  const saveNote = () => {
    clearTimeout(noteTimer);
    const text = note.value.trim();
    if (text !== reviewText(b)) { change(b, { review: text }); onChange(); }
  };
  note.addEventListener("input", () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(saveNote, 500);
  });

  const done = document.createElement("button");
  done.type = "button";
  done.className = "editor-done";
  done.textContent = "Listo";

  const row = document.createElement("div");
  row.className = "editor-row";
  row.append(heartRow, gift);
  ed.append(q, row, lbl, note, done);

  function paint() {
    heartBtns.forEach((h, i) => h.setAttribute("aria-pressed", String(i < hearts(b))));
    gift.setAttribute("aria-pressed", String(isGift(b)));
    if (document.activeElement !== note) note.value = reviewText(b);
  }
  paint();
  ed.paint = paint;
  ed.done = done;
  ed.saveNote = saveNote;
  return ed;
}

function bookItem(b, showGroup) {
  const li = document.createElement("li");
  li.className = "book";

  const info = document.createElement("div");
  info.className = "info";
  const statuses = STATUS();
  const st = statuses[b.s] || statuses.No;
  const h = document.createElement("h2"); h.textContent = b.t;
  const a = document.createElement("p"); a.className = "author"; a.textContent = b.a;
  const meta = document.createElement("div"); meta.className = "meta";
  const pill = document.createElement("span"); pill.className = `pill ${st.cls}`; pill.textContent = st.label;
  meta.append(pill);
  const tag = document.createElement("span"); tag.className = "tag";
  const number = b.n !== "" ? `nº ${b.n}` : "";
  tag.textContent = showGroup ? [groupParts(b.g).name, number].filter(Boolean).join(" · ") : number;
  meta.append(tag);
  info.append(h, a, meta);

  if (b.c && b.c !== b.t && b.s !== "No") {
    const c = document.createElement("p"); c.className = "catalog";
    const lbl = document.createElement("span");
    lbl.textContent = b.c.includes("|") ? `${inLibrary()}: ` : "Allí se llama: ";
    c.append(lbl, b.c.split(" | ").join(" · "));
    info.append(c);
  }
  if (b.note) {
    const n = document.createElement("p"); n.className = "note"; n.textContent = b.note;
    info.append(n);
  }

  let summary = reviewSummary(b);
  info.append(summary);

  const rate = document.createElement("button");
  rate.type = "button";
  rate.className = "rate";
  rate.setAttribute("aria-expanded", "false");
  info.append(rate);

  const star = document.createElement("button");
  star.type = "button";
  star.className = "star";
  star.innerHTML = STAR;

  const refreshCard = () => {
    const on = isRead(b);
    star.setAttribute("aria-pressed", String(on));
    star.setAttribute("aria-label", on ? `Quitar «${b.t}» de leídos` : `Marcar «${b.t}» como leído`);
    li.classList.toggle("is-read", on);
    rate.innerHTML = HEART + `<span>${hasReview(b) ? "Editar reseña" : "Valorar"}</span>`;
    const fresh = reviewSummary(b);
    summary.replaceWith(fresh);
    summary = fresh;
  };

  const editor = reviewEditor(b, () => { refreshCard(); renderChips(); renderSummary(); });
  const close = () => {
    editor.saveNote();
    editor.hidden = true;
    rate.setAttribute("aria-expanded", "false");
    if (openEditor === close) openEditor = null;
  };
  rate.addEventListener("click", () => {
    if (!editor.hidden) { close(); return; }
    if (openEditor) openEditor();
    editor.paint();
    editor.hidden = false;
    rate.setAttribute("aria-expanded", "true");
    openEditor = close;
  });
  editor.done.addEventListener("click", () => { close(); rate.focus(); });

  star.addEventListener("click", () => {
    change(b, { read: !isRead(b) });
    refreshCard(); renderSummary(); renderChips();
  });
  refreshCard();

  li.append(coverElement(b), info, star, editor);
  return li;
}

function visibleBooks() {
  if (query) {
    const q = norm(query);
    return books().filter(b => norm(`${b.t} ${b.a} ${b.c} ${reviewText(b)}`).includes(q));
  }
  const f = currentFilter();
  const list = books().filter(b => (f.all || b.g === prefs.group) && f.test(b));
  return f.sort ? list.sort(f.sort) : list;
}

function renderSummary() {
  const f = currentFilter();
  if (query) { els.summary.textContent = "Buscando en todas las guías"; return; }
  if (f.all) {
    const n = books().filter(f.test).length;
    els.summary.textContent = `Ideas para regalar: ${n} ${n === 1 ? "libro" : "libros"} de todas las guías`;
    return;
  }
  const inGroup = books().filter(b => b.g === prefs.group);
  const read = inGroup.filter(isRead).length;
  const there = inGroup.filter(b => b.s === "Sí").length;
  els.summary.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = `★ ${read} de ${inGroup.length}`;
  els.summary.append(`${groupParts(prefs.group).name}: `, strong, ` leídos · ${there} en ${library()}`);
}

function renderList() {
  openEditor = null;
  const f = currentFilter();
  const list = visibleBooks();
  els.list.replaceChildren(...list.map(b => bookItem(b, !!query || !!f.all)));
  els.empty.hidden = list.length > 0;
  if (!list.length) {
    els.empty.textContent = query
      ? `Ningún libro de las guías coincide con «${query}».`
      : {
          leidos: "Todavía no hay estrellas en este grupo. Toca la estrella de un libro cuando lo leáis.",
          favoritos: "Aún no hay favoritos. Toca «Valorar» en un libro y dale 4 o 5 corazones.",
          regalos: "Aún no hay ideas para regalar. Toca «Valorar» en un libro y marca «Para regalar».",
        }[prefs.filter] || "No hay libros con este filtro.";
  }
  renderSummary();
}

function renderAll() {
  renderBranding();
  renderGroups();
  renderChips();
  renderList();
}

/* ---------- Talking to the sheet ---------- */

function setSync(text) { els.sync.textContent = text; els.sync.hidden = !text; }

function showSyncState() {
  const waiting = Object.keys(pending).length;
  if (!listUrl || !waiting) { setSync(""); return; }
  setSync(navigator.onLine === false || saveFailed
    ? `Sin conexión: ${waiting} ${waiting === 1 ? "cambio se guardará" : "cambios se guardarán"} al volver la señal.`
    : "Guardando…");
}

async function fetchList() {
  const res = await fetch(listUrl, { redirect: "follow" });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || "La lista no respondió.");
  return body;
}

async function refresh({ force = false } = {}) {
  if (!listUrl) return;
  if (!force && Date.now() - lastRefresh < REFRESH_EVERY) return;
  // Never swap the list under someone writing a review; the next refresh will catch up.
  if (openEditor) return;
  lastRefresh = Date.now();
  try {
    const body = await fetchList();
    if (openEditor) { lastRefresh = 0; return; }
    data = { settings: body.settings || {}, books: body.books || [], sheetUrl: body.sheetUrl };
    store.set(STORE_DATA, data);
    els.notice.hidden = true;
    renderAll();
  } catch {
    if (navigator.onLine !== false && !books().length) {
      showNotice("No se pudo abrir tu lista. Comprueba que el enlace es el que os enviaron y que el script sigue publicado.");
    }
  }
}

async function flush() {
  if (!listUrl || flushing) { showSyncState(); return; }
  flushing = true;
  showSyncState();
  try {
    for (const id of Object.keys(pending)) {
      const sent = pending[id];
      const res = await fetch(listUrl, {
        method: "POST",
        // Plain text keeps the browser from sending a pre-check that Apps Script can't answer.
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ id }, sent)),
      });
      const body = await res.json();
      if (!body.ok && !/ya no está/.test(body.error || "")) throw new Error(body.error);
      const b = books().find(x => x.id === id);
      if (b && body.ok) Object.assign(b, sent);
      // Keep anything changed while this request was on its way.
      if (JSON.stringify(pending[id]) === JSON.stringify(sent)) delete pending[id];
      savePending();
    }
    store.set(STORE_DATA, data);
    saveFailed = false;
  } catch {
    saveFailed = true;   // no signal or a Google hiccup: try again later
  }
  flushing = false;
  showSyncState();
  if (Object.keys(pending).length) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 30000); }
}

function queueFlush() {
  showSyncState();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 700);
}

function showNotice(text) {
  els.notice.textContent = text;
  els.notice.hidden = false;
}

// Stars and reviews saved on the phone by earlier versions go to the sheet once.
function moveOldData() {
  if (store.get(STORE_MOVED, false)) return;
  const oldState = store.get(STORE_OLD_STATE, null);
  const oldRead = store.get(STORE_OLD_READ, []);
  for (const id of oldRead) pending[id] = Object.assign({ read: true }, pending[id]);
  if (oldState) {
    for (const [id, [on]] of Object.entries(oldState.read || {})) {
      if (on === 1) pending[id] = Object.assign({ read: true }, pending[id]);
    }
    for (const [id, r] of Object.entries(oldState.rev || {})) {
      pending[id] = Object.assign({}, pending[id], { hearts: r.r || 0, gift: r.g === 1, review: r.n || "" });
    }
  }
  savePending();
  store.set(STORE_MOVED, true);
}

/* ---------- Connecting a list and inviting family ---------- */

function validListUrl(text) {
  try {
    const u = new URL(text.trim());
    const fromGoogle = u.protocol === "https:" && u.hostname === "script.google.com" && u.pathname.endsWith("/exec");
    return (fromGoogle || u.hostname === "localhost") ? u.href : "";
  } catch { return ""; }
}

function listFrom(text) {
  try {
    const nested = new URL(text.trim()).searchParams.get("lista");
    if (nested) return validListUrl(nested);
  } catch { /* not a link */ }
  return validListUrl(text);
}

function inviteLink() {
  return `${location.origin}${location.pathname}?lista=${encodeURIComponent(listUrl)}`;
}

async function share() {
  if (!listUrl) {
    $("share-box").open = true;
    $("share-box").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const url = inviteLink();
  if (navigator.share) {
    try {
      await navigator.share({ title: "Nuestra lista de libros", text: "Nuestra lista de libros, con estrellas y reseñas compartidas:", url });
      return;
    } catch (e) { if (e && e.name === "AbortError") return; }
  }
  copyLink(url);
}

async function copyLink(url) {
  const out = $("share-out");
  try {
    await navigator.clipboard.writeText(url);
    toast("Enlace copiado. Envíalo por WhatsApp o correo.");
  } catch {
    out.value = url; out.hidden = false; out.select();
    $("share-box").open = true;
  }
}

function setupSharing() {
  $("share").addEventListener("click", share);
  $("share-copy").addEventListener("click", () => {
    if (listUrl) copyLink(inviteLink());
    else $("share-msg").textContent = "Primero conecta tu lista pegando su enlace aquí abajo.";
  });
  $("share-connect").addEventListener("click", async () => {
    const url = listFrom($("share-paste").value);
    if (!url) { $("share-msg").textContent = "No reconozco ese enlace. Pega el que os enviaron, completo."; return; }
    connect(url);
    $("share-paste").value = "";
    $("share-msg").textContent = "";
    await refresh({ force: true });
    flush();
    toast("Lista conectada.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function connect(url) {
  listUrl = url;
  store.set(STORE_LIST, url);
  $("share-copy").hidden = false;
  els.notice.hidden = true;
}

/* ---------- Start ---------- */

let searchTimer;
els.q.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { query = els.q.value.trim(); renderList(); }, 150);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { refresh(); flush(); }
});
window.addEventListener("online", () => { refresh({ force: true }); flush(); });
window.addEventListener("offline", showSyncState);
setInterval(() => { if (document.visibilityState === "visible") refresh(); }, REFRESH_EVERY);

async function start() {
  moveOldData();
  setupSharing();

  const fromLink = validListUrl(new URLSearchParams(location.search).get("lista") || "");
  const saved = store.get(STORE_LIST, "");
  if (fromLink || saved) connect(fromLink || saved);

  // Show the last copy straight away; the sheet can take a few seconds to answer.
  const cached = store.get(STORE_DATA, null);
  if (cached && cached.books && cached.books.length) {
    data = cached;
  } else {
    try {
      data = await (await fetch("data/books.json")).json();
    } catch {
      els.empty.hidden = false;
      els.empty.textContent = "No se pudo cargar la lista. Comprueba la conexión y vuelve a abrir la página.";
      return;
    }
  }
  renderAll();

  if (listUrl) {
    await refresh({ force: true });
    flush();
  } else {
    showNotice("Esta es la lista de ejemplo y las estrellas solo se guardan en este móvil. Para compartirlas, abre el enlace de tu familia.");
  }
}

start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
