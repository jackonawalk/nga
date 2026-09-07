export const CATALOG_KEY = 'catalog-v1';
export const REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
export const SOURCE_URL = 'https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/published_images.csv';

// Stream the CSV: the source is much larger than the compact catalog and may
// contain quoted commas, escaped quotes, and multiline descriptions.
export async function parseCatalog(stream) {
  const entries = new Map();
  let columns, row = [], field = '', quoted = false, afterQuote = false;
  const finishField = () => { row.push(field); field = ''; };
  const finishRow = () => {
    finishField();
    if (row.length === 1 && row[0] === '') { row = []; return; }
    if (!columns) {
      row[0] = row[0].replace(/^\uFEFF/, '');
      columns = row;
      for (const name of ['uuid', 'iiifurl', 'viewtype', 'openaccess', 'depictstmsobjectid', 'width', 'height']) {
        if (!columns.includes(name)) throw new Error(`Missing CSV column: ${name}`);
      }
    } else {
      if (row.length !== columns.length) throw new Error('Incomplete CSV row');
      const r = Object.fromEntries(columns.map((name, i) => [name, row[i]]));
      if (r.openaccess === '1' && r.viewtype === 'primary' && /^\d+$/.test(r.depictstmsobjectid)
          && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(r.uuid)
          && r.iiifurl === `https://api.nga.gov/iiif/${r.uuid}`) {
        const id = Number(r.depictstmsobjectid), edge = Math.max(Number(r.width), Number(r.height));
        if (Number.isSafeInteger(id) && Number.isSafeInteger(edge) && edge > 0 && !entries.has(id)) {
          entries.set(id, [r.uuid, id, edge]);
        }
      }
    }
    row = [];
  };
  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    for (const char of chunk) {
      if (quoted) {
        if (char === '"') { quoted = false; afterQuote = true; }
        else field += char;
      } else if (afterQuote && char === '"') {
        field += '"'; quoted = true; afterQuote = false;
      } else {
        if (afterQuote && ![',', '\r', '\n'].includes(char)) throw new Error('Invalid quoted CSV field');
        afterQuote = false;
        if (char === ',') finishField();
        else if (char === '\n') finishRow();
        else if (char === '\r') continue;
        else if (char === '"' && field === '') quoted = true;
        else field += char;
      }
      if (field.length > 1_000_000) throw new Error('CSV field too large');
    }
  }
  if (quoted) throw new Error('Truncated quoted CSV field');
  if (field || row.length || afterQuote) finishRow();
  if (!entries.size) throw new Error('Empty catalog');
  return [...entries.values()];
}

export async function refreshCatalog(store, previousSize, fetcher = fetch) {
  if (!store) throw new Error('CATALOG KV binding is required for scheduled refresh');
  const response = await fetcher(SOURCE_URL, {signal: AbortSignal.timeout(5 * 60 * 1000)});
  if (!response.ok || !response.body) throw new Error(`NGA download failed: ${response.status}`);
  const catalog = await parseCatalog(response.body);
  // Reject suspiciously partial downloads, even if they ended at a row boundary.
  if (catalog.length < previousSize / 2) throw new Error('Catalog unexpectedly shrank by more than half');
  const snapshot = {refreshedAt: new Date().toISOString(), catalog};
  await store.put(CATALOG_KEY, JSON.stringify(snapshot));
  console.log(`Refreshed catalog: ${catalog.length} artworks at ${snapshot.refreshedAt}`);
  return snapshot;
}

export function createWorker(handle, fallback) {
  let snapshot = {catalog: fallback, refreshedAt: null}, nextRead = 0, reading, refreshing;
  async function load(store) {
    if (!store || Date.now() < nextRead) return snapshot;
    if (!reading) reading = (async () => {
      try {
        const saved = await store.get(CATALOG_KEY, 'json');
        if (saved?.catalog?.length && saved.refreshedAt) snapshot = saved;
        nextRead = Date.now() + 60 * 60 * 1000;
      } catch (error) {
        console.error('Catalog read failed; keeping last good catalog', error);
        nextRead = Date.now() + 60 * 1000;
      }
      return snapshot;
    })().finally(() => { reading = null; });
    return reading;
  }
  return {
    async fetch(request, env = {}) {
      const current = await load(env.CATALOG);
      const response = handle(request, current.catalog);
      response.headers.set('X-Catalog-Refreshed-At', current.refreshedAt || 'bundled');
      return response;
    },
    async scheduled(_event, env = {}) {
      if (!refreshing) refreshing = (async () => {
        await load(env.CATALOG);
        snapshot = await refreshCatalog(env.CATALOG, snapshot.catalog.length);
        nextRead = Date.now() + 60 * 60 * 1000;
      })().finally(() => { refreshing = null; });
      return refreshing;
    }
  };
}
