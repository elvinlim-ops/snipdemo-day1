# Snip Frontend

Snip is a small Angular 19 client for creating and listing shortened links.

## Run locally

```sh
npm install
npm start
```

The development app at `http://localhost:4200` uses the API at `http://localhost:3000`. Start the Bun backend separately.

## Build

```sh
npm run build
```

The production build is written to `dist/snip-frontend/browser`. Production builds call the API on the same origin so the bundled UI can be served by the backend.
