export function randomIndex(n, fill = a => crypto.getRandomValues(a)) {
  const limit = Math.floor(4294967296 / n) * n;
  const value = new Uint32Array(1);
  do { fill(value); } while (value[0] >= limit);
  return value[0] % n;
}

export function handle(request, catalog) {
  const headers = {'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'};
  const reply = (text, status = 200, extra = {}) => new Response(text, {
    status, headers: {...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra}
  });
  if (request.method === 'OPTIONS') return new Response(null, {status: 204,
    headers: {...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS'}});
  if (request.method !== 'GET') return reply('Use GET', 405, {Allow: 'GET, OPTIONS'});
  const url = new URL(request.url);
  if (!['/', '/random', '/image'].includes(url.pathname)) return reply('Not found', 404);
  const format = url.searchParams.get('format') || 'text';
  if (!['text', 'json'].includes(format)) return reply('format must be text or json', 400);
  const sizeParam = url.searchParams.get('size') || '2000';
  if (!/^(0|[1-9][0-9]*)$/.test(sizeParam)) return reply('Invalid size', 400);
  const size = Number(sizeParam);
  if (size !== 0 && (size < 200 || size > 8000)) return reply('size must be 0 or 200–8000', 400);
  const [uuid, objectId, longestEdge] = catalog[randomIndex(catalog.length)];
  const edge = Math.min(size, longestEdge);
  const imageUrl = `https://api.nga.gov/iiif/${uuid}/full/${size === 0 ? 'full' : `!${edge},${edge}`}/0/default.jpg`;
  if (url.pathname === '/image') return new Response(null, {
    status: 302, headers: {...headers, Location: imageUrl}
  });
  if (format === 'json') return reply(JSON.stringify({url: imageUrl, object_id: objectId,
    open_access: true, pool_size: catalog.length}), 200, {'Content-Type': 'application/json'});
  return reply(imageUrl);
}
