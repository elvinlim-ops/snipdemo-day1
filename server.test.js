import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandler } from "./server.js";

describe("Snip API", () => {
  let server;
  let publicDir;
  let base;
  const destination = "https://example.com/path";
  const post = (body) => fetch(`${base}/api/links`, { method: "POST", body });

  beforeAll(async () => {
    publicDir = await mkdtemp(join(tmpdir(), "snip-test-"));
    await writeFile(join(publicDir, "index.html"), "Snip");
    server = Bun.serve({
      port: 0,
      fetch: createHandler({ baseUrl: "https://snip.example", publicDir }),
    });
    base = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    server?.stop(true);
    if (publicDir) await rm(publicDir, { recursive: true, force: true });
  });

  test("creates, lists, and redirects links while counting hits", async () => {
    const response = await post(JSON.stringify({ url: destination }));
    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const link = await response.json();
    expect(link.code).toMatch(/^[0-9A-Za-z]{6}$/);
    expect(link).toEqual({
      code: link.code,
      url: destination,
      shortUrl: `https://snip.example/${link.code}`,
      hits: 0,
      createdAt: link.createdAt,
    });
    expect(new Date(link.createdAt).toISOString()).toBe(link.createdAt);
    const redirect = await fetch(`${base}/${link.code}`, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(destination);
    const listed = await (await fetch(`${base}/api/links`)).json();
    expect(listed).toEqual([{ ...link, hits: 1 }]);
    expect((await fetch(`${base}/unknown`)).status).toBe(404);
  });

  test("rejects malformed JSON and invalid URL inputs", async () => {
    for (const body of ["{", "null", "{}", '{"url":42}', '{"url":"ftp://example.com"}', '{"url":"not a url"}']) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(typeof (await response.json()).error).toBe("string");
    }
  });

  test("normalizes the redirect location to avoid invalid header characters", async () => {
    const link = await (await post(JSON.stringify({ url: "https://example.com/\npath" }))).json();
    const response = await fetch(`${base}/${link.code}`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/path");
  });

  test("answers preflight and serves static files before matching codes", async () => {
    const preflight = await fetch(`${base}/api/links`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect(await (await fetch(`${base}/`)).text()).toBe("Snip");
    const link = await (await post(JSON.stringify({ url: destination }))).json();
    await writeFile(join(publicDir, link.code), "static wins");
    const response = await fetch(`${base}/${link.code}`, { redirect: "manual" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("static wins");
    const listed = await (await fetch(`${base}/api/links`)).json();
    expect(listed.find((item) => item.code === link.code).hits).toBe(0);
  });

  test("a fresh handler starts with no links", async () => {
    const handler = createHandler({ baseUrl: "http://localhost:3000" });
    const response = await handler(new Request("http://localhost:3000/api/links"));
    expect(await response.json()).toEqual([]);
  });
});
