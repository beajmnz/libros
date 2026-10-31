# 100 libros

A phone-friendly reading list for families, based on the four 2026 reading guides (Prelectores, Primeros, Grandes and Jóvenes lectores). Pick an age group, see which books your library has, tap the star when a book has been read, and save the ones you loved as gift ideas.

**Everything lives in a Google Sheet:** the books, the covers, the library's name, the stars and the reviews. Change the sheet and every phone picks it up. Each family or group of friends has its own sheet.

## How it fits together

```
Website (GitHub Pages)  <-->  Apps Script in the sheet  <-->  Google Sheet
```

The website opens with a family link, `…/libros/?lista=<script address>`. Without one it shows an example list from `data/books.json`, and stars stay on that phone until a list is connected.

Anyone with the family link can read and change that list, so share it only with people you trust. Don't put the link in this repository: it is public.

## Setting up a list (once per family)

1. Make your own copy of the sheet (**File → Make a copy**). It needs the tabs **Libros** and **Ajustes**.
2. In the copy, open **Extensions → Apps Script**.
3. Replace everything in the editor with the contents of [`apps-script/Code.gs`](apps-script/Code.gs) and save.
4. Choose **Deploy → New deployment**, click the gear icon, and pick **Web app**.
5. Set **Execute as** to *Me* and **Who has access** to *Anyone*, then click **Deploy** and authorize it. Google warns that the app isn't verified, because you wrote it yourself: choose **Advanced → Go to … (unsafe)**.
6. Copy the **Web app** address, which ends in `/exec`.
7. Your family link is the site address plus `?lista=` and that address:
   `https://beajmnz.github.io/libros/?lista=PASTE_THE_ADDRESS_HERE`

Open the family link on your phone, then use **Add to Home Screen** (Safari: Share button; Chrome: menu) so the icon keeps the link. Phones that already have the icon can paste the link under **Compartir con la familia** at the bottom of the page. To invite someone else, tap the share button at the top right.

If you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version**, which keeps the same address.

## Editing the sheet

Changes reach the phones the next time the app is opened, or within about two minutes while it's open.

| To do this | Do this in the sheet |
|---|---|
| Change a cover | In **Portada**, paste `=IMAGE("https://…")` or just the link |
| Add a book | Add a row at the bottom with at least **Título** and **Grupo**. Leave **ID** empty: it fills in by itself |
| Remove a book | Delete its row |
| Change the library | Edit the **Ajustes** tab, then update **En la biblioteca** in **Libros** |
| Add an age group | Type a new name in **Grupo**, such as `Bebés (0-2 años)`. The bracket becomes the button label |

**Libros** columns are found by their heading, so you can move them, or add your own, but keep these names:

| Column | Meaning |
|---|---|
| Grupo, Nº, Título, Autor | The book. Nº is optional |
| Portada | Cover |
| En la biblioteca | `Sí`, `Parcial` (only another volume or edition), `Revisar` (unclear) or `No` |
| Título en el catálogo, Notas | Shown on the book's card |
| Leído, Corazones, Para regalar, Reseña | Filled in from the app, and editable here too |
| ID | Permanent code for the book. Don't edit it |

## Using the app

- **Star:** the book has been read.
- **Valorar:** 1 to 5 hearts, **Para regalar** to save it as a present idea, and an optional note.
- **Filters:** *Favoritos* lists books with 4 or 5 hearts in the current age group. *Para regalar* lists every gift idea from all the guides.
- **Search:** covers all the guides, including your notes.

The app keeps the last list on the phone, so it works with no signal. Changes made offline are sent when the connection returns.

## What's in this repository

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The website |
| `apps-script/Code.gs` | The script to paste into the sheet |
| `data/books.json` | Example list, used until a family link is connected |
| `covers/` | Cover thumbnails, used offline and when a cover link stops working |
| `sw.js`, `manifest.webmanifest`, `icon*` | Offline support and home-screen icon |

The site is published with GitHub Pages from the `main` branch, root folder. After changing the website's files, increase `VERSION` in `sw.js` so phones pick up the new version.
