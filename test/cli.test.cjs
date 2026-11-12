'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { openerForPlatform } = require('../cli.js');

const cli = path.join(__dirname, '..', 'cli.js');
const launcher = path.join(__dirname, 'mock-launcher.cjs');

function run(args, env = {}, mockLauncher = false) {
  return new Promise((resolve, reject) => {
    const nodeArgs = mockLauncher ? ['--require', launcher, cli, ...args] : [cli, ...args];
    const child = spawn(process.execPath, nodeArgs, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function withServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback(url);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('help and invalid arguments do not require a backend', async () => {
  const env = { SNIP_API: 'http://127.0.0.1:1' };
  for (const args of [[], ['help'], ['--help']]) {
    const result = await run(args, env);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /snip add <url>/);
    assert.equal(result.stderr, '');
  }
  for (const args of [['add'], ['add', 'file:///secret'], ['open', '../bad'],
    ['ls', 'extra'], ['bad']]) {
    const result = await run(args, env);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.notEqual(result.stderr, '');
  }
});

test('unreachable backend fails with exit 1 on stderr', async () => {
  const result = await run(['ls'], { SNIP_API: 'http://127.0.0.1:1' });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Could not reach API/);
});

test('add sends JSON and prints only the returned short URL', async () => {
  await withServer((req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/links');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      assert.deepEqual(JSON.parse(body), { url: 'https://example.com/a?x=1' });
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ shortUrl: 'http://localhost:3000/Ab12Cd' }));
    });
  }, async (url) => {
    const result = await run(['add', 'https://example.com/a?x=1'], { SNIP_API: url });
    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), 'http://localhost:3000/Ab12Cd');
    assert.equal(result.stderr, '');
  });
});

test('list displays empty and aligned populated results', async () => {
  let calls = 0;
  await withServer((req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/api/links');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(calls++ === 0 ? [] : [
      { code: 'Ab12Cd', hits: 9, url: 'https://one.example' },
      { code: 'Xy98Zq', hits: 12345, url: 'https://two.example' }
    ]));
  }, async (url) => {
    const empty = await run(['ls'], { SNIP_API: url });
    assert.equal(empty.code, 0);
    assert.equal(empty.stdout.trim(), 'No links yet.');
    const result = await run(['ls'], { SNIP_API: url });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /CODE\s+HITS\s+URL/);
    assert.match(result.stdout, /Ab12Cd\s+9\s+https:\/\/one\.example/);
    assert.match(result.stdout, /Xy98Zq\s+12345\s+https:\/\/two\.example/);
  });
});

test('API errors, unexpected statuses and invalid payloads fail cleanly', async () => {
  let calls = 0;
  await withServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (calls++ === 0) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad URL' }));
    } else if (calls === 2) {
      res.end(JSON.stringify({}));
    } else {
      res.writeHead(500);
      res.end('not json');
    }
  }, async (url) => {
    const bad = await run(['add', 'https://example.com'], { SNIP_API: url });
    assert.equal(bad.code, 1);
    assert.match(bad.stderr, /Bad URL/);
    const malformed = await run(['ls'], { SNIP_API: url });
    assert.equal(malformed.code, 1);
    assert.match(malformed.stderr, /invalid links list/);
    const serverError = await run(['ls'], { SNIP_API: url });
    assert.equal(serverError.code, 1);
    assert.match(serverError.stderr, /HTTP 500/);
  });
});

test('open obtains a manual redirect and launches its target once', async () => {
  const target = 'https://example.com/destination?x=1';
  let requests = 0;
  await withServer((req, res) => {
    requests++;
    assert.equal(req.url, '/Ab12Cd');
    res.writeHead(302, { location: target });
    res.end();
  }, async (url) => {
    const env = { SNIP_API: url, EXPECTED_TARGET: target };
    const result = await run(['open', 'Ab12Cd'], env, true);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.equal(requests, 1);
    const failed = await run(['open', 'Ab12Cd'], { ...env, LAUNCH_EXIT: '2' }, true);
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /Browser launcher failed/);
  });
});

test('open reports missing and unsafe redirect targets', async () => {
  let calls = 0;
  await withServer((req, res) => {
    if (calls++ === 0) res.writeHead(404);
    else res.writeHead(302, { location: 'file:///secret' });
    res.end();
  }, async (url) => {
    const missing = await run(['open', 'Ab12Cd'], { SNIP_API: url }, true);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /404/);
    const unsafe = await run(['open', 'Ab12Cd'], { SNIP_API: url }, true);
    assert.equal(unsafe.code, 1);
    assert.match(unsafe.stderr, /HTTP\(S\)/);
  });
});

test('launcher chooses safe argument arrays for each platform', () => {
  const url = 'https://example.com/?a=1&b=2';
  assert.deepEqual(openerForPlatform('win32', url), ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]);
  assert.deepEqual(openerForPlatform('darwin', url), ['open', [url]]);
  assert.deepEqual(openerForPlatform('linux', url), ['xdg-open', [url]]);
});

test('stalled API request times out with exit 1', { timeout: 15000 }, async () => {
  await withServer(() => {}, async (url) => {
    const result = await run(['ls'], { SNIP_API: url });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /timed out/);
  });
});
