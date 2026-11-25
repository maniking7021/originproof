# ME Network RPC proxy (Cloudflare Worker, free tier)

The official ME testnet RPC is plain HTTP (`http://118.175.0.249:8545`).
HTTPS pages (GitHub Pages demo) and MetaMask cannot use it directly:
browsers block mixed content, and MetaMask only accepts HTTPS RPC URLs.

This Worker is a thin HTTPS front door — it forwards JSON-RPC POSTs to
the HTTP RPC and returns the response, with CORS headers. Nothing is
stored or logged.

## Deploy (2 minutes, free)

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up
   (email + password, verify the email).
2. Dashboard → **Workers & Pages** → **Create Worker** → name it
   (e.g. `originproof-rpc`) → **Deploy**.
3. **Edit code** → delete the template → paste `worker.js` → **Save and
   Deploy**.
4. Copy the Worker URL, e.g.
   `https://originproof-rpc.<your-subdomain>.workers.dev`
5. Set it as `rpcUrl` in `frontend/config.js`, bump the service-worker
   cache name in `frontend/sw.js`, push — the demo then works over HTTPS
   with no browser setting, and MetaMask can add the ME testnet network
   with this URL as its RPC.

## Tested

`worker.js` was run locally against the live RPC before deploy:
`eth_chainId` → `0x190`, `VERSION()` → `"3"`, `totalRecords()` → `0`,
`eth_blockNumber` OK, CORS `*`, OPTIONS preflight → `204`.
