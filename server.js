import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(value, status = 200) {
  return Response.json(value, { status, headers: cors });
}

function randomCode() {
  let code = "";
  while (code.length < 6) {
    for (const byte of crypto.getRandomValues(new Uint8Array(8))) {
      if (byte < 248) code += alphabet[byte % 62];
      if (code.length === 6) break;
    }
  }
  return code;
}

async function staticFile(publicDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const root = await realpath(publicDir);
  const candidate = resolve(root, `.${decoded === "/" ? "/index.html" : decoded}`);
  const within = (path) => {
    const rel = relative(root, path);
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  };
  if (!within(candidate)) return null;
  try {
    const actual = await realpath(candidate);
    if (!within(actual) || !(await stat(actual)).isFile()) return null;
    return Bun.file(actual);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

export function createHandler({ baseUrl, publicDir } = {}) {
  const links = new Map();
  const origin = new URL(baseUrl);
  if (!["http:", "https:"].includes(origin.protocol)) {
    throw new Error("BASE_URL must be an HTTP(S) URL");
  }

  return async (request) => {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      const { pathname } = new URL(request.url);
      if (pathname === "/api/links") {
        if (request.method === "GET") return json([...links.values()]);
        if (request.method === "POST") {
          let body;
          try {
            body = await request.json();
          } catch {
            return json({ error: "Invalid JSON" }, 400);
          }
          if (!body || typeof body.url !== "string") {
            return json({ error: "URL must be HTTP or HTTPS" }, 400);
          }
          let url;
          try {
            url = new URL(body.url);
          } catch {
            return json({ error: "URL must be HTTP or HTTPS" }, 400);
          }
          if (!["http:", "https:"].includes(url.protocol)) {
            return json({ error: "URL must be HTTP or HTTPS" }, 400);
          }

          let code;
          do {
            code = randomCode();
          } while (links.has(code));
          const link = {
            code,
            url: body.url,
            shortUrl: new URL(`/${code}`, origin).href,
            hits: 0,
            createdAt: new Date().toISOString(),
          };
          links.set(code, link);
          return json(link, 201);
        }
        return json({ error: "Method not allowed" }, 405);
      }

      if (request.method === "GET") {
        if (publicDir) {
          const file = await staticFile(publicDir, pathname);
          if (file) return new Response(file, { headers: cors });
        }
        const code = pathname.slice(1);
        const link = links.get(code);
        if (link) {
          link.hits += 1;
          return new Response(null, {
            status: 302,
            headers: { ...cors, Location: new URL(link.url).href },
          });
        }
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Request failed:", error);
      return json({ error: "Internal server error" }, 500);
    }
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  const baseUrl = process.env.BASE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${port}`);
  const server = Bun.serve({
    port,
    fetch: createHandler({ baseUrl, publicDir: process.env.PUBLIC_DIR }),
  });
  console.log(`Snip listening on port ${server.port}`);
}
