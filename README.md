# Snip

One Bun API, two clients: Angular 19 and a zero-dependency Node CLI.
Storage is an in-memory Map; restarting loses all links.

| Method | Path | Result |
| --- | --- | --- |
| POST | /api/links | `{url}` -> 201 `{code,url,shortUrl,hits,createdAt}`; 400 `{error}` |
| GET | /api/links | 200 array of links |
| GET | /:code | 302 Location and one added hit; 404 if unknown |

## Layout

Independent orphan branches in this same repository keep component files at their
roots. `main` mounts `backend`, `frontend`, `cli`, and generated `bundle` as
submodules pinned to exact commits. Never hand-edit bundle output.

```sh
git clone --recurse-submodules https://github.com/elvinlim-ops/snipdemo-day1.git
cd snipdemo-day1
git submodule update --init --recursive
```

Plain clones leave submodules unpopulated.

Run `bun start` in backend (port 3000), `npm ci` then `npm start` in frontend
(port 4200), and `node cli.js ls` in cli. Development UI calls localhost:3000;
production UI uses the same origin. CLI uses `SNIP_API`, default localhost:3000.

## Updating a component

Commit and push on its source branch inside the submodule, then on main run
`git submodule update --remote <path>` and commit/push the changed pointer.
Component commits and pointer commits are separate records.

## Release

Run `node scripts/build-bundle.mjs`, twice to verify an unchanged second run.
Add `--push` to publish bundle and main commits. The script resolves source branch
tips, records their exact SHAs in `bundle/release.json`, builds Angular from its
lockfile, and generates a single-process Bun release with the CLI alongside.
`cd bundle` then `bun start` serves UI, API, and redirects.

Docker uses `docker build -t snip bundle` and
`docker run --rm -p 3000:3000 snip`. Configure PORT, optional BASE_URL, or
RAILWAY_PUBLIC_DOMAIN for public short URLs. The generated railway.json selects
Dockerfile builds; Railway must use the bundle branch, not main.

Hourly/manual bundle CI is deliberately not triggered by source-branch pushes:
the workflow only exists on main. Docker CI watches the `bundle` gitlink, not
files inside it. Bundle CI explicitly dispatches Docker CI because GITHUB_TOKEN
pushes do not trigger another push workflow. Tests and scans must pass before
publishing GHCR images tagged latest and main's short SHA.

This public workshop demo has no authentication or persistent storage.

Release validation currently reports four high-severity production Angular 19
dependency findings (and three moderate). The high/critical gate deliberately
blocks image publication. Do not suppress these findings to ship the tutorial;
approve a supported Angular upgrade before a production release.

The workshop decision is to keep Angular 19 and leave publication blocked.
Backend/CLI tests, frontend build/browser tests, bundle smoke checks, Docker
build/container smoke checks, and the image scan passed. No GHCR release image
was published and no Railway deployment was attempted.
