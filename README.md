# 100 libros · La Isla Misteriosa

The four 2026 reading guides (Prelectores, Primeros, Grandes and Jóvenes lectores), checked against the catalog of Biblioteca La Isla Misteriosa in Torrejón de Ardoz. Use it on your phone at the library: pick an age group, see which books are there, and tap the star when a book has been read.

## Put it on GitHub Pages

1. Create a new repository on GitHub, for example `libros`. It can be public or private (private Pages needs a paid plan).
2. Upload everything in this folder to the repository root: on the repository page choose **Add file → Upload files**, drag in the contents of the folder (not the folder itself), and commit.
3. Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose the `main` branch and the `/ (root)` folder, and save.
4. After a minute or two the site is live at `https://<your-user>.github.io/libros/`.

On the phone, open that address and use **Add to Home Screen** (Safari: Share button; Chrome: menu). After the first visit it also works without signal.

## What's in it

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `data/books.json` | The 400 books: group, number, title, author, status at La Isla Misteriosa, catalog title and notes |
| `covers/` | Cover thumbnails for all 400 books (Open Library, Casa del Libro, Amazon and publishers) |
| `sw.js`, `manifest.webmanifest`, `icon*` | Offline support and home-screen icon |

Status values in `books.json` (`s`): `Sí` the library has it, `Parcial` only another volume or edition, `Revisar` unclear, `No` not in the catalog. Checked in October 2026; the library's collection changes over time.

## Stars

Stars are saved on each phone. To copy them to another phone, open **Pasar las estrellas a otro móvil** at the bottom of the page, copy the code, and paste it on the other phone. *El pequeño conejo blanco* starts with a star because it is already in the library loan history.

## Changing the data

Edit `data/books.json`, then open `sw.js` and change `VERSION` (for example to `"v2"`) so phones pick up the new list.
