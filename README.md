# 100 libros · La Isla Misteriosa

The four 2026 reading guides (Prelectores, Primeros, Grandes and Jóvenes lectores), checked against the catalog of Biblioteca La Isla Misteriosa in Torrejón de Ardoz. Use it on your phone at the library: pick an age group, see which books are there, tap the star when a book has been read, and save the ones you loved as gift ideas.

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

## Stars and reviews

- **Star:** tap it when a book has been read.
- **Valorar:** opens a small review: 1 to 5 hearts, **Para regalar** to save it as a present idea, and an optional note.
- **Filters:** *Favoritos* lists books with 4 or 5 hearts in the current age group. *Para regalar* lists every gift idea from all four guides.
- **Search:** also finds words in your notes.

Everything is saved on the phone only: no accounts, nothing sent to a server. *El pequeño conejo blanco* starts with a star because it is already in the library loan history.

## Sharing with a partner

Tap the share button (top right) and send the link, for example by WhatsApp. When the other person opens it, the page offers to merge the two lists. Each book's star and review carry the time they last changed, so when both phones changed the same book, the most recent change wins (removing a star included). The link holds the whole list, compressed, in the part after `#`, which browsers don't send to the server.

Merging is not live: after making changes, share again. Codes from the first version of the app (`b001,b045,…`) can still be pasted into **Compartir con tu pareja** at the bottom of the page.

## Changing the data

Edit `data/books.json`, then open `sw.js` and increase `VERSION` (for example from `"v4"` to `"v5"`) so phones pick up the new list.
