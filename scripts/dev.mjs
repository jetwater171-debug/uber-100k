import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, extname } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { adminHandler } from '../server/admin.mjs';
import { localAuth } from '../server/auth.mjs';
import { memoryStore } from '../server/store.mjs';

const publicDir = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4280);
const admin = adminHandler({ auth: localAuth(), store: memoryStore() });
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.json': 'application/json',
};

await build();
const server = createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      outgoing.writeHead(403).end();
      return;
    }
    const { method, headers } = incoming;
    const url = new URL(incoming.url, `http://${host}`);
    if (url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/')) {
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') {
        init.body = Readable.toWeb(incoming);
        init.duplex = 'half';
      }
      const response = await admin(new Request(url, init));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const route = url.pathname === '/' ? '/index.html' : url.pathname === '/admin' ? '/admin.html' : url.pathname;
    const filename = resolve(publicDir, '.' + decodeURIComponent(route));
    const target = relative(publicDir, filename);
    if (isAbsolute(target) || target.startsWith('..')) { outgoing.writeHead(404).end(); return; }
    const type = mime[extname(filename)];
    if (!type) { outgoing.writeHead(404).end(); return; }
    const bytes = await readFile(filename);
    outgoing.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    outgoing.end(method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    outgoing.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Painel local de testes em http://127.0.0.1:${port}/admin`));
