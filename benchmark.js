// OriginProof benchmarks (v0.3) — run with: node benchmark.js
// Measures client-side fingerprinting time (Node WebCrypto, same primitives
// the browser uses) and prints solc gas estimates from build/OriginProof.json.
// Numbers are local-machine measurements, not promises: video frame
// sampling is browser-only and cannot be timed in Node, so the 50 MB
// video figure covers SHA-256 only and is labelled as such.
// Output is written to docs/benchmarks.md.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const lib = require("./frontend/lib.js");

async function sha256WebCrypto(buf) {
  const digest = await crypto.webcrypto.subtle.digest("SHA-256", buf);
  return Buffer.from(digest).toString("hex");
}

function fmtMs(ms) {
  return ms < 1000 ? ms.toFixed(1) + " ms" : (ms / 1000).toFixed(2) + " s";
}

async function main() {
  const results = { generatedAt: new Date().toISOString(), node: process.version, items: [] };

  // 1) SHA-256 of a 5 MB image (WebCrypto, same API the browser uses).
  const img5 = crypto.randomBytes(5 * 1024 * 1024);
  let t0 = process.hrtime.bigint();
  await sha256WebCrypto(img5);
  let ms = Number(process.hrtime.bigint() - t0) / 1e6;
  results.items.push({ name: "SHA-256 of 5 MB image (WebCrypto)", value: fmtMs(ms), note: "browser equivalent; file hashing in the app" });

  // 2) SHA-256 of a 50 MB video file.
  const vid50 = crypto.randomBytes(50 * 1024 * 1024);
  t0 = process.hrtime.bigint();
  await sha256WebCrypto(vid50);
  ms = Number(process.hrtime.bigint() - t0) / 1e6;
  results.items.push({ name: "SHA-256 of 50 MB video (WebCrypto)", value: fmtMs(ms), note: "hashing only — video frame sampling (8 frames, canvas) is browser-only and not timed here; it adds a few hundred ms on a typical laptop" });

  // 3) dHash from a 9x8 grayscale grid (the per-frame cost; 72 values).
  const gray = Array.from({ length: 72 }, (_, i) => (i * 7) % 256);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) lib.dhashFromGrayscale(gray);
  ms = Number(process.hrtime.bigint() - t0) / 1e6 / 1000;
  results.items.push({ name: "dHash per frame (9x8 grayscale)", value: fmtMs(ms), note: "8 frames per video => ~8x this, negligible vs hashing" });

  // 4) C2PA manifest hash (sync SHA-256 over stable JSON).
  const manifest = lib.buildC2paManifest({
    fileName: "press.jpg", contentType: "image/jpeg", size: 5 * 1024 * 1024,
    sha256Hex: "0x" + "ab".repeat(32), phash: "1010101010101010", title: "Press photo",
    uploader: "0x1111111111111111111111111111111111111111", meId: "me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf",
    contractAddress: "0x2222222222222222222222222222222222222222", networkName: "ME Network Testnet",
    chainId: 400, txHash: "0x" + "cd".repeat(32), registeredAt: results.generatedAt,
  });
  t0 = process.hrtime.bigint();
  const mh = lib.sha256HexSync(lib.stableStringify(manifest));
  ms = Number(process.hrtime.bigint() - t0) / 1e6;
  results.items.push({ name: "C2PA manifest hash (stable JSON + sync SHA-256)", value: fmtMs(ms), note: "manifest hash " + mh.slice(0, 18) + "…" });

  // 5) Gas estimates from the compiled contract (solc).
  const build = JSON.parse(fs.readFileSync(path.join(__dirname, "build", "OriginProof.json"), "utf8"));
  const gas = (build.gasEstimates && build.gasEstimates.external) || {};
  const creation = (build.gasEstimates && build.gasEstimates.creation) || {};
  results.gas = { source: "solc gas estimates (static analysis, not a live network receipt)", creation, external: gas };

  // Write docs/benchmarks.md
  const lines = [
    "# OriginProof — Performance & Gas Benchmarks",
    "",
    "> Generated " + results.generatedAt + " on " + results.node + " (local machine).",
    "> **These are estimates until the contract is deployed.** Gas figures are",
    "> solc static estimates, not live network receipts; timing figures are",
    "> local-machine measurements of the same primitives the browser uses.",
    "> Re-run after deploy with real receipts: `node benchmark.js`.",
    "",
    "## Fingerprinting time",
    "",
    "| Operation | Time | Notes |",
    "|---|---|---|",
    ...results.items.map((it) => "| " + it.name + " | " + it.value + " | " + it.note + " |"),
    "",
    "## Gas (solc estimates)",
    "",
    "Deployment (contract creation): `" + JSON.stringify(creation) + "`",
    "",
    "| Function | Estimated gas |",
    "|---|---|",
    ...Object.entries(gas).map(([sig, g]) => "| `" + sig + "` | " + g + " |"),
    "",
    "### How to read these numbers",
    "",
    "- solc reports `infinite` for the state-changing functions because",
    "  they write dynamic strings / loop over caller-supplied arrays —",
    "  the compiler cannot bound them statically. The manual estimates",
    "  below come from counting storage writes instead:",
    "  - **First registration** (`register`, new hash): the Record struct",
    "    opens ~8–10 new storage slots (uploader, timestamp, block,",
    "    contentType, title, registrations, perceptualHash, meId,",
    "    manifestHash) plus one `_allHashes` push — roughly **200,000–",
    "    280,000 gas** at 20,000 gas per cold SSTORE, plus calldata and",
    "    the event. *Estimate, not a receipt.*",
    "  - **Re-registration** (same hash again): one counter increment +",
    "    event — roughly **30,000–50,000 gas**.",
    "  - **`registerBatch` (10 files):** roughly 10x one first",
    "    registration minus shared overhead — **~1.8–2.5M gas** for 10",
    "    new files in one transaction.",
    "  - **`attachManifest` / `reportCopy`:** one storage write + event",
    "    — roughly **30,000–60,000 gas** each.",
    "- `verify`, `findByPhash`, `hashAt`, `totalRecords` and `reportCount`",
    "  are `view` functions — free when called off-chain (the public",
    "  registry uses them).",
    "- Real gas depends on the ME Network gas price and the exact state at",
    "  deploy time; the first live receipts will replace this table.",
    "",
  ];
  fs.mkdirSync(path.join(__dirname, "docs"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "docs", "benchmarks.md"), lines.join("\n"));
  console.log("Benchmarks:");
  for (const it of results.items) console.log("  " + it.name + ": " + it.value);
  console.log("Gas estimates:");
  for (const [sig, g] of Object.entries(gas)) console.log("  " + sig + " -> " + g);
  console.log("Creation: " + JSON.stringify(creation));
  console.log("Wrote docs/benchmarks.md");
}

main().catch((e) => { console.error(e); process.exit(1); });
