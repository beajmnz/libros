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

// `all: true` filters look across the four guides, not just the selected age group.
const FILTERS = [
  { id: "isla", label: "En la Isla", test: b => b.s === "Sí" },
  { id: "quiza", label: "Quizá", test: b => b.s === "Parcial" || b.s === "Revisar" },
  { id: "pendientes", label: "Sin leer", test: b => !isRead(b.id) },
  { id: "leidos", label: "Leídos", test: b => isRead(b.id) },
  { id: "favoritos", label: "Favoritos", test: b => rating(b.id) >= 4, sort: byRating },
  { id: "regalos", label: "Para regalar", test: b => isGift(b.id), all: true, sort: byRating },
  { id: "todos", label: "Todos", test: () => true },
];

// Books already read when the list was made (from the library loan history).
const STARTING_READ = ["b132"];

const STORE_STATE = "libros.estado.v2";
const STORE_OLD_READ = "libros.leidos.v1";
const STORE_PREFS = "libros.prefs.v1";
const SHARE_KEY = "lista";

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: changes last for this visit only */ }
  },
};

/*
 * state.read[id]  = [1 or 0, time]            star on/off and when it last changed
 * state.rev[id]   = { r: 0–5, g: 0|1, n: "", t: time }   hearts, gift idea, note
 * Times let two phones merge: for each book, the most recent change wins.
 */
function loadState() {
  const saved = store.get(STORE_STATE, null);
  if (saved && saved.read && saved.rev) return saved;
  const oldRead = store.get(STORE_OLD_READ, STARTING_READ);
  const read = {};
  for (const id of oldRead) read[id] = [1, 0];
  return { read, rev: {} };
}

const state = loadState();
const prefs = Object.assign({ group: "pre", filter: "isla" }, store.get(STORE_PREFS, {}));
let books = [];
let query = "";
let openEditor = null;

function saveState() { store.set(STORE_STATE, state); }
function savePrefs() { store.set(STORE_PREFS, prefs); }

function isRead(id) { return state.read[id]?.[0] === 1; }
function review(id) { return state.rev[id] || { r: 0, g: 0, n: "", t: 0 }; }
function rating(id) { return review(id).r; }
function isGift(id) { return review(id).g === 1; }
function hasReview(id) { const r = review(id); return r.r > 0 || r.g === 1 || r.n !== ""; }
function byRating(a, b) { return rating(b.id) - rating(a.id); }

function setRead(id, on) { state.read[id] = [on ? 1 : 0, Date.now()]; saveState(); }
function setReview(id, patch) {
  const next = Object.assign({}, review(id), patch, { t: Date.now() });
  next.n = (next.n || "").slice(0, 280);
  state.rev[id] = next;
  saveState();
}

const $ = id => document.getElementById(id);
const els = {
  groups: $("groups"), chips: $("chips"), q: $("q"), list: $("list"),
  summary: $("summary"), empty: $("empty"), incoming: $("incoming"), toast: $("toast"),
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

/* ---------- Header: age groups and filters ---------- */

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
    b.textContent = `${f.label} ${(f.all ? books : inGroup).filter(f.test).length}`;
    b.addEventListener("click", () => {
      prefs.filter = f.id; savePrefs(); renderChips(); renderList();
    });
    els.chips.append(b);
  }
}

/* ---------- Book cards ---------- */

