import { join } from 'path';

const PORT = 3000;
const DIR = import.meta.dir;

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === '/' || path === '') path = '/index.html';

    const filePath = join(DIR, path);
    const file = Bun.file(filePath);
    return new Response(file);
  },
});

console.log(`🚀 Trail Gear Web Preview is running at: http://localhost:${PORT}`);
