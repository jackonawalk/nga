# Astra Art Shuffle

A small API that selects uniformly from 63,890 distinct open-access NGA artworks.
The catalog is bundled on the server. Each request returns one URL, or redirects
to one image; your phone never downloads or splits the catalog.

## Cloudflare Worker

From the project folder:

```sh
npm ci
npx wrangler login
npm run deploy
```

Node.js 22 or newer and a Cloudflare account are required; the Workers Free plan
is sufficient. The Worker is named astra-art-shuffle. Wrangler prints the deployed
workers.dev URL. No database, KV binding, NGA API key, or secrets are required.
worker.mjs is self-contained, but it is large because it includes the catalog,
so deploy with the CLI rather than pasting it into the browser editor.

Cloudflare deployment instructions:
https://developers.cloudflare.com/workers/get-started/guide/

## Replit / Node.js

Upload the extracted project files into a Node.js project using Node 22 or newer.
Set its run command to `npm start` (no dependency installation is needed).
It listens on 0.0.0.0 and uses PORT when supplied, otherwise port 3000.
Publish as an Autoscale deployment for a persistent public endpoint; use the
published URL in Shortcuts, not a development preview URL.

https://docs.replit.com/features/publishing/deployment-types

## Endpoints

Replace YOUR_HOST with the actual hostname supplied by your hosting provider.

- `https://YOUR_HOST/random` returns just a direct JPEG URL as plain text.
- `https://YOUR_HOST/random?format=json` returns JSON with url, object_id,
  begin_year, end_year, type, highlights, open_access and pool_size fields. pool_size is the
  number of artworks matching any filters.
- `https://YOUR_HOST/image` sends an HTTP 302 redirect to a random image.
- Add `?size=3000` for a different maximum edge, or `?size=0` for full resolution.
  For JSON plus a size, use `?format=json&size=3000`.
- Add `from` and/or `to` (years) to either endpoint to limit the creation date,
  e.g. `/image?from=1850&to=1899` for late 19th-century art. An artwork matches
  only if its whole recorded creation range falls inside the filter, so a work
  dated 1845–1855 is excluded from 1850–1899. Undated works (a few dozen) never
  match a year filter. If nothing matches, the response is 404.
- Add `type` to limit the kind of artwork, using NGA's normalized
  classification: painting, drawing, print, photograph, sculpture,
  decorative-art, portfolio, volume or technical-material. Separate several
  with commas, e.g. `type=painting,drawing`. Combine with years, e.g.
  `/image?type=painting&from=1850&to=1899`. Prints and drawings make up most of
  the catalog, so unfiltered results are mostly works on paper.
- Add `highlights` to favor well-known works. NGA has no popularity field, so
  this uses two proxies: `print` (NGA sells a custom print of the work, about
  400 works, its de facto greatest hits) and `on-view` (on display in an NGA
  gallery at the last catalog rebuild, about 2,000 works). `highlights=print,on-view`
  matches either. For example, `/image?type=painting&from=1850&to=1899&highlights=print`
  picks from about 150 well-known late 19th-century paintings.

Default size is 2000 pixels on the longest edge, preserving aspect ratio without
requesting an enlargement of smaller originals. Allowed sizes are 200–8000, or 0.
All endpoint responses use Cache-Control: no-store, including redirects.

## Apple Shortcut

Simplest workflow:
1. URL: `https://YOUR_HOST/image`
2. Get Contents of URL (GET). The redirect leads to the actual image.
3. Set Wallpaper Photo, using the downloaded image and your chosen wallpaper.

If you prefer the URL response explicitly:
1. Get Contents of URL: `https://YOUR_HOST/random`
2. Get Contents of URL again, using the first action's result as its URL.
3. Set Wallpaper Photo, using the second action's result.

Allow network access when iOS asks. These steps have not been tested on an iPhone.
Landscape images may be cropped by the wallpaper action.

## Randomness and catalog maintenance

The catalog snapshot was built from NGA data on 2026-11-20 (63,890 artworks).
Only primary images marked openaccess=1 are included, one entry per artwork ID.
Selection uses Web Crypto with rejection sampling to avoid modulo bias. Each run
is independent, so repeats are possible. There is no artist or medium balancing.

The catalog does not refresh automatically. The API does not probe image
availability or proxy image bytes; if NGA removes an image, run the shortcut again.
To refresh, download published_images.csv and objects.csv from the official
repository's data folder and run:

```sh
python3 build_catalog.py /path/to/published_images.csv /path/to/objects.csv
npm test
npm run deploy
```

build_catalog.py combines handler.mjs with the catalog to generate worker.mjs.
Edit handler.mjs and rebuild when changing API behavior, then update the artwork
count and date above.

Source: https://github.com/NationalGalleryOfArt/opendata
Dictionary: https://github.com/NationalGalleryOfArt/opendata/blob/main/documentation/Data%20Dictionary.txt
Image policy: https://www.nga.gov/artworks/free-images-and-open-access
The catalog metadata is CC0; image selection follows NGA's separate open-access flag.

## Validation and deployment status

Run `npm test` for random-index rejection, size handling, redirects, cache
headers, error responses, and a real bundled-catalog response. Run
`npm run check` for a Cloudflare deployment dry run. Wrangler is pinned in
package.json and package-lock.json.