function reviewSummary(b) {
  const box = document.createElement("div");
  box.className = "review-summary";
  const r = review(b.id);
  if (!hasReview(b.id)) { box.hidden = true; return box; }
  if (r.r > 0) {
    const hearts = document.createElement("span");
    hearts.className = "hearts-small";
    hearts.setAttribute("aria-label", `${r.r} de 5 corazones`);
    hearts.innerHTML = HEART.repeat(r.r);
    box.append(hearts);
  }
  if (r.g === 1) {
    const g = document.createElement("span");
    g.className = "gift-tag";
    g.innerHTML = GIFT + "<span>Para regalar</span>";
    box.append(g);
  }
  if (r.n) {
    const n = document.createElement("p");
    n.className = "review-note";
    n.textContent = r.n;
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

  const hearts = document.createElement("div");
  hearts.className = "hearts";
  hearts.setAttribute("role", "group");
  hearts.setAttribute("aria-label", "Valoración de 1 a 5");
  const heartBtns = [];
  for (let n = 1; n <= 5; n++) {
    const h = document.createElement("button");
    h.type = "button";
    h.innerHTML = HEART;
    h.setAttribute("aria-label", `${n} de 5`);
    h.addEventListener("click", () => {
      setReview(b.id, { r: rating(b.id) === n ? 0 : n });
      paint(); onChange();
    });
    heartBtns.push(h);
    hearts.append(h);
  }

  const gift = document.createElement("button");
  gift.type = "button";
  gift.className = "gift-toggle";
  gift.innerHTML = GIFT + "<span>Para regalar</span>";
  gift.addEventListener("click", () => {
    setReview(b.id, { g: isGift(b.id) ? 0 : 1 });
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
  note.addEventListener("input", () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { setReview(b.id, { n: note.value.trim() }); onChange(); }, 400);
  });

  const done = document.createElement("button");
  done.type = "button";
  done.className = "editor-done";
  done.textContent = "Listo";

  const row = document.createElement("div");
  row.className = "editor-row";
  row.append(hearts, gift);
  ed.append(q, row, lbl, note, done);

  function paint() {
    const r = review(b.id);
    heartBtns.forEach((h, i) => h.setAttribute("aria-pressed", String(i < r.r)));
    gift.setAttribute("aria-pressed", String(r.g === 1));
    if (document.activeElement !== note) note.value = r.n;
  }
  paint();
  ed.paint = paint;
  ed.done = done;
  ed.flushNote = () => {
    clearTimeout(noteTimer);
    if (note.value.trim() !== review(b.id).n) { setReview(b.id, { n: note.value.trim() }); onChange(); }
  };
  return ed;
}

function bookItem(b, showGroup) {
  const li = document.createElement("li");
  li.className = "book";

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
    const on = isRead(b.id);
    star.setAttribute("aria-pressed", String(on));
    star.setAttribute("aria-label", on ? `Quitar «${b.t}» de leídos` : `Marcar «${b.t}» como leído`);
    li.classList.toggle("is-read", on);
    rate.innerHTML = HEART + `<span>${hasReview(b.id) ? "Editar reseña" : "Valorar"}</span>`;
    const fresh = reviewSummary(b);
    summary.replaceWith(fresh);
    summary = fresh;
  };

  const editor = reviewEditor(b, () => { refreshCard(); renderChips(); renderSummary(); });
  const close = () => {
    editor.flushNote();
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
    setRead(b.id, !isRead(b.id));
    refreshCard(); renderSummary(); renderChips();
  });
  refreshCard();

  li.append(cover, info, star, editor);
  return li;
}

function visibleBooks() {
  if (query) {
    const q = norm(query);
    return books.filter(b => norm(b.t + " " + b.a + " " + b.c + " " + review(b.id).n).includes(q));
  }
  const f = currentFilter();
  const list = books.filter(b => (f.all || b.g === prefs.group) && f.test(b));
  return f.sort ? list.sort(f.sort) : list;
}

function currentFilter() { return FILTERS.find(x => x.id === prefs.filter) || FILTERS[0]; }

