# Snip CLI

Requires Node.js 20 or later. Set `SNIP_API` to the backend origin; it defaults
to `http://localhost:3000`.

```
node cli.js add https://example.com
node cli.js ls
node cli.js open Ab12Cd
node cli.js help
```

The `snip`, `snip.cmd`, and `snip.ps1` wrappers forward their arguments to the
CLI. `open` asks the backend for the redirect, increments the hit count, and
launches its destination in the default browser. Errors go to stderr with exit
code 1; requests time out after 10 seconds. Run `npm test` for the mock API tests.
