import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { websiteFiles } from './files.mjs';

const root = new URL('../', import.meta.url);
const allowed = new Set(websiteFiles);
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const types = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    if (!allowed.has(name)) {
      response.writeHead(404); response.end('Not found'); return;
    }
    const bytes = await readFile(new URL(name, root));
    const type = types[extname(name).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': type + (/^(text\/|application\/json|image\/svg)/.test(type) ? '; charset=utf-8' : ''),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(400); response.end('Bad request');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Set PORT to another port.` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Systems Design Lab: http://localhost:${port}/`));
