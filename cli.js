#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const usage = `Usage:
  snip add <url>    Create a short link
  snip ls           List links and hit counts
  snip open <code>  Open a link in your browser
  snip help         Show this help

Set SNIP_API to the API origin (default http://localhost:3000).`;

function httpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }
  return url;
}

function openerForPlatform(platform, url) {
  if (platform === 'win32') {
    return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  }
  if (platform === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

function openBrowser(url) {
  const [command, args] = openerForPlatform(process.platform, url);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', (error) => reject(new Error(`Unable to launch browser: ${error.message}`)));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Browser launcher failed (${code === null ? 'terminated' : code}).`));
    });
  });
}

async function request(path, options = {}) {
  const base = httpUrl(process.env.SNIP_API || 'http://localhost:3000', 'SNIP_API');
  let response;
  try {
    response = await fetch(new URL(path, base), {
      ...options,
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('API request timed out.');
    throw new Error(`Could not reach API: ${error.message}`);
  }
  if (!response.ok && response.status !== 302) {
    let message = `API returned HTTP ${response.status}.`;
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try {
        const body = await response.json();
        if (typeof body.error === 'string') message = body.error;
      } catch (error) {
        throw new Error(`API returned HTTP ${response.status} with invalid JSON: ${error.message}`);
      }
    }
    throw new Error(message);
  }
  return response;
}

async function main(args) {
  const [command, ...values] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (values.length) throw new Error('Help takes no arguments.');
    console.log(usage);
    return;
  }
  if (command === 'add') {
    if (values.length !== 1) throw new Error('Usage: snip add <url>');
    httpUrl(values[0], 'URL');
    const response = await request('/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: values[0] })
    });
    if (response.status !== 201) throw new Error(`Unexpected API status: ${response.status}.`);
    const link = await response.json();
    if (!link || typeof link.shortUrl !== 'string') throw new Error('API response is missing shortUrl.');
    httpUrl(link.shortUrl, 'shortUrl');
    console.log(link.shortUrl);
    return;
  }
  if (command === 'ls') {
    if (values.length) throw new Error('Usage: snip ls');
    const response = await request('/api/links');
    if (response.status !== 200) throw new Error(`Unexpected API status: ${response.status}.`);
    const links = await response.json();
    if (!Array.isArray(links) || links.some((link) =>
      !link || typeof link.code !== 'string' || typeof link.url !== 'string' ||
      !Number.isSafeInteger(link.hits) || link.hits < 0)) {
      throw new Error('API returned an invalid links list.');
    }
    if (!links.length) {
      console.log('No links yet.');
      return;
    }
    const codeWidth = Math.max(4, ...links.map((link) => link.code.length));
    const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits).length));
    console.log(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL`);
    for (const link of links) {
      console.log(`${link.code.padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`);
    }
    return;
  }
  if (command === 'open') {
    if (values.length !== 1 || !/^[a-zA-Z0-9]{6}$/.test(values[0])) {
      throw new Error('Usage: snip open <six-character code>');
    }
    const response = await request(`/${values[0]}`, { redirect: 'manual' });
    if (response.status !== 302) throw new Error(`Unexpected API status: ${response.status}.`);
    const location = response.headers.get('location');
    if (!location) throw new Error('API redirect is missing Location.');
    const target = new URL(location, response.url);
    httpUrl(target.href, 'Redirect target');
    await openBrowser(target.href);
    return;
  }
  throw new Error(`Unknown command: ${command}\n${usage}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { openerForPlatform };
