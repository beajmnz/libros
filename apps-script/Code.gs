/**
 * Connects the Google Sheet with the website.
 *
 * Paste this into the sheet: Extensions > Apps Script, then deploy it as a
 * web app (see README.md). The website reads the books with GET and saves
 * stars and reviews with POST.
 *
 * Columns are found by their heading in the first row, so they can be moved,
 * and extra columns are ignored.
 */

const TAB_BOOKS = 'Libros';
const TAB_SETTINGS = 'Ajustes';
const NOTE_LIMIT = 280;

const HEADINGS = {
  group: 'Grupo',
  number: 'Nº',
  cover: 'Portada',
  title: 'Título',
  author: 'Autor',
  read: 'Leído',
  status: 'En la biblioteca',
  catalog: 'Título en el catálogo',
  notes: 'Notas',
  id: 'ID',
  hearts: 'Corazones',
  gift: 'Para regalar',
  review: 'Reseña',
};

function doGet() {
  try {
    return json_(Object.assign({ ok: true }, readAll_()));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const change = JSON.parse(e.postData.contents);
    saveChange_(change);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function bookSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_BOOKS);
  if (!sheet) throw new Error('No encuentro la pestaña «' + TAB_BOOKS + '».');
  return sheet;
}

/** Maps each field to its column number (1-based) using the heading row. */
function columns_(sheet) {
  const headings = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  const cols = {};
  Object.keys(HEADINGS).forEach(function (key) {
    const at = headings.indexOf(HEADINGS[key]);
    if (at === -1) throw new Error('Falta la columna «' + HEADINGS[key] + '».');
    cols[key] = at + 1;
  });
  return cols;
}

function readSettings_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_SETTINGS);
  const settings = {};
  if (!sheet) return settings;
  sheet.getDataRange().getValues().slice(1).forEach(function (row) {
    const key = String(row[0]).trim();
    if (key) settings[key] = String(row[1]).trim();
  });
  return settings;
}

/** Accepts =IMAGE("https://…") formulas and plain links. */
function coverUrl_(formula, value) {
  const inFormula = String(formula).match(/IMAGE\(\s*"(https?:[^"]+)"/i);
  if (inFormula) return inFormula[1];
  const text = String(value).trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

function nextId_(used) {
  let n = 0;
  used.forEach(function (id) {
    const m = String(id).match(/^b(\d+)$/);
    if (m) n = Math.max(n, Number(m[1]));
  });
  return 'b' + String(n + 1).padStart(3, '0');
}

function readAll_() {
  const sheet = bookSheet_();
  const cols = columns_(sheet);
  const rows = sheet.getLastRow() - 1;
  const books = [];

  if (rows > 0) {
    const width = sheet.getLastColumn();
    const range = sheet.getRange(2, 1, rows, width);
    const values = range.getValues();
    const formulas = range.getFormulas();
    const used = new Set();
    values.forEach(function (row) {
      const id = String(row[cols.id - 1]).trim();
      if (id) used.add(id);
    });
    const seen = new Set();

    values.forEach(function (row, i) {
      const cell = function (key) { return row[cols[key] - 1]; };
      const title = String(cell('title')).trim();
      if (!title) return;

      // New rows, and rows copied with their ID, get an ID of their own.
      let id = String(cell('id')).trim();
      if (!id || seen.has(id)) {
        id = nextId_(used);
        used.add(id);
        sheet.getRange(i + 2, cols.id).setValue(id);
      }
      seen.add(id);

      books.push({
        id: id,
        g: String(cell('group')).trim() || 'Otros',
        n: cell('number') === '' ? '' : String(cell('number')),
        t: title,
        a: String(cell('author')).trim(),
        s: String(cell('status')).trim() || 'No',
        c: String(cell('catalog')).trim(),
        note: String(cell('notes')).trim(),
        cover: coverUrl_(formulas[i][cols.cover - 1], cell('cover')),
        read: cell('read') === true,
        hearts: Number(cell('hearts')) || 0,
        gift: cell('gift') === true,
        review: String(cell('review')).trim(),
      });
    });
  }

  return {
    settings: readSettings_(),
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    books: books,
  };
}

/** Text starting with these characters would be read as a formula by Sheets. */
function plainText_(text) {
  const clean = String(text).trim().slice(0, NOTE_LIMIT);
  return /^[=+\-@]/.test(clean) ? "'" + clean : clean;
}

function saveChange_(change) {
  if (!change || !change.id) throw new Error('Falta el libro.');
  const sheet = bookSheet_();
  const cols = columns_(sheet);
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) throw new Error('La lista está vacía.');

  const ids = sheet.getRange(2, cols.id, rows, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); });
  const at = ids.indexOf(String(change.id));
  if (at === -1) throw new Error('Ese libro ya no está en la lista.');
  const row = at + 2;

  if ('read' in change) sheet.getRange(row, cols.read).setValue(change.read === true);
  if ('gift' in change) sheet.getRange(row, cols.gift).setValue(change.gift === true);
  if ('hearts' in change) {
    const hearts = Math.max(0, Math.min(5, Math.round(Number(change.hearts) || 0)));
    sheet.getRange(row, cols.hearts).setValue(hearts === 0 ? '' : hearts);
  }
  if ('review' in change) sheet.getRange(row, cols.review).setValue(plainText_(change.review));
}
