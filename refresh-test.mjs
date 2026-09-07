import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseCatalog, refreshCatalog, createWorker, CATALOG_KEY} from './catalog-refresh.mjs';
import {createFileStore} from './node-catalog-store.mjs';
import {handle} from './handler.mjs';

const uuid = '00007f61-4922-417b-8f27-893ea328206c';
const header = 'uuid,iiifurl,viewtype,openaccess,depictstmsobjectid,width,height,description\r\n';
const row = (id, access = 1, view = 'primary') => `${uuid},https://api.nga.gov/iiif/${uuid},${view},${access},${id},400,900,"a, b ""quoted""\nline"\r\n`;
const csv = '\uFEFF' + header + row(1) + row(1) + row(2, 0) + row(3, 1, 'alternate');
const bytes = new TextEncoder().encode(csv);
const stream = new ReadableStream({start(controller) {
  // Every CSV delimiter, escaped quote, and BOM crosses a chunk boundary.
  for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
  controller.close();
}});
assert.deepEqual(await parseCatalog(stream), [[uuid, 1, 900]]);
for (const bad of ['oops', header, header + row(1) + '"unterminated', header + 'a,b\n']) {
  await assert.rejects(parseCatalog(new Response(bad).body));
}
let saved = {catalog: [[uuid, 9, 800]], refreshedAt: '2026-09-01T00:00:00Z'}, writes = 0;
const store = {get: async () => saved, put: async (key, value) => {
  assert.equal(key, CATALOG_KEY); writes++; saved = JSON.parse(value);
}};
const worker = createWorker(handle, [[uuid, 7, 700]]);
assert.equal((await (await worker.fetch(new Request('https://test/random?format=json'), {CATALOG: store})).json()).object_id, 9);
await refreshCatalog(store, 1, async () => new Response(csv));
assert.equal(saved.catalog[0][1], 1);
const good = saved;
await assert.rejects(refreshCatalog(store, 1, async () => new Response('', {status: 503})));
await assert.rejects(refreshCatalog(store, 1, async () => { throw new Error('offline'); }));
await assert.rejects(refreshCatalog(store, 10, async () => new Response(csv)));
await assert.rejects(refreshCatalog(store, 1, async () => new Response(header)));
assert.equal(writes, 1);
assert.equal(saved, good);
await assert.rejects(refreshCatalog({put: async () => { throw new Error('storage unavailable'); }}, 1, async () => new Response(csv)));
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response(header + row(42));
  await worker.scheduled({}, {CATALOG: store});
  assert.equal((await (await worker.fetch(new Request('https://test/random?format=json'), {CATALOG: store})).json()).object_id, 42);
  globalThis.fetch = async () => new Response('', {status: 500});
  await assert.rejects(worker.scheduled({}, {CATALOG: store}));
  assert.equal((await (await worker.fetch(new Request('https://test/random?format=json'), {CATALOG: store})).json()).object_id, 42);
} finally { globalThis.fetch = originalFetch; }
const dir = await mkdtemp(join(tmpdir(), 'astra-catalog-test-'));
try {
  const file = join(dir, 'nested/catalog.json');
  assert.equal(await createFileStore(file).get(), null);
  await createFileStore(file).put(CATALOG_KEY, JSON.stringify(saved));
  assert.deepEqual(await createFileStore(file).get(), saved);
} finally { await rm(dir, {recursive: true, force: true}); }
console.log('Passed: streaming CSV, filtering, deduplication, refresh, failure retention, scheduled integration, disk persistence');
