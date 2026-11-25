// OriginProof ME Network RPC proxy — Cloudflare Worker (free tier).
// ---------------------------------------------------------------------------
// Why this exists: the official ME testnet RPC is plain HTTP
// (http://118.175.0.249:8545). A page served over HTTPS (GitHub Pages demo,
// MetaMask) cannot call it directly — browsers block mixed content and
// MetaMask only accepts HTTPS RPC URLs for custom networks.
// This Worker is a thin HTTPS front door: it forwards JSON-RPC POSTs to the
// HTTP RPC and returns the response, with CORS headers so the demo page
// (maniking7021.github.io) can call it from any browser with no setting.
// No data is stored or logged; the Worker only relays requests.
// Deploy: Cloudflare dashboard → Workers & Pages → Create Worker → paste
// this file → Deploy. The Worker URL looks like:
//   https://originproof-rpc.<your-subdomain>.workers.dev
// Then set that URL as `rpcUrl` in frontend/config.js (and bump the SW
// cache name so browsers fetch the new config).
// ---------------------------------------------------------------------------

const RPC_URL = "http://118.175.0.249:8545";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request) {
    // CORS preflight (browsers send this before a JSON POST).
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "OriginProof RPC proxy: send a JSON-RPC POST." }),
        { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const body = await request.text();

    const upstream = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  },
};