function renderSummary() {
  const f = currentFilter();
  if (query) { els.summary.textContent = "Buscando en las cuatro guías"; return; }
  if (f.all) {
    const n = books.filter(f.test).length;
    els.summary.textContent = `Ideas para regalar: ${n} ${n === 1 ? "libro" : "libros"} de las cuatro guías`;
    return;
  }
  const inGroup = books.filter(b => b.g === prefs.group);
  const read = inGroup.filter(b => isRead(b.id)).length;
  const there = inGroup.filter(b => b.s === "Sí").length;
  els.summary.innerHTML = `${GROUP_NAME[prefs.group]}: <strong>★ ${read} de ${inGroup.length}</strong> leídos · ${there} en La Isla Misteriosa`;
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

/* ---------- Sharing between phones ---------- */

function b64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function packState() {
  const num = id => Number(id.slice(1));
  return {
    v: 2,
    r: Object.entries(state.read).map(([id, [on, t]]) => [num(id), on, Math.round(t / 1000)]),
    w: Object.entries(state.rev).map(([id, x]) => [num(id), x.r, x.g, x.n, Math.round(x.t / 1000)]),
  };
}
function unpackState(p) {
  if (!p || p.v !== 2 || !Array.isArray(p.r) || !Array.isArray(p.w)) throw new Error("formato");
  const id = n => "b" + String(n).padStart(3, "0");
  const read = {}, rev = {};
  for (const [n, on, t] of p.r) read[id(n)] = [on ? 1 : 0, t * 1000];
  for (const [n, r, g, note, t] of p.w) rev[id(n)] = { r: Math.max(0, Math.min(5, r | 0)), g: g ? 1 : 0, n: String(note || "").slice(0, 280), t: t * 1000 };
  return { read, rev };
}

async function encodeState() {
  const json = new TextEncoder().encode(JSON.stringify(packState()));
  if ("CompressionStream" in window) {
    try { return "z" + b64url(await pipe(json, new CompressionStream("deflate-raw"))); } catch { /* fall through */ }
  }
  return "j" + b64url(json);
}
async function decodeState(code) {
  const kind = code[0], bytes = unb64url(code.slice(1));
  const raw = kind === "z" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
  return unpackState(JSON.parse(new TextDecoder().decode(raw)));
}

async function shareLink() {
  return `${location.origin}${location.pathname}#${SHARE_KEY}=${await encodeState()}`;
}

// What merging `other` would change here: books whose newer version comes from the other phone.
function diff(other) {
  const known = new Set(books.map(b => b.id));
  const read = Object.keys(other.read).filter(id => known.has(id) && other.read[id][1] > (state.read[id]?.[1] ?? -1) && other.read[id][0] !== (isRead(id) ? 1 : 0));
  const rev = Object.keys(other.rev).filter(id => known.has(id) && other.rev[id].t > review(id).t);
  return { read, rev };
}
function merge(other, d) {
  for (const id of d.read) state.read[id] = other.read[id];
  for (const id of d.rev) state.rev[id] = other.rev[id];
  saveState();
}

function describe(d) {
  const parts = [];
  const nr = d.read.length, nw = d.rev.length;
  if (nr) parts.push(`${nr} ${nr === 1 ? "cambio de estrella" : "cambios de estrellas"}`);
  if (nw) parts.push(`${nw} ${nw === 1 ? "reseña" : "reseñas"}`);
  return parts.join(" y ");
}

function showIncoming(other) {
  const d = diff(other);
  const clearHash = () => history.replaceState(null, "", location.pathname + location.search);
  if (!d.read.length && !d.rev.length) {
    clearHash();
    toast("Esta lista ya está al día con la tuya.");
    return;
  }
  els.incoming.innerHTML = "";
  const p = document.createElement("p");
  p.innerHTML = `<strong>Te han compartido una lista.</strong> Trae ${describe(d)} más recientes que los tuyos.`;
  const row = document.createElement("div");
  row.className = "incoming-row";
  const yes = document.createElement("button");
  yes.type = "button"; yes.className = "primary"; yes.textContent = "Unir con mi lista";
  const no = document.createElement("button");
  no.type = "button"; no.className = "secondary"; no.textContent = "Ahora no";
  row.append(yes, no);
  els.incoming.append(p, row);
  els.incoming.hidden = false;
  yes.addEventListener("click", () => {
    merge(other, d); clearHash(); els.incoming.hidden = true;
    renderChips(); renderList(); toast("Listas unidas.");
  });
  no.addEventListener("click", () => { clearHash(); els.incoming.hidden = true; });
}

async function readIncoming() {
  const m = location.hash.match(new RegExp(`^#${SHARE_KEY}=([A-Za-z0-9_-]+)$`));
  if (!m) return;
  try { showIncoming(await decodeState(m[1])); }
  catch { toast("Ese enlace de lista no se pudo leer. Pide que te lo vuelvan a enviar."); }
}

async function share() {
  const url = await shareLink();
  if (navigator.share) {
    try {
      await navigator.share({ title: "Nuestra lista de 100 libros", text: "Ábrelo para unir nuestras estrellas y reseñas:", url });
      return;
    } catch (e) { if (e && e.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Enlace copiado. Envíalo a tu pareja por WhatsApp o correo.");
  } catch {
    const box = $("share-box");
    box.open = true;
    const out = $("share-out");
    out.value = url; out.hidden = false; out.select();
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    toast("Copia el enlace de abajo y envíalo.");
  }
}

function setupSharing() {
  $("share").addEventListener("click", share);
  $("share-copy").addEventListener("click", async () => {
    const url = await shareLink();
    const out = $("share-out");
    try { await navigator.clipboard.writeText(url); toast("Enlace copiado."); }
    catch { out.value = url; out.hidden = false; out.select(); }
  });
  $("share-paste-go").addEventListener("click", async () => {
    const text = $("share-paste").value.trim();
    const msg = $("share-msg");
    const m = text.match(new RegExp(`#${SHARE_KEY}=([A-Za-z0-9_-]+)`));
    if (m) {
      try { showIncoming(await decodeState(m[1])); $("share-paste").value = ""; msg.textContent = ""; window.scrollTo({ top: 0, behavior: "smooth" }); }
      catch { msg.textContent = "Ese enlace no se pudo leer."; }
      return;
    }
    // Codes from the first version of the app: a list of book numbers like b001,b045.
    const ids = (text.match(/b\d{3}/g) || []).filter(id => books.some(b => b.id === id) && !isRead(id));
    if (!ids.length) { msg.textContent = "No reconozco ese texto. Pega el enlace completo que te enviaron."; return; }
    ids.forEach(id => setRead(id, true));
    renderChips(); renderList();
    msg.textContent = `Añadidas ${ids.length} estrellas.`;
    $("share-paste").value = "";
  });
}

/* ---------- Start ---------- */

let searchTimer;
els.q.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { query = els.q.value.trim(); renderList(); }, 150);
});

window.addEventListener("hashchange", readIncoming);

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
  setupSharing();
  readIncoming();
}

start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
