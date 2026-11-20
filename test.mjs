import assert from 'node:assert/strict';
import {randomIndex, handle} from './handler.mjs';
import worker from './worker.mjs';
let calls = 0;
assert.equal(randomIndex(3, a => { a[0] = calls++ === 0 ? 4294967295 : 5; }), 2);
assert.equal(calls, 2); // Reject tail values rather than introducing modulo bias.
const pool = [['example', 1, 900]];
let r = handle(new Request('https://test/random'), pool);
assert.match(await r.text(), /!900,900/);
assert.equal(r.headers.get('Cache-Control'), 'no-store');
r = handle(new Request('https://test/image?size=0'), pool);
assert.equal(r.status, 302);
assert.match(r.headers.get('Location'), /full\/full/);
assert.equal(handle(new Request('https://test/random?size=-1'), pool).status, 400);
assert.equal(handle(new Request('https://test/unknown'), pool).status, 404);
assert.equal(handle(new Request('https://test/random', {method:'POST'}), pool).status, 405);
// Year filters: whole creation range must fall inside [from, to]; undated works never match.
const dated = [['a', 1, 900, 1860, 1860], ['b', 2, 900, 1845, 1855], ['c', 3, 900, 1890, 1905],
  ['d', 4, 900, null, null], ['e', 5, 900, 1700, 1700]];
const ids = async query => (await handle(new Request(`https://test/random?format=json&${query}`), dated).json());
for (let i = 0; i < 20; i++) assert.equal((await ids('from=1850&to=1899')).object_id, 1);
assert.equal((await ids('from=1850&to=1899')).pool_size, 1);
assert.equal((await ids('to=1750')).object_id, 5);
assert.equal((await ids('from=1850')).pool_size, 2);
assert.equal((await ids('')).pool_size, 5);
assert.deepEqual([(await ids('to=1750')).begin_year, (await ids('to=1750')).end_year], [1700, 1700]);
r = handle(new Request('https://test/image?from=1850&to=1899'), dated);
assert.equal(r.status, 302);
assert.match(r.headers.get('Location'), /\/iiif\/a\//);
for (const bad of ['from=1900&to=1850', 'from=abc', 'to=18500', 'from=']) {
  assert.equal(handle(new Request(`https://test/random?${bad}`), dated).status, 400, bad);
}
assert.equal(handle(new Request('https://test/image?from=2500&to=2600'), dated).status, 404);
r = await worker.fetch(new Request('https://test/random?format=json'));
const data = await r.json();
assert.ok(data.pool_size > 50000);
assert.match(data.url, /^https:\/\/api\.nga\.gov\/iiif\/[0-9a-f-]+\/full\/!\d+,\d+\/0\/default\.jpg$/);
const late = await (await worker.fetch(new Request('https://test/random?format=json&from=1850&to=1899'))).json();
assert.ok(late.pool_size > 5000 && late.pool_size < data.pool_size);
assert.ok(late.begin_year >= 1850 && late.end_year <= 1899);
console.log('Passed: unbiased index rejection, sizing, no-store, redirects, errors, year filters, bundled catalog');
