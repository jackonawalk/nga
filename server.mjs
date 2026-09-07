import http from 'node:http';
import worker from './worker.mjs';
import {REFRESH_INTERVAL} from './catalog-refresh.mjs';
import {createFileStore} from './node-catalog-store.mjs';
const env = {CATALOG: createFileStore()};
const refresh = () => worker.scheduled({}, env).catch(error => console.error('Catalog refresh failed; will retry in 24 hours', error));
void refresh();
setInterval(refresh, REFRESH_INTERVAL).unref();
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  try {
    const request = new Request(new URL(req.url, 'http://localhost'), {method: req.method});
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500); res.end('Internal server error');
  }
}).listen(port, '0.0.0.0', () => console.log(`Listening on port ${port}`));
