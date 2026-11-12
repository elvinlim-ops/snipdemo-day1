import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:net';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let origin = process.env.SNIP_URL;
let server;
let output = '';
if (!origin) {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.env.BUN_BIN || 'bun', ['server.js'], {
    cwd: join(root, 'bundle'),
    env: { ...process.env, PORT: String(port), BASE_URL: origin, PUBLIC_DIR: './public' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', data => { output += data; });
  server.stderr.on('data', data => { output += data; });
  server.on('error', error => { output += error.message; });
}
async function cli(args) {
  const child = spawn(process.execPath, [join(root, 'bundle', 'cli.js'), ...args], {
    env: { ...process.env, SNIP_API: origin }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, stderr);
  return stdout.trim();
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      ready = (await fetch(`${origin}/api/links`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch (error) {
      if (attempt === 59) throw new Error(`Server did not start: ${output}`, { cause: error });
    }
    if (ready) break;
    await sleep(500);
  }
  assert.ok(ready, output);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<app-root/);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)];
  assert.ok(assets.length > 0);
  for (const [, asset] of assets) assert.equal((await fetch(new URL(asset, `${origin}/`))).status, 200);
  for (const body of ['{', JSON.stringify({ url: 'file:///bad' })]) {
    const invalid = await fetch(`${origin}/api/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(invalid.status, 400);
    assert.equal(typeof (await invalid.json()).error, 'string');
  }
  const response = await fetch(`${origin}/api/links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/snip-smoke' }),
  });
  assert.equal(response.status, 201);
  const link = await response.json();
  assert.deepEqual(Object.keys(link).sort(), ['code', 'url', 'shortUrl', 'hits', 'createdAt'].sort());
  assert.match(link.code, /^[A-Za-z0-9]{6}$/);
  assert.equal(link.hits, 0);
  assert.equal(new Date(link.createdAt).toISOString(), link.createdAt);
  const redirect = await fetch(`${origin}/${link.code}`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), link.url);
  const links = await (await fetch(`${origin}/api/links`)).json();
  assert.equal(links.find(item => item.code === link.code).hits, 1);
  assert.match(await cli(['ls']), new RegExp(link.code));
  const shortUrl = await cli(['add', 'https://example.com/from-cli']);
  const listed = await (await fetch(`${origin}/api/links`)).json();
  assert.ok(listed.some(item => item.shortUrl === shortUrl));
  assert.equal((await fetch(`${origin}/not-a-code`)).status, 404);
  const preflight = await fetch(`${origin}/api/links`, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  console.log('PASS: bundled UI/assets, API validation/create/list, redirects/hits, CORS, bundled CLI add/list');
} finally {
  if (server && server.exitCode === null) {
    const closed = once(server, 'close');
    server.kill();
    await closed;
  }
}
