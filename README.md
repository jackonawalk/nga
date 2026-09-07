# Astra Art Shuffle

A small API that selects uniformly from 58,261 distinct open-access NGA artworks.
The catalog is bundled on the server. Each request returns one URL, or redirects
to one image; your phone never downloads or splits the catalog.

## Cloudflare Worker

Extract this ZIP and open a terminal in the extracted nga-random-api folder:

```sh
npm ci
npx wrangler login
npm run deploy
```

Node.js 22 or newer and a Cloudflare account are required. The Worker is named astra-art-shuffle. Wrangler prints the deployed
workers.dev URL. No database, KV binding, NGA API key, or secrets are required.
For the Cloudflare browser editor, worker.mjs is also self-contained: its entire
contents are the Worker code. The file is large because it includes the catalog;
a project upload or CLI deployment is more convenient than copying it on a phone.

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
  open_access and pool_size fields.
- `https://YOUR_HOST/image` sends an HTTP 302 redirect to a random image.
- Add `?size=3000` for a different maximum edge, or `?size=0` for full resolution.
  For JSON plus a size, use `?format=json&size=3000`.

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

The catalog snapshot was prepared from NGA data downloaded on 2026-09-06.
Only primary images marked openaccess=1 are included, one entry per artwork ID.
Selection uses Web Crypto with rejection sampling to avoid modulo bias. Each run
is independent, so repeats are possible. There is no artist or medium balancing.

The API does not probe image availability, proxy image bytes, or refresh the
catalog on each request. If NGA removes an image, run the shortcut again.
To refresh, download published_images.csv from the official repository, run:

```sh
python3 build_catalog.py /path/to/published_images.csv
```

Then redeploy. build_catalog.py combines handler.mjs with the catalog to generate
worker.mjs. Edit handler.mjs and rebuild when changing API behavior.

Source: https://github.com/NationalGalleryOfArt/opendata
Dictionary: https://github.com/NationalGalleryOfArt/opendata/blob/main/documentation/Data%20Dictionary.txt
Image policy: https://www.nga.gov/artworks/free-images-and-open-access
The catalog metadata is CC0; image selection follows NGA's separate open-access flag.

## Validation and deployment status

Run `npm test` for the local checks: random-index rejection, size handling,
redirects, cache headers, error responses, and a real bundled-catalog response.
These checks passed under Node 24. Wrangler is pinned in package.json and package-lock.json. A deployment dry run could not complete here because network approval was cancelled. This project has not been deployed or tested
in Cloudflare's runtime or Replit, and no public endpoint has been created here.
