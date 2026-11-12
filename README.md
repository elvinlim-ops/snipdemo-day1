# Snip backend

A zero-dependency Bun URL shortener. Run `bun start` (default port 3000).
Links and hit counts are kept in memory and disappear when the server restarts.

| Method | Path | Result |
| --- | --- | --- |
| POST | `/api/links` | JSON `{ "url": "https://example.com" }` returns 201 with `{ code, url, shortUrl, hits, createdAt }`; invalid JSON or a non-HTTP(S) URL returns 400 with `{ error }`. |
| GET | `/api/links` | Array of link objects. |
| GET | `/:code` | 302 to the original URL and increments hits, or 404. |

`PORT` changes the listening port. `BASE_URL` controls the origin in short
URLs; otherwise `RAILWAY_PUBLIC_DOMAIN` selects its HTTPS origin, falling back
to `http://localhost:<PORT>`. Set `PUBLIC_DIR` to serve files from that
directory, including `index.html` at `/`. Existing files take precedence over
matching short codes. The API allows cross-origin requests.

Run the focused checks with `bun test`.
