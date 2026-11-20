# Astra Art Shuffle

A tiny API that serves a random artwork from the
[National Gallery of Art](https://www.nga.gov)'s open-access collection.
Ask for an image and you get a different public-domain masterpiece every time,
which makes it a great source for a daily wallpaper, a screensaver, or a
"picture of the day" widget.

You can narrow the pool by date, by type of artwork, and to the gallery's
best-known works:

```
/image?type=painting&from=1850&to=1899&highlights=print
```

That request picks from about 150 well-known late 19th-century paintings,
including works by Degas, Manet, Renoir, Homer, Whistler and Sargent.

- **63,890 open-access artworks** from NGA's published open data
- **Runs on the Cloudflare Workers free plan**, or any Node.js 22+ host
- **No API keys, database, or secrets**: the catalog is bundled into the Worker
- **Lightweight**: the API returns a link or a redirect; images are served directly by NGA

> This is an independent project and is not affiliated with or endorsed by the
> National Gallery of Art.

## Endpoints

| Endpoint | Returns |
|---|---|
| `GET /image` | An HTTP 302 redirect to a random image. Most clients follow it automatically and get the JPEG. |
| `GET /random` | The image URL as plain text. |
| `GET /random?format=json` | JSON with details about the chosen artwork (see below). |

Every request picks independently and uniformly at random from the artworks
matching your filters, so repeats are possible but rare. Responses are never
cached.

### Query parameters

All parameters are optional and work on both `/image` and `/random`.

| Parameter | Example | Description |
|---|---|---|
| `size` | `size=3000` | Longest edge in pixels, 200–8000 (default 2000). Images are never enlarged beyond the original. Use `size=0` for full resolution. |
| `from`, `to` | `from=1850&to=1899` | Creation years. An artwork matches only if its entire recorded date range falls inside the filter. Either can be used alone. |
| `type` | `type=painting` | `painting`, `drawing`, `print`, `photograph`, `sculpture`, `decorative-art`, `portfolio`, `volume` or `technical-material`. Comma-separate to allow several, e.g. `type=painting,drawing`. |
| `highlights` | `highlights=print` | Favor well-known works: `print` (about 400 works NGA sells as custom prints, effectively its greatest hits) or `on-view` (about 2,000 works on display in the galleries when the catalog was built). `print,on-view` matches either. |
| `format` | `format=json` | `/random` only: `text` (default) or `json`. |

Prints and drawings make up most of the collection, so unfiltered requests
mostly return works on paper. Add `type=painting` if you want paintings.

Invalid parameters return `400` with a message listing the accepted values.
If no artwork matches your filters, the response is `404`.

### JSON response

```json
{
  "url": "https://api.nga.gov/iiif/4eea1722-7227-4a93-97fd-fe679520cf5b/full/!2000,2000/0/default.jpg",
  "object_id": 103923,
  "begin_year": 1895,
  "end_year": 1895,
  "type": "painting",
  "highlights": ["print"],
  "open_access": true,
  "pool_size": 150
}
```

`pool_size` is the number of artworks that matched your filters. `object_id`
is NGA's artwork ID, which you can use to look the work up in NGA's open data.

## Daily wallpaper with Apple Shortcuts

1. Create a Personal Automation (for example, **Time of Day** at 4:00 AM).
2. Add **Get Contents of URL** with your endpoint, e.g.
   `https://YOUR_HOST/image?type=painting&highlights=print`.
3. Add **Set Wallpaper**, using **Contents of URL** as the image.

Use `/image` with a single Get Contents of URL step. It already returns the
image, so don't add a second Get Contents of URL step; that pattern is only for
`/random`, which returns a link. Landscape artworks may be cropped to fit the
screen.

## Deploy your own

### Cloudflare Workers (recommended)

Requires Node.js 22+ and a Cloudflare account. The free plan is enough.

```sh
git clone https://github.com/jackonawalk/nga.git
cd nga
npm ci
npx wrangler login
npm run deploy
```

Wrangler prints your `workers.dev` URL when the deploy finishes.

> **Before deploying,** edit `wrangler.jsonc`: change `name` if you like, and
> remove the `routes` entry or replace `nga.jackonawalk.com` with your own
> domain. A custom domain must be a zone on your Cloudflare account; see
> [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

### Any Node.js host

```sh
npm start
```

The server has no dependencies, listens on `0.0.0.0`, and uses `PORT` if set
(default 3000). Use an always-on or autoscaling deployment with a stable public
URL.

## How it works

`build_catalog.py` reads NGA's open data and keeps one primary image per
artwork, only for images marked open access. For each artwork it stores the
IIIF image ID, its dimensions, its creation years, its type, and its highlight
flags. It then bundles that catalog together with `handler.mjs` into a single
self-contained `worker.mjs` (about 1.9 MB gzipped).

On each request the Worker filters the catalog (well under a millisecond) and
picks an entry using `crypto.getRandomValues` with rejection sampling, so every
matching artwork is equally likely. It then builds a
[IIIF](https://iiif.io) URL on NGA's image server. The API never downloads or
proxies image bytes.

| File | Purpose |
|---|---|
| `handler.mjs` | Request handling, filters, and random selection (edit this) |
| `build_catalog.py` | Builds the catalog from NGA's CSVs and generates `worker.mjs` |
| `worker.mjs` | Generated Worker: `handler.mjs` plus the bundled catalog (don't edit by hand) |
| `server.mjs` | Minimal Node.js server wrapping the Worker |
| `test.mjs` | Tests (`npm test`) |

### Updating the catalog

The catalog is a snapshot, last built from NGA data on **2026-11-20**. NGA
updates its data roughly daily, but the collection changes slowly, so
rebuilding every few months is plenty. Download
[`published_images.csv`](https://github.com/NationalGalleryOfArt/opendata/raw/main/data/published_images.csv)
and [`objects.csv`](https://github.com/NationalGalleryOfArt/opendata/raw/main/data/objects.csv)
(about 175 MB together), then run:

```sh
python3 build_catalog.py published_images.csv objects.csv
npm test
npm run deploy
```

After changing `handler.mjs`, rerun `build_catalog.py` so `worker.mjs` picks up
the change. `npm run check` does a Cloudflare deployment dry run.

## Data and licensing

- Collection data comes from NGA's [Open Data program](https://github.com/NationalGalleryOfArt/opendata)
  and is released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
  Field definitions are in the
  [data dictionary](https://github.com/NationalGalleryOfArt/opendata/blob/main/documentation/Data%20Dictionary.txt).
- Only images NGA marks as open access are included. See NGA's
  [open access policy](https://www.nga.gov/artworks/free-images-and-open-access)
  for how those images may be used.
- "Highlights" are proxies derived from NGA's data, not an official NGA ranking.

## License

The code in this repository is available under the [MIT License](LICENSE).
The bundled catalog is derived from NGA's CC0 open data.
