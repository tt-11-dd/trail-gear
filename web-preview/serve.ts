import { join } from 'path';

const PORT = 3000;
const DIR = import.meta.dir;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === '/' || path === '') path = '/index.html';
    if (path === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    const filePath = join(DIR, path);
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(file);
  },
});

console.log(`🚀 Trail Gear Web Preview is running at: http://localhost:${PORT}`);
