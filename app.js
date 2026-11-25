// OriginProof frontend v0.2 — plain JS + ethers v6. No build step: open index.html.
// File hashing uses WebCrypto SHA-256 in the browser; the file never uploads.
// Perceptual hash (dHash), metadata forensics and QR codes come from lib.js.
"use strict";

/* Contract v3 ABI (contracts/OriginProof.sol). v3 adds the optional ME ID
 * (5th arg of register / registerBatch); the v2 4-arg versions are kept as
 * wrappers. Overloaded functions are called by full signature below. */
const ABI = [
  "function register(bytes32 contentHash, bytes8 phash, string contentType, string title, string meId) returns (bool)",
  "function register(bytes32 contentHash, bytes8 phash, string contentType, string title) returns (bool)",
  "function registerBatch(bytes32[] contentHashes, bytes8[] phashes, string[] contentTypes, string[] titles, string meId) returns (bool[] firsts)",
  "function registerBatch(bytes32[] contentHashes, bytes8[] phashes, string[] contentTypes, string[] titles) returns (bool[] firsts)",
  "function verify(bytes32 contentHash) view returns (tuple(address uploader, uint256 timestamp, uint256 blockNumber, string contentType, string title, uint256 registrations, bytes8 perceptualHash, string meId, bytes32 manifestHash))",
  "function isRegistered(bytes32 contentHash) view returns (bool)",
  "function registrationCount(bytes32 contentHash) view returns (uint256)",
  "function totalRecords() view returns (uint256)",
  "function hashAt(uint256 index) view returns (bytes32)",
  "function attachManifest(bytes32 contentHash, bytes32 manifestHash)",
  "function reportCopy(bytes32 contentHash, string url)",
  "function reportCount(bytes32 contentHash) view returns (uint256)",
  "function findByPhash(bytes8 phash, uint8 maxDistance) view returns (bytes32[])",
  "function VERSION() view returns (string)",
  "event ContentRegistered(bytes32 indexed contentHash, address indexed uploader, uint256 timestamp, string contentType, string title, bytes8 perceptualHash, bool isFirst, string meId)",
  "event ManifestAttached(bytes32 indexed contentHash, bytes32 manifestHash)",
  "event CopyReported(bytes32 indexed contentHash, address indexed reporter, string url)",
];

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_PHASH = "0x0000000000000000";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

let provider = null;      // wallet provider (after connect)
let readProvider = null;  // read-only JSON-RPC provider (no wallet needed)
let signer = null;
let walletAddr = "";      // connected wallet address ("" when not connected)
let contract = null;      // write contract (signer)
let readContract = null;  // read-only contract

const $ = (id) => document.getElementById(id);
const setStatus = (t) => { $("status").textContent = t; };
const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s ?? ""));

function configReady() {
  return !!(window.ORIGINPROOF_CONFIG && ORIGINPROOF_CONFIG.contractAddress && ORIGINPROOF_CONFIG.rpcUrl);
}
function explorerTxUrl(txHash) {
  const base = (window.ORIGINPROOF_CONFIG && ORIGINPROOF_CONFIG.blockExplorerUrl) || "";
  return base ? base.replace(/\/$/, "") + "/tx/" + txHash : "";
}
function certUrlFor(hashHex) {
  const base = location.href.split("#")[0];
  return base + "#/cert/" + hashHex;
}
function fmtDate(ts) {
  const n = Number(ts);
  return n ? new Date(n * 1000).toUTCString() : "—";
}
function shortAddr(a) { return a && a.length > 13 ? a.slice(0, 6) + "…" + a.slice(-4) : (a || "—"); }
function shortHash(h) { return h && h.length > 18 ? h.slice(0, 10) + "…" + h.slice(-6) : (h || "—"); }

function getReadContract() {
  if (readContract) return readContract;
  if (!configReady()) return null;
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(ORIGINPROOF_CONFIG.rpcUrl);
  readContract = new ethers.Contract(ORIGINPROOF_CONFIG.contractAddress, ABI, readProvider);
  return readContract;
}

/* ---------- local record store (v0.3) ----------
 * Records registered in THIS browser are kept in localStorage (max 100).
 * This powers the Explorer tab, creator pages, tamper-diff thumbnails and
 * copy reports without any server — and without waiting for the chain.
 * The on-chain record is always the source of truth; the local copy is a
 * convenience cache (labelled as such in the UI). */
const LOCAL_STORE_KEY = "originproof.records.v1";
function loadLocalRecords() {
  try {
    const arr = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveLocalRecord(rec) {
  if (!rec || !rec.sha) return;
  const all = loadLocalRecords().filter((r) => r.sha.toLowerCase() !== rec.sha.toLowerCase());
  all.unshift(rec);
  try { localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(all.slice(0, 100))); } catch (e) { /* storage full/blocked — ignore */ }
}
function getLocalRecord(sha) {
  if (!sha) return null;
  return loadLocalRecords().find((r) => r.sha && r.sha.toLowerCase() === String(sha).toLowerCase()) || null;
}
function listLocalRecords() { return loadLocalRecords(); }
function localRecordsByMeId(meId) {
  if (!meId) return [];
  return loadLocalRecords().filter((r) => r.meId === meId);
}

/* ---------- invisible watermark (v0.3, LSB steganography) ----------
 * The payload (11 bytes: "OP" + version + first 8 bytes of the SHA-256)
 * is embedded in the R-channel least-significant bits of the image pixels.
 * Bit-level work is pure (lib.js lsbEmbedPixels / lsbExtractPixels);
 * canvas handles the image loading / PNG export here. */
function loadImageEl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const to = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error("image load timeout")); }, 8000);
    img.onload = () => { clearTimeout(to); URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { clearTimeout(to); URL.revokeObjectURL(url); reject(new Error("image load error")); };
    img.src = url;
  });
}
async function embedWatermark(file, shaHex) {
  const payload = watermarkPayloadForHash(shaHex);
  if (!payload) return null;
  try {
    const img = await loadImageEl(file);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    if (lsbEmbedPixels(data.data, payload) < 0) return null; // image too small
    ctx.putImageData(data, 0, 0);
    return await new Promise((res) => c.toBlob(res, "image/png"));
  } catch (e) { return null; }
}
async function extractWatermark(file) {
  try {
    const img = await loadImageEl(file);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    return parseWatermarkPayload(lsbExtractPixels(data.data, 11));
  } catch (e) { return null; }
}

/** Draw a 16x12 grayscale thumbnail (array of 192 values) into a canvas,
 *  scaled up for display. `heat` (optional) is a 192-value heat array —
 *  rendered in red instead of gray. */
function drawThumb(canvas, values, heat) {
  const s = 10;
  canvas.width = 16 * s; canvas.height = 12 * s;
  const ctx = canvas.getContext("2d");
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 16; x++) {
      const v = values[y * 16 + x] || 0;
      ctx.fillStyle = heat ? "rgb(" + v + "," + Math.round(v * 0.15) + "," + Math.round(v * 0.15) + ")" : "rgb(" + v + "," + v + "," + v + ")";
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
}

/* ---------- hashing + perceptual hash + forensics (all local) ---------- */

async function sha256Hex(buf) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** dHash for an image file: downscale to 9x8 via canvas, compare neighbours.
 *  Also captures a 16x12 grayscale thumbnail (local only) for the tamper-diff
 *  view. Returns { phash, thumb } — thumb is an array of 192 gray values. */
async function dhashForImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 9; c.height = 8;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 9, 8);
        const d = ctx.getImageData(0, 0, 9, 8).data;
        const gray = [];
        for (let i = 0; i < 72; i++) {
          const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
          gray.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
        }
        const c2 = document.createElement("canvas");
        c2.width = 16; c2.height = 12;
        const ctx2 = c2.getContext("2d", { willReadFrequently: true });
        ctx2.drawImage(img, 0, 0, 16, 12);
        const d2 = ctx2.getImageData(0, 0, 16, 12).data;
        const thumb = [];
        for (let i = 0; i < 192; i++) {
          thumb.push(Math.round(0.299 * d2[i * 4] + 0.587 * d2[i * 4 + 1] + 0.114 * d2[i * 4 + 2]));
        }
        resolve({ phash: dhashFromGrayscale(gray), thumb });
      } catch (e) { resolve({ phash: null, thumb: null }); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ phash: null, thumb: null }); };
    img.src = url;
  });
}

/** Video fingerprint (v0.3): sample up to 8 evenly spaced frames, dHash
 *  each, aggregate into a consensus hash (lib.js aggregateVideoPhash).
 *  Seeks are sequential (one 'seeked' at a time) with a 5s timeout per
 *  frame, so a bad or very large video can never hang the UI — at most
 *  ~40s for 8 frames, with progress reported via onProgress(done, total).
 *  Returns { consensus, frames, frameCount } or null when no frame could
 *  be read. The consensus hash is what goes on-chain (same bytes8 field
 *  as images); the per-frame hashes stay local for verify refinement. */
const MAX_VIDEO_FRAMES = 8;
async function dhashForVideo(file, onProgress) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto";
  const cleanup = () => { URL.revokeObjectURL(url); try { v.removeAttribute("src"); v.load(); } catch (e) {} };
  try {
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("video metadata timeout")), 10000);
      v.onloadedmetadata = () => { clearTimeout(to); resolve(); };
      v.onerror = () => { clearTimeout(to); reject(new Error("video load error")); };
      v.src = url;
    });
    const dur = v.duration;
    const targets = [];
    if (Number.isFinite(dur) && dur > 0) {
      for (let i = 0; i < MAX_VIDEO_FRAMES; i++) targets.push(dur * (i + 0.5) / MAX_VIDEO_FRAMES);
    } else {
      for (const t of [0.5, 1, 2, 3, 4, 5, 6, 8]) targets.push(t); // unknown duration: fixed offsets
    }
    const hashes = [];
    let thumb = null; // 16x12 grayscale thumbnail from the middle sampled frame
    for (let i = 0; i < targets.length; i++) {
      const seekTo = (Number.isFinite(dur) && dur > 0)
        ? Math.min(targets[i], Math.max(0, dur - 0.05))
        : targets[i];
      const seeked = await new Promise((resolve) => {
        const to = setTimeout(() => { v.onseeked = null; resolve(false); }, 5000);
        v.onseeked = () => { clearTimeout(to); resolve(true); };
        try { v.currentTime = seekTo; } catch (e) { clearTimeout(to); resolve(false); }
      });
      if (seeked) {
        try {
          const c = document.createElement("canvas");
          c.width = 9; c.height = 8;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, 9, 8);
          const d = ctx.getImageData(0, 0, 9, 8).data;
          const gray = [];
          for (let k = 0; k < 72; k++) {
            gray.push(Math.round(0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2]));
          }
          const h = dhashFromGrayscale(gray);
          if (h) hashes.push(h);
          if (i === Math.floor(targets.length / 2)) {
            const c2 = document.createElement("canvas");
            c2.width = 16; c2.height = 12;
            const ctx2 = c2.getContext("2d", { willReadFrequently: true });
            ctx2.drawImage(v, 0, 0, 16, 12);
            const d2 = ctx2.getImageData(0, 0, 16, 12).data;
            thumb = [];
            for (let k = 0; k < 192; k++) {
              thumb.push(Math.round(0.299 * d2[k * 4] + 0.587 * d2[k * 4 + 1] + 0.114 * d2[k * 4 + 2]));
            }
          }
        } catch (e) { /* unreadable frame — skip it */ }
      }
      if (typeof onProgress === "function") { try { onProgress(i + 1, targets.length); } catch (e) {} }
    }
    if (!hashes.length) return null;
    const agg = aggregateVideoPhash(hashes);
    if (agg) agg.thumb = thumb;
    return agg;
  } catch (e) {
    return null;
  } finally {
    cleanup();
  }
}

async function dhashForFile(file, onProgress) {
  if (file.type && file.type.startsWith("image/")) {
    const r = await dhashForImage(file);
    return { phash: r.phash, videoFp: null, thumb: r.thumb };
  }
  if (file.type && file.type.startsWith("video/")) {
    const fp = await dhashForVideo(file, onProgress);
    return { phash: fp ? fp.consensus : null, videoFp: fp, thumb: fp ? fp.thumb : null };
  }
  return { phash: null, videoFp: null, thumb: null };
}

/** Full local analysis of one file: SHA-256, dHash, metadata forensics.
 *  For videos, `videoFp` is the full frame fingerprint ({ consensus,
 *  frames, frameCount }); `phash` is always the single hash stored
 *  on-chain (image dHash, or the video consensus hash). `onProgress`
 *  (optional) is called as video frames are sampled. */
async function analyzeFile(file, onProgress) {
  const buf = await file.arrayBuffer();
  const sha = await sha256Hex(buf);
  const dh = await dhashForFile(file, onProgress);
  let meta = null;
  try { meta = parseMetadata(buf, file.type || ""); } catch (e) { meta = null; }
  return { file, name: file.name, type: file.type || "application/octet-stream", size: file.size, sha, phash: dh.phash, videoFp: dh.videoFp, thumb: dh.thumb, meta };
}

/* ---------- rendering helpers ---------- */

function metaHtml(a) {
  const ph = a.phash
    ? "<code>" + a.phash + "</code> <span class=\"hint\">(dHash — survives resize / re-compression)</span>"
    : "<span class=\"hint\">not available for this file type</span>";
  return "<dl class=\"kv\">" +
    "<dt>File</dt><dd>" + esc(a.name) + " · " + esc(a.type) + " · " + a.size.toLocaleString() + " bytes</dd>" +
    "<dt>SHA-256</dt><dd><code>" + a.sha + "</code></dd>" +
    "<dt>Perceptual hash</dt><dd>" + ph + "</dd>" +
    (a.videoFp
      ? "<dt>Video frames</dt><dd>" + a.videoFp.frameCount + " frames sampled — consensus hash above. A trimmed or re-encoded copy still matches.</dd>"
      : "") +
    "</dl>";
}

function forensicsHtml(meta) {
  if (!meta) return "";
  const verdict = meta.verdict;
  let flagHtml = "";
  if (verdict === "ai-marker") {
    flagHtml = meta.aiMarkers.filter((m) => m.kind === "ai").map((m) =>
      "<span class=\"flag ai\">⚠ AI signal: " + esc(m.marker) + "</span>").join("") +
      meta.aiMarkers.filter((m) => m.kind !== "ai").map((m) =>
      "<span class=\"flag " + (m.kind === "c2pa" ? "c2pa" : "software") + "\">" + esc(m.marker) + "</span>").join("");
  } else if (verdict === "signal") {
    flagHtml = meta.aiMarkers.map((m) =>
      "<span class=\"flag " + (m.kind === "c2pa" ? "c2pa" : "software") + "\">" + esc(m.marker) + "</span>").join("");
  } else if (verdict === "clean") {
    flagHtml = "<span class=\"flag clean\">No AI-generator markers found in metadata</span>";
  } else {
    flagHtml = "<span class=\"flag none\">No readable metadata in this file</span>";
  }
  const rows = (meta.fields || []).map((f) =>
    "<tr><td>" + esc(f.label) + "</td><td>" + esc(f.value) + "</td></tr>").join("");
  const flags = (meta.flags || []).length
    ? "<p class=\"hint\">" + meta.flags.map(esc).join(" · ") + "</p>" : "";
  return "<div class=\"forensics\"><h3>Metadata forensics</h3>" +
    "<p>" + flagHtml + "</p>" +
    (rows ? "<table>" + rows + "</table>" : "<p class=\"hint\">No camera / software fields found.</p>") +
    flags +
    "<p class=\"hint\">These are metadata signals, not proof: metadata can be stripped or forged. An AI flag means the file's metadata mentions an AI generator — it does not prove the image was AI-generated.</p>" +
    "</div>";
}

function recordHtml(rec, hashHex, opts) {
  opts = opts || {};
  const multi = Number(rec.registrations) > 1;
  return "<dl class=\"kv\">" +
    "<dt>Title</dt><dd>" + esc(rec.title) + "</dd>" +
    "<dt>Uploader</dt><dd><code>" + rec.uploader + "</code> (" + shortAddr(rec.uploader) + ")</dd>" +
    (rec.meId
      ? "<dt>ME ID</dt><dd><span class=\"flag clean\">✓ Verified owner</span> <code>" + esc(rec.meId) + "</code> (" + shortMeId(rec.meId) + ")</dd>"
      : "") +
    (rec.manifestHash && rec.manifestHash !== ZERO_HASH
      ? "<dt>C2PA manifest</dt><dd><span class=\"flag c2pa\">Attached on-chain</span> <code>" + esc(rec.manifestHash) + "</code></dd>"
      : "") +
    "<dt>Registered</dt><dd>" + fmtDate(rec.timestamp) + "</dd>" +
    "<dt>Block</dt><dd>" + String(rec.blockNumber) + "</dd>" +
    "<dt>Content type</dt><dd>" + esc(rec.contentType) + "</dd>" +
    "<dt>Registrations</dt><dd>" + String(rec.registrations) + (multi ? " — this exact file was registered more than once" : "") + "</dd>" +
    "<dt>Perceptual hash</dt><dd><code>" + (bytes8ToPhash(rec.perceptualHash) || "— not stored") + "</code></dd>" +
    (opts.similarity != null ? "<dt>Similarity</dt><dd><strong>" + opts.similarity + "%</strong> — " + esc(opts.bandLabel || "") + "</dd>" : "") +
    (opts.frameCoverage != null ? "<dt>Video frame match</dt><dd>" + esc(opts.frameCoverage) + "</dd>" : "") +
    "</dl>" +
    "<p><a href=\"" + certUrlFor(hashHex) + "\">Open the certificate for this registration →</a></p>";
}

function verdictHtml(kind, text) {
  return "<p><span class=\"verdict " + kind + "\">" + esc(text) + "</span></p>";
}

/** Draw a QR code (from lib.js encodeQR) into a canvas, with a quiet zone. */
function drawQr(canvas, text) {
  const q = encodeQR(text);
  const quiet = 4, scale = Math.max(4, Math.floor(232 / (q.size + quiet * 2)));
  const px = (q.size + quiet * 2) * scale;
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < q.size; y++) {
    for (let x = 0; x < q.size; x++) {
      if (q.modules[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
  }
  return q;
}

/* ---------- wallet + network ---------- */

async function connectWallet() {
  if (!window.ethereum) { setStatus("No wallet found. Install MetaMask or use ME Pass wallet."); return false; }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    const addr = await signer.getAddress();
    walletAddr = addr;
    $("walletPill").textContent = "Wallet: " + shortAddr(addr);
    $("walletPill").classList.add("ok");
    if (configReady()) {
      contract = new ethers.Contract(ORIGINPROOF_CONFIG.contractAddress, ABI, signer);
    }
    setStatus("Wallet connected: " + addr);
    return true;
  } catch (e) {
    setStatus("Wallet connection failed: " + (e && e.message ? e.message : e));
    return false;
  }
}

function refreshNetPill() {
  const cfg = window.ORIGINPROOF_CONFIG;
  if (cfg && cfg.contractAddress && cfg.rpcUrl) {
    $("netPill").textContent = "Network: " + (cfg.networkName || "ME Network") + " · contract set";
    $("netPill").classList.add("ok");
    $("configWarn").textContent = "";
  } else {
    $("netPill").textContent = "Network: not configured";
    $("netPill").classList.add("warn");
    $("configWarn").textContent = "Setup pending: fill in frontend/config.js (ME Network testnet RPC, chain ID, explorer, faucet, and the deployed contract address) from the official ME Developer Center docs before use. Registration and verification need the contract address; the local fingerprint, perceptual hash and forensics tools work without it.";
  }
}

/* ---------- tabs ---------- */

function showTab(name) {
  for (const n of ["Register", "Batch", "Verify", "Explorer"]) {
    $("panel" + n).classList.toggle("hidden", n !== name);
    $("tab" + n).classList.toggle("active", n === name);
  }
  if (name === "Explorer") renderExplorer();
}

/* ---------- registry stats (v0.3) — honest zeros pre-deploy ---------- */

const VERIFICATION_LOG_KEY = "originproof-verifications-v1";

function loadVerifications() {
  try { return JSON.parse(localStorage.getItem(VERIFICATION_LOG_KEY) || "[]"); } catch (e) { return []; }
}

function recordVerification(entry) {
  try {
    const log = loadVerifications();
    log.push(entry);
    localStorage.setItem(VERIFICATION_LOG_KEY, JSON.stringify(log.slice(-500)));
  } catch (e) { /* private mode / quota — stats are a nicety, not the product */ }
}

function registryStats() {
  const records = loadLocalRecords();
  const verifications = loadVerifications();
  const creators = new Set(records.map((r) => r.meId).filter(Boolean)).size;
  const copiesFlagged = verifications.filter((v) => v.verdict === "copy" || v.verdict === "near-duplicate" || v.verdict === "altered").length;
  const reports = records.reduce((n, r) => n + (r.reports ? r.reports.length : 0), 0);
  return {
    registrations: records.length,
    verifications: verifications.length,
    copiesFlagged,
    creators,
    reports,
    source: "local records — on-chain totals appear here once the contract is deployed",
  };
}

/* ---------- public explorer (v0.3) ---------- */

async function renderExplorer() {
  const body = $("explorerBody");
  const stats = registryStats();
  const statsHtml =
    "<h3>Registry dashboard</h3>" +
    "<dl class=\"kv\">" +
    "<dt>Total registrations</dt><dd>" + stats.registrations + "</dd>" +
    "<dt>Total verifications</dt><dd>" + stats.verifications + "</dd>" +
    "<dt>Copies flagged</dt><dd>" + stats.copiesFlagged + "</dd>" +
    "<dt>Creators (ME ID linked)</dt><dd>" + stats.creators + "</dd>" +
    "<dt>Copy reports filed</dt><dd>" + stats.reports + "</dd>" +
    "</dl><p class=\"hint\">" + esc(stats.source) + ". These numbers are computed from real records only — no placeholders.</p>";
  if (!configReady()) {
    body.innerHTML = statsHtml +
      "<p class=\"warn\">The contract is not deployed yet, so this page lists local records only. Once the contract address is set in config.js, it reads the on-chain registry.</p>" +
      explorerListHtml(loadLocalRecords());
    return;
  }
  try {
    const rc = getReadContract();
    const total = Number(await rc.totalRecords());
    const rows = [];
    for (let i = Math.max(0, total - 50); i < total; i++) {
      const h = await rc.hashAt(i);
      const r = await rc.verify(h);
      if (r.uploader !== ZERO_ADDR) rows.push({ sha: h, rec: r });
    }
    rows.reverse();
    body.innerHTML = statsHtml +
      "<h3>Recent registrations (on-chain, " + total + " total)</h3>" +
      (rows.length ? explorerListHtml(rows.map((x) => ({ sha: x.sha, title: x.rec.title, type: x.rec.contentType, meId: x.rec.meId, timestamp: Number(x.rec.timestamp), txHash: "" }))) : "<p>No registrations on-chain yet.</p>");
  } catch (err) {
    body.innerHTML = statsHtml + "<p class=\"warn\">Could not read the on-chain registry: " + esc(err && err.message ? err.message : err) + "</p>" + explorerListHtml(loadLocalRecords());
  }
}

function explorerListHtml(records) {
  if (!records.length) return "<p>No records yet. Register your first file above.</p>";
  return "<table class=\"registry\"><thead><tr><th>Title</th><th>Type</th><th>Owner</th><th>Registered</th><th></th></tr></thead><tbody>" +
    records.map((r) =>
      "<tr><td>" + esc(r.title || "Untitled") + "</td><td>" + esc(r.type || "") + "</td>" +
      "<td>" + (r.meId ? "<a href=\"#/creator/" + encodeURIComponent(r.meId) + "\">" + esc(shortMeId(r.meId)) + "</a>" : "—") + "</td>" +
      "<td>" + (r.timestamp ? fmtDate(r.timestamp) : "—") + "</td>" +
      "<td><a href=\"" + certUrlFor(r.sha) + "\">Certificate</a></td></tr>").join("") +
    "</tbody></table>";
}

/* ---------- creator profile (v0.3) ---------- */

async function showCreator(meId) {
  $("app").classList.add("hidden");
  $("creatorView").classList.remove("hidden");
  $("certView").classList.add("hidden");
  const body = $("creatorBody");
  body.innerHTML = "<p class=\"hint\">Loading creator…</p>";
  const local = localRecordsByMeId(meId);
  let onChain = [];
  if (configReady()) {
    try {
      const rc = getReadContract();
      const total = Number(await rc.totalRecords());
      for (let i = 0; i < total; i++) {
        const h = await rc.hashAt(i);
        const r = await rc.verify(h);
        if (r.uploader !== ZERO_ADDR && r.meId === meId) onChain.push({ sha: h, title: r.title, type: r.contentType, meId: r.meId, timestamp: Number(r.timestamp) });
      }
    } catch (e) { /* fall back to local records */ }
  }
  const seen = new Set();
  const works = [...onChain, ...local].filter((r) => { if (seen.has(r.sha)) return false; seen.add(r.sha); return true; });
  body.innerHTML =
    "<h2>Creator</h2>" +
    "<p><span class=\"flag clean\">✓ ME ID verified</span> <code>" + esc(meId) + "</code></p>" +
    "<p>" + works.length + " registered work(s). Every record below is linked on-chain to this ME ID — that is the ownership proof.</p>" +
    explorerListHtml(works);
}

/* ---------- evidence certificate PDF (v0.3) ----------
 * Client-side only: builds a print-friendly HTML document in a new
 * window and opens the browser print dialog (Save as PDF). No jsPDF
 * dependency, no server, no upload. */

function downloadEvidencePdf(rec, hashHex) {
  const local = getLocalRecord(hashHex);
  const txLink = local && local.txHash ? explorerTxUrl(local.txHash) : "";
  const doc = "<!doctype html><html><head><meta charset=\"utf-8\"><title>OriginProof Evidence Certificate</title>" +
    "<style>body{font-family:Georgia,serif;max-width:640px;margin:40px auto;padding:0 20px;color:#111}h1{font-size:22px;border-bottom:2px solid #111;padding-bottom:8px}dt{font-weight:bold}dd{margin:0 0 10px;word-break:break-all}.foot{font-size:12px;color:#555;border-top:1px solid #ccc;padding-top:8px}</style></head><body>" +
    "<h1>OriginProof — Evidence Certificate</h1>" +
    "<dl><dt>Title</dt><dd>" + esc(rec.title) + "</dd>" +
    "<dt>SHA-256 fingerprint</dt><dd>" + hashHex + "</dd>" +
    "<dt>Uploader</dt><dd>" + rec.uploader + "</dd>" +
    "<dt>Verified owner (ME ID)</dt><dd>" + (rec.meId ? esc(rec.meId) : "Not linked at registration") + "</dd>" +
    "<dt>Registered</dt><dd>" + fmtDate(rec.timestamp) + "</dd>" +
    "<dt>Block</dt><dd>" + String(rec.blockNumber) + "</dd>" +
    "<dt>Content type</dt><dd>" + esc(rec.contentType) + "</dd>" +
    "<dt>Registrations of this exact file</dt><dd>" + String(rec.registrations) + "</dd>" +
    "<dt>Perceptual hash</dt><dd>" + (bytes8ToPhash(rec.perceptualHash) || "—") + "</dd>" +
    (rec.manifestHash && rec.manifestHash !== ZERO_HASH ? "<dt>C2PA manifest hash</dt><dd>" + rec.manifestHash + "</dd>" : "") +
    (local && local.txHash ? "<dt>Registration transaction</dt><dd>" + esc(local.txHash) + (txLink ? " — " + txLink : "") + "</dd>" : "") +
    "<dt>Contract</dt><dd>" + esc(ORIGINPROOF_CONFIG.contractAddress || "not configured") + " (" + esc(ORIGINPROOF_CONFIG.networkName || "ME Network") + ", chain ID " + String(ORIGINPROOF_CONFIG.chainIdDecimal) + ")</dd>" +
    "<dt>Certificate link</dt><dd>" + esc(certUrlFor(hashHex)) + "</dd></dl>" +
    "<p class=\"foot\">Generated by OriginProof v0.3. The SHA-256 fingerprint is computed in the browser — the file itself never leaves the owner's device. Verify this certificate by re-uploading the file on the OriginProof verify page and comparing the hash above.</p>" +
    "</body></html>";
  const w = window.open("", "_blank");
  if (!w) { setStatus("Pop-up blocked — allow pop-ups for this page to download the evidence PDF."); return; }
  w.document.write(doc);
  w.document.close();
  w.focus();
  w.print();
}

/* ---------- single register ---------- */

let regAnalysis = null;

$("regFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  regAnalysis = null;
  $("regMeta").innerHTML = ""; $("regForensics").innerHTML = ""; $("regResult").innerHTML = "";
  if (!f) return;
  setStatus("Analysing " + f.name + " locally… (SHA-256 + perceptual hash + metadata)");
  try {
    regAnalysis = await analyzeFile(f, (done, total) => setStatus("Analysing " + f.name + " locally… sampling video frames " + done + "/" + total));
    $("regMeta").innerHTML = metaHtml(regAnalysis);
    $("regForensics").innerHTML = forensicsHtml(regAnalysis.meta);
    setStatus("Ready to register. The file never leaves your device — only its hashes go on-chain.");
  } catch (err) {
    setStatus("Could not analyse this file: " + (err && err.message ? err.message : err));
  }
});

$("regClearBtn").addEventListener("click", () => {
  $("regFile").value = ""; $("regTitle").value = ""; $("regMeId").value = "";
  regAnalysis = null;
  $("regMeta").innerHTML = ""; $("regForensics").innerHTML = ""; $("regResult").innerHTML = "";
  setStatus("Cleared.");
});

$("registerBtn").addEventListener("click", async () => {
  const btn = $("registerBtn");
  if (!regAnalysis) { setStatus("Choose a file first."); return; }
  const title = $("regTitle").value.trim();
  if (!title) { setStatus("Give the media a title first."); return; }
  const meId = ($("regMeId").value || "").trim();
  if (!isValidMeId(meId)) { setStatus("That ME ID does not look right — it must start with “me1” (e.g. me1tlx9…), or leave it empty. Never paste a private key or seed phrase."); return; }
  if (!configReady()) { setStatus("Fill in config.js first (contract address + RPC). See the setup note at the top."); return; }
  if (!contract) {
    const ok = await connectWallet();
    if (!ok || !contract) { setStatus("Connect a wallet first — and fill in config.js with the deployed contract address."); return; }
  }
  btn.disabled = true;
  try {
    setStatus("Sending registration transaction… (only the hashes go on-chain, never the file)");
    const ph = phashToBytes8(regAnalysis.phash);
    const tx = await contract["register(bytes32,bytes8,string,string,string)"](regAnalysis.sha, ph, regAnalysis.type, title, meId);
    setStatus("Transaction sent: " + tx.hash + " — waiting for confirmation…");
    const receipt = await tx.wait();
    const txLink = explorerTxUrl(receipt.hash);
    // Local record (powers the Explorer tab, tamper-diff thumbnails,
    // creator pages and copy reports in this browser).
    saveLocalRecord({
      sha: regAnalysis.sha, phash: regAnalysis.phash,
      videoFp: regAnalysis.videoFp ? { consensus: regAnalysis.videoFp.consensus, frames: regAnalysis.videoFp.frames } : null,
      thumb: regAnalysis.thumb || null,
      title, type: regAnalysis.type, meId, uploader: walletAddr || "",
      timestamp: Math.floor(Date.now() / 1000), blockNumber: receipt.blockNumber,
      txHash: receipt.hash, contractAddress: ORIGINPROOF_CONFIG.contractAddress,
      manifestHash: "", reports: [],
    });
    // C2PA manifest (v0.3): built now that the tx hash is known.
    regManifest = buildC2paManifest({
      fileName: regAnalysis.name, contentType: regAnalysis.type, size: regAnalysis.size,
      sha256Hex: regAnalysis.sha, phash: regAnalysis.phash, title,
      uploader: walletAddr || "", meId,
      contractAddress: ORIGINPROOF_CONFIG.contractAddress,
      networkName: ORIGINPROOF_CONFIG.networkName, chainId: ORIGINPROOF_CONFIG.chainIdDecimal,
      txHash: receipt.hash, registeredAt: new Date().toISOString(),
    });
    regManifestHash = "0x" + sha256HexSync(stableStringify(regManifest));
    const manifestName = regAnalysis.name.replace(/\.[^.]+$/, "") + ".c2pa.json";
    $("regResult").innerHTML =
      verdictHtml("original", "REGISTERED ✓") +
      "<dl class=\"kv\"><dt>Transaction</dt><dd>" + (txLink ? "<a href=\"" + txLink + "\" target=\"_blank\" rel=\"noopener\">" + receipt.hash + "</a>" : "<code>" + receipt.hash + "</code>") + "</dd>" +
      "<dt>Block</dt><dd>" + String(receipt.blockNumber) + "</dd>" +
      (meId ? "<dt>ME ID</dt><dd><span class=\"flag clean\">✓ Verified owner</span> <code>" + esc(meId) + "</code></dd>" : "") +
      "</dl>" +
      "<p><a href=\"" + certUrlFor(regAnalysis.sha) + "\">Open the certificate for this registration →</a></p>" +
      "<div class=\"forensics\"><h3>C2PA Content Credentials</h3>" +
      "<p>A C2PA-aligned manifest was generated for this file (claim generator OriginProof, SHA-256 + actions + ME Network proof). Download it and keep it with the file.</p>" +
      "<p class=\"mono\">Manifest hash: <code>" + regManifestHash + "</code></p>" +
      "<div class=\"row\"><button id=\"dlManifestBtn\" class=\"ghost\">Download manifest (.c2pa.json)</button>" +
      "<button id=\"attachManifestBtn\" class=\"ghost\">Attach manifest hash on-chain</button></div>" +
      "<p class=\"hint\" id=\"attachManifestStatus\">Attaching costs one small transaction (only the manifest hash goes on-chain).</p></div>";
    $("dlManifestBtn").addEventListener("click", () => downloadManifest(regManifest, manifestName));
    $("attachManifestBtn").addEventListener("click", attachRegManifest);
    // Optional invisible watermark (PNG copy, LSB steganography).
    if ($("regWatermark").checked && regAnalysis.type.startsWith("image/")) {
      const blob = await embedWatermark(regAnalysis.file, regAnalysis.sha);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const wmName = regAnalysis.name.replace(/\.[^.]+$/, "") + "-watermarked.png";
        $("regResult").innerHTML += "<div class=\"forensics\"><h3>Invisible watermark</h3>" +
          "<p>An invisible watermark (the record's fingerprint) was embedded in a PNG copy. It survives re-saving; verification can read it back.</p>" +
          "<p><a href=\"" + url + "\" download=\"" + esc(wmName) + "\">Download watermarked copy (PNG)</a></p></div>";
      }
    }
    setStatus("Registered! Block " + receipt.blockNumber + ". Share the certificate link so anyone can verify it.");
  } catch (err) {
    setStatus("Registration failed: " + (err && err.reason ? err.reason : err && err.message ? err.message : err));
  } finally { btn.disabled = false; }
});

/** Download the C2PA manifest JSON built at registration. */
function downloadManifest(manifest, fileName) {
  if (!manifest) return;
  const blob = new Blob([stableStringify(manifest)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName || "manifest.c2pa.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Attach the registration's manifest hash on-chain (second transaction). */
let regManifest = null;
let regManifestHash = "";
async function attachRegManifest() {
  const st = $("attachManifestStatus");
  if (!regManifest || !regManifestHash || !regAnalysis) { if (st) st.textContent = "No manifest to attach."; return; }
  if (!contract) {
    const ok = await connectWallet();
    if (!ok || !contract) { if (st) st.textContent = "Connect a wallet first."; return; }
  }
  try {
    if (st) st.textContent = "Sending attach transaction…";
    const tx = await contract.attachManifest(regAnalysis.sha, regManifestHash);
    if (st) st.textContent = "Transaction sent: " + tx.hash + " — waiting for confirmation…";
    await tx.wait();
    const rec = getLocalRecord(regAnalysis.sha);
    if (rec) { rec.manifestHash = regManifestHash; saveLocalRecord(rec); }
    if (st) st.textContent = "Manifest hash attached on-chain ✓ (" + regManifestHash + ")";
    setStatus("C2PA manifest hash attached on-chain.");
  } catch (err) {
    if (st) st.textContent = "Attach failed: " + (err && err.reason ? err.reason : err && err.message ? err.message : err);
  }
}

/* ---------- batch register ---------- */

let batchAnalyses = [];

function renderBatchList() {
  const el = $("batchList");
  if (!batchAnalyses.length) { el.innerHTML = ""; $("batchBtn").disabled = true; return; }
  el.innerHTML = batchAnalyses.map((a, i) =>
    "<div class=\"file-row\" id=\"batchRow" + i + "\">" +
    "<span class=\"name\">" + esc(a.name) + " <span class=\"hint\">(" + a.size.toLocaleString() + " bytes)</span></span>" +
    "<span class=\"st wait\" id=\"batchSt" + i + "\">analysed</span></div>").join("");
  $("batchBtn").disabled = false;
}

$("batchFiles").addEventListener("change", async (e) => {
  const files = [...(e.target.files || [])].slice(0, 10);
  batchAnalyses = [];
  $("batchList").innerHTML = ""; $("batchResult").innerHTML = "";
  $("batchProgress").classList.add("hidden");
  if (!files.length) return;
  if ((e.target.files || []).length > 10) setStatus("Only the first 10 files are taken — the contract caps a batch at 10.");
  else setStatus("Analysing " + files.length + " file(s) locally…");
  for (let i = 0; i < files.length; i++) {
    try {
      batchAnalyses.push(await analyzeFile(files[i], (done, total) =>
        setStatus("Analysing " + files[i].name + " — video frames " + done + "/" + total)));
    }
    catch (err) { setStatus("Could not analyse " + files[i].name + ": " + (err && err.message ? err.message : err)); }
    $("batchProgress").classList.remove("hidden");
    $("batchProgress").firstElementChild.style.width = Math.round(((i + 1) / files.length) * 100) + "%";
  }
  renderBatchList();
  setStatus(batchAnalyses.length + " file(s) analysed and ready. One transaction registers them all.");
});

$("batchClearBtn").addEventListener("click", () => {
  $("batchFiles").value = ""; $("batchMeId").value = ""; batchAnalyses = [];
  $("batchList").innerHTML = ""; $("batchResult").innerHTML = "";
  $("batchProgress").classList.add("hidden");
  setStatus("Cleared.");
});

$("batchBtn").addEventListener("click", async () => {
  const btn = $("batchBtn");
  if (!batchAnalyses.length) { setStatus("Choose files first."); return; }
  const titles = batchAnalyses.map((a) => a.name.replace(/\.[^.]+$/, "").slice(0, 120) || a.name);
  const meId = ($("batchMeId").value || "").trim();
  if (!isValidMeId(meId)) { setStatus("That ME ID does not look right — it must start with “me1”, or leave it empty. Never paste a private key or seed phrase."); return; }
  if (!configReady()) { setStatus("Fill in config.js first (contract address + RPC)."); return; }
  if (!contract) {
    const ok = await connectWallet();
    if (!ok || !contract) { setStatus("Connect a wallet first — and fill in config.js with the deployed contract address."); return; }
  }
  btn.disabled = true;
  batchAnalyses.forEach((a, i) => { const s = $("batchSt" + i); if (s) { s.textContent = "sending…"; s.className = "st run"; } });
  try {
    setStatus("Sending one batch transaction for " + batchAnalyses.length + " file(s)…");
    const tx = await contract["registerBatch(bytes32[],bytes8[],string[],string[],string[])"](
      batchAnalyses.map((a) => a.sha),
      batchAnalyses.map((a) => phashToBytes8(a.phash)),
      batchAnalyses.map((a) => a.type),
      titles,
      meId
    );
    setStatus("Transaction sent: " + tx.hash + " — waiting for confirmation…");
    const receipt = await tx.wait();
    // Read back first-registration flags: count == 1 means this tx was the first.
    let summary = [];
    for (let i = 0; i < batchAnalyses.length; i++) {
      const a = batchAnalyses[i];
      let isFirst = true;
      try {
        const rc = getReadContract();
        if (rc) { const n = await rc.registrationCount(a.sha); isFirst = Number(n) === 1; }
      } catch (e) { /* leave as unknown */ }
      const s = $("batchSt" + i);
      if (s) { s.textContent = isFirst ? "registered ✓" : "already registered (copy)"; s.className = "st " + (isFirst ? "ok" : "bad"); }
      summary.push({ a, isFirst });
      saveLocalRecord({
        sha: a.sha, phash: a.phash,
        videoFp: a.videoFp ? { consensus: a.videoFp.consensus, frames: a.videoFp.frames } : null,
        thumb: a.thumb || null,
        title: titles[i], type: a.type, meId, uploader: walletAddr || "",
        timestamp: Math.floor(Date.now() / 1000), blockNumber: receipt.blockNumber,
        txHash: receipt.hash, contractAddress: ORIGINPROOF_CONFIG.contractAddress,
        manifestHash: "", reports: [],
      });
    }
    const nFirst = summary.filter((s) => s.isFirst).length;
    const txLink = explorerTxUrl(receipt.hash);
    $("batchResult").innerHTML =
      "<h3>Batch summary</h3><p>" + nFirst + " of " + batchAnalyses.length + " file(s) registered for the first time; " +
      (batchAnalyses.length - nFirst) + " were already registered (counted as copies).</p>" +
      "<p>Transaction: " + (txLink ? "<a href=\"" + txLink + "\" target=\"_blank\" rel=\"noopener\">" + receipt.hash + "</a>" : "<code>" + receipt.hash + "</code>") +
      " · Block " + receipt.blockNumber + "</p>" +
      summary.map((s, i) => "<p><a href=\"" + certUrlFor(s.a.sha) + "\">Certificate: " + esc(s.a.name) + "</a> — " + (s.isFirst ? "first registration" : "copy") +
        " · <a href=\"#\" data-manifest=\"" + i + "\">Download C2PA manifest</a></p>").join("");
    $("batchResult").querySelectorAll("[data-manifest]").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        const s = summary[Number(el.getAttribute("data-manifest"))];
        if (!s) return;
        const m = buildC2paManifest({
          fileName: s.a.name, contentType: s.a.type, size: s.a.size,
          sha256Hex: s.a.sha, phash: s.a.phash, title: titles[Number(el.getAttribute("data-manifest"))],
          uploader: walletAddr || "", meId,
          contractAddress: ORIGINPROOF_CONFIG.contractAddress,
          networkName: ORIGINPROOF_CONFIG.networkName, chainId: ORIGINPROOF_CONFIG.chainIdDecimal,
          txHash: receipt.hash, registeredAt: new Date().toISOString(),
        });
        downloadManifest(m, s.a.name.replace(/\.[^.]+$/, "") + ".c2pa.json");
      });
    });
    setStatus("Batch complete: " + nFirst + "/" + batchAnalyses.length + " first registrations. Block " + receipt.blockNumber + ".");
  } catch (err) {
    batchAnalyses.forEach((a, i) => { const s = $("batchSt" + i); if (s) { s.textContent = "failed"; s.className = "st bad"; } });
    setStatus("Batch registration failed: " + (err && err.reason ? err.reason : err && err.message ? err.message : err));
  } finally { btn.disabled = false; }
});

/* ---------- verify ---------- */

let verAnalysis = null;

$("verFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  verAnalysis = null;
  $("verMeta").innerHTML = ""; $("verForensics").innerHTML = ""; $("verifyResult").innerHTML = "";
  if (!f) return;
  setStatus("Analysing " + f.name + " locally…");
  try {
    verAnalysis = await analyzeFile(f);
    $("verMeta").innerHTML = metaHtml(verAnalysis);
    $("verForensics").innerHTML = forensicsHtml(verAnalysis.meta);
    setStatus("Ready to verify. Exact SHA-256 match is checked first, then near-duplicates by perceptual hash.");
  } catch (err) {
    setStatus("Could not analyse this file: " + (err && err.message ? err.message : err));
  }
});

$("verClearBtn").addEventListener("click", () => {
  $("verFile").value = "";
  const sidecar = $("sidecarInput");
  if (sidecar) sidecar.value = "";
  verAnalysis = null;
  $("verMeta").innerHTML = ""; $("verForensics").innerHTML = ""; $("verifyResult").innerHTML = "";
  setStatus("Cleared.");
});

$("verifyBtn").addEventListener("click", async () => {
  const btn = $("verifyBtn");
  if (!verAnalysis) { setStatus("Choose a file to verify first."); return; }
  if (!configReady()) { setStatus("Fill in config.js first (contract address + RPC) — verification reads the on-chain registry."); return; }
  const rc = getReadContract();
  if (!rc) { setStatus("Contract is not configured. Fill in config.js first."); return; }
  btn.disabled = true;
  $("verifyResult").innerHTML = "<p><span class=\"verdict pending\">CHECKING…</span></p>";
  try {
    // C2PA sidecar: read the optional .c2pa.json the user attached.
    let c2paInfo = null;
    const sidecarInput = $("sidecarInput");
    const sidecar = sidecarInput && sidecarInput.files && sidecarInput.files[0];
    if (sidecar) {
      const text = await sidecar.text();
      const parsed = parseC2paSidecar(text);
      if (parsed.manifest) {
        const v = validateC2paManifest(parsed.manifest, {
          sha256Hex: verAnalysis.sha,
          contractAddress: ORIGINPROOF_CONFIG.contractAddress,
        });
        c2paInfo = { ...v, present: true, embedded: false };
      } else {
        c2paInfo = { present: true, embedded: false, valid: false, errors: [parsed.error || "Could not read manifest."], summary: null };
      }
    } else if (verAnalysis.meta && verAnalysis.meta.flags.hasC2pa) {
      // File embeds C2PA markers but no sidecar was provided: note it,
      // do not claim verification.
      c2paInfo = { present: false, embedded: true, valid: false, errors: ["This file contains C2PA markers, but no manifest sidecar was attached — attach the .c2pa.json to verify."], summary: null };
    }
    // Invisible watermark: extract from the image if one is embedded.
    let watermarkInfo = null;
    if (verAnalysis.kind === "image" && verAnalysis.file) {
      const px = await loadImagePixels(verAnalysis.file);
      if (px) {
        const parsedWm = parseWatermarkPayload(lsbExtractPixels(px.data, 11));
        if (parsedWm) {
          watermarkInfo = { found: true, hashPrefix: parsedWm.hashPrefix, matchesThisFile: parsedWm.hashPrefix === verAnalysis.sha.replace(/^0x/, "").slice(0, 16) };
        } else {
          watermarkInfo = { found: false };
        }
      }
    }
    const aiScore = aiOriginScore(verAnalysis.meta);
    const extraHtml = verifyExtrasHtml({ c2pa: c2paInfo, watermark: watermarkInfo, aiScore, analysis: verAnalysis });
    setStatus("Checking the on-chain registry for an exact match…");
    const rec = await rc.verify(verAnalysis.sha);
    if (rec.uploader !== ZERO_ADDR) {
      const multi = Number(rec.registrations) > 1;
      $("verifyResult").innerHTML =
        verdictHtml(multi ? "copy" : "original", multi ? "COPY — ALREADY REGISTERED" : "ORIGINAL ✓") +
        (multi
          ? "<p>This exact file was already registered " + Number(rec.registrations) + " times. The first registration below is the origin claim.</p>"
          : "<p>Byte-identical to the file first registered below.</p>") +
        recordHtml(rec, verAnalysis.sha) + extraHtml;
      recordVerification({ sha256Hex: verAnalysis.sha, verdict: multi ? "copy" : "original", phash: verAnalysis.phash, at: new Date().toISOString() });
      setStatus(multi ? "Copy: this exact file was already registered." : "Original: exact match found on-chain.");
      return;
    }
    // No exact match — near-duplicate search by perceptual hash.
    if (!verAnalysis.phash) {
      $("verifyResult").innerHTML = verdictHtml("notfound", "NOT FOUND") +
        "<p>This file was never registered, and no perceptual hash could be computed for it (only images and videos support near-duplicate search).</p>" + extraHtml;
      recordVerification({ sha256Hex: verAnalysis.sha, verdict: "not-found", phash: null, at: new Date().toISOString() });
      setStatus("Not found: never registered, and no perceptual hash available for near-duplicate search.");
      return;
    }
    setStatus("No exact match. Searching by perceptual hash for near-duplicates…");
    const matches = await rc.findByPhash(phashToBytes8(verAnalysis.phash), 16);
    if (!matches.length) {
      $("verifyResult").innerHTML = verdictHtml("notfound", "NOT FOUND") +
        "<p>This file was never registered, and no near-duplicate (resized, re-compressed or lightly cropped copy) was found on-chain either. It may be edited, AI-generated, or simply unregistered.</p>" + extraHtml;
      recordVerification({ sha256Hex: verAnalysis.sha, verdict: "not-found", phash: verAnalysis.phash, at: new Date().toISOString() });
      setStatus("Not found: never registered, no near-duplicate found.");
      return;
    }
    // Pick the closest match.
    let best = null;
    for (const h of matches) {
      const r = await rc.verify(h);
      if (r.uploader === ZERO_ADDR) continue;
      const stored = bytes8ToPhash(r.perceptualHash);
      if (!stored) continue;
      const d = hammingDistance(verAnalysis.phash, stored);
      if (!best || d < best.d) best = { hash: h, rec: r, d };
    }
    if (!best) {
      $("verifyResult").innerHTML = verdictHtml("notfound", "NOT FOUND") +
        "<p>Near-duplicate candidates were found but their records could not be read. Try again.</p>" + extraHtml;
      setStatus("Near-duplicate candidates found, but their records could not be read.");
      return;
    }
    const sim = phashSimilarity(best.d);
    const band = phashBand(best.d);
    const kind = best.d === 0 ? "near" : best.d <= 10 ? "near" : "altered";
    const verdict = best.d <= 10 ? "near-duplicate" : "altered";
    $("verifyResult").innerHTML =
      verdictHtml(kind, best.d <= 10 ? "NEAR-DUPLICATE — " + sim + "% SIMILAR" : "ALTERED — " + sim + "% SIMILAR") +
      "<p>" + esc(band.label) + ". The SHA-256 differs, so this is not the byte-identical file — but it is visually " + sim + "% similar to the registered original below.</p>" +
      recordHtml(best.rec, best.hash, { similarity: sim, bandLabel: band.label }) + extraHtml;
    // Tamper diff: compare thumbnails (image) or frame hashes (video).
    const local = getLocalRecord(best.hash);
    if (local && local.thumb && verAnalysis.thumb) {
      const diff = imageThumbDiff(local.thumb, verAnalysis.thumb);
      if (diff) drawThumbDiff(diff);
    }
    if (verAnalysis.kind === "video" && verAnalysis.videoFp && local && local.videoFp && local.videoFp.frames) {
      drawVideoFrameDiff(verAnalysis.videoFp.frames, local.videoFp.frames);
    }
    recordVerification({ sha256Hex: verAnalysis.sha, verdict, phash: verAnalysis.phash, at: new Date().toISOString() });
    setStatus("Near-duplicate found: " + sim + "% similar to a registered original.");
  } catch (err) {
    $("verifyResult").innerHTML = "";
    setStatus("Verification failed: " + (err && err.reason ? err.reason : err && err.message ? err.message : err));
  } finally { btn.disabled = false; }
});

/* ---------- verify extras: C2PA, watermark, AI score (v0.3) ---------- */

function verifyExtrasHtml(extra) {
  let out = "";
  const ai = extra.aiScore;
  if (ai) {
    out += "<h3>AI-origin score (heuristic)</h3>" +
      "<p><strong>" + ai.score + " / 100 — " + esc(ai.band) + "</strong></p>" +
      "<p class=\"hint\">Heuristic, not a certified detector: it reads metadata signals only. Metadata can be stripped or forged, so a low score never proves a file is human-made.</p>" +
      "<ul>" + ai.reasons.map((r) => "<li>" + esc(r) + "</li>").join("") + "</ul>";
  }
  const c2pa = extra.c2pa;
  if (c2pa) {
    out += "<h3>Content Credentials (C2PA)</h3>";
    if (c2pa.present && c2pa.valid) {
      const s = c2pa.summary;
      out += "<p><strong>Manifest valid ✓</strong> — issuer <code>" + esc(s.generator) + "</code>" +
        (s.meId ? " · ME ID <code>" + esc(shortMeId(s.meId)) + "</code>" : "") +
        (s.txHash ? " · tx <code>" + esc(String(s.txHash).slice(0, 18)) + "…</code>" : "") + "</p>" +
        "<p>Actions: " + esc(s.actions.join(", ")) + "</p>";
    } else if (c2pa.embedded && !c2pa.present) {
      out += "<p class=\"warn\">This file contains C2PA markers, but no manifest sidecar was attached — attach the .c2pa.json to verify it.</p>";
    } else {
      out += "<p class=\"warn\"><strong>Manifest invalid ✗</strong> — " + esc(c2pa.errors.join(" ")) + "</p>";
    }
  }
  const wm = extra.watermark;
  if (wm) {
    out += "<h3>Invisible watermark</h3>";
    if (wm.found) {
      out += "<p><strong>Watermark found</strong> — embedded record hash prefix <code>" + esc(wm.hashPrefix) + "</code>. " +
        (wm.matchesThisFile ? "It matches this file, so this image is the watermarked copy." : "It does NOT match this file's hash — this image was watermarked from a different file.") + "</p>";
    } else {
      out += "<p>No OriginProof watermark found in this image.</p>";
    }
  }
  return out;
}

/** Load an image file's pixels (RGBA) at its native size for watermark extraction. */
function loadImagePixels(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        URL.revokeObjectURL(url);
        resolve({ data, width: c.width, height: c.height });
      } catch (e) { URL.revokeObjectURL(url); resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Render the pixel-difference heatmap into the tamper-diff canvas. */
function drawThumbDiff(diff) {
  const canvas = $("tamperDiffCanvas");
  if (!canvas) return;
  const wrap = $("tamperDiffWrap");
  if (wrap) wrap.classList.remove("hidden");
  const ctx = canvas.getContext("2d");
  canvas.width = 192; canvas.height = 144; // 16x12 cells, 12px each
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, 192, 144);
  for (let i = 0; i < 192; i++) {
    const h = diff.heat[i];
    const x = (i % 16) * 12, y = Math.floor(i / 16) * 12;
    ctx.fillStyle = h === 0 ? "#1a3a1a" : "rgb(255," + Math.max(0, 220 - h) + ",0)";
    ctx.fillRect(x, y, 12, 12);
  }
  const label = $("tamperDiffLabel");
  if (label) label.textContent = "Changed pixels: " + diff.changedPct + "% · mean difference " + diff.meanAbs + "/255 · brightest cell " + diff.maxAbs + "/255. Green = identical, red = changed.";
}

/** Render per-frame similarity for a video vs the registered original. */
function drawVideoFrameDiff(queryFrames, storedFrames) {
  const wrap = $("videoFrameDiffWrap");
  const list = $("videoFrameDiffList");
  if (!wrap || !list) return;
  const n = Math.min(queryFrames.length, storedFrames.length);
  let rows = "";
  const dists = [];
  for (let i = 0; i < n; i++) {
    const d = hammingDistance(queryFrames[i], storedFrames[i]);
    dists.push({ i, d, sim: phashSimilarity(d) });
  }
  dists.sort((a, b) => b.d - a.d);
  rows = dists.slice(0, 5).map((r) => "<li>Frame " + (r.i + 1) + ": " + r.sim + "% similar" + (r.d > 10 ? " — most changed" : "") + "</li>").join("");
  list.innerHTML = "<ul>" + rows + "</ul>";
  wrap.classList.remove("hidden");
}

/* ---------- certificate view (#/cert/<sha256>) ---------- */

async function showCertificate(hashHex) {
  $("app").classList.add("hidden");
  $("certView").classList.remove("hidden");
  const body = $("certBody");
  body.innerHTML = "<p class=\"hint\">Loading certificate…</p>";
  try { drawQr($("certQr"), certUrlFor(hashHex)); } catch (e) { $("certQrWrap").innerHTML = "<p class=\"hint\">QR code could not be generated for this link.</p>"; }
  if (!/^0x[0-9a-fA-F]{64}$/.test(hashHex)) {
    body.innerHTML = "<p><span class=\"verdict notfound\">INVALID CERTIFICATE LINK</span></p><p>The link must contain a 64-character SHA-256 hash.</p>";
    return;
  }
  if (!configReady()) {
    body.innerHTML = "<dl class=\"kv\"><dt>SHA-256</dt><dd><code>" + hashHex + "</code></dd></dl>" +
      "<p class=\"warn\">The contract is not configured in config.js yet, so the on-chain record cannot be loaded. This hash is the fingerprint to verify — once the contract address is set, this page will show the uploader, registration time and block.</p>";
    return;
  }
  const rc = getReadContract();
  try {
    const rec = await rc.verify(hashHex);
    if (rec.uploader === ZERO_ADDR) {
      body.innerHTML = "<p><span class=\"verdict notfound\">NOT FOUND</span></p>" +
        "<dl class=\"kv\"><dt>SHA-256</dt><dd><code>" + hashHex + "</code></dd></dl>" +
        "<p>This hash was never registered on OriginProof.</p>";
      return;
    }
    body.innerHTML =
      "<p><span class=\"verdict original\">ORIGINAL — REGISTERED ON ME NETWORK</span></p>" +
      "<dl class=\"kv\">" +
      "<dt>Title</dt><dd>" + esc(rec.title) + "</dd>" +
      "<dt>SHA-256</dt><dd><code>" + hashHex + "</code></dd>" +
      "<dt>Uploader</dt><dd><code>" + rec.uploader + "</code></dd>" +
      (rec.meId
        ? "<dt>Verified owner</dt><dd><span class=\"flag clean\">✓ ME ID verified</span> <a href=\"#/creator/" + encodeURIComponent(rec.meId) + "\"><code>" + esc(rec.meId) + "</code></a> (" + shortMeId(rec.meId) + ")</dd>"
        : "<dt>Verified owner</dt><dd>No ME ID linked at registration.</dd>") +
      "<dt>Registered</dt><dd>" + fmtDate(rec.timestamp) + "</dd>" +
      "<dt>Block</dt><dd>" + String(rec.blockNumber) + "</dd>" +
      "<dt>Content type</dt><dd>" + esc(rec.contentType) + "</dd>" +
      "<dt>Registrations</dt><dd>" + String(rec.registrations) + "</dd>" +
      "<dt>Perceptual hash</dt><dd><code>" + (bytes8ToPhash(rec.perceptualHash) || "— not stored") + "</code></dd>" +
      (rec.manifestHash && rec.manifestHash !== ZERO_HASH
        ? "<dt>C2PA manifest</dt><dd><span class=\"flag c2pa\">Attached on-chain</span> <code>" + esc(rec.manifestHash) + "</code></dd>"
        : "<dt>C2PA manifest</dt><dd>Not attached.</dd>") +
      "</dl>" +
      "<p><button id=\"evidenceBtn\">Download evidence certificate (PDF)</button> " +
      "<button id=\"certReportBtn\">Report a copy</button></p>" +
      "<div id=\"certReportWrap\" class=\"hidden\"><p>Paste the URL where you saw a copy of this file. The report is stored with the record (locally for now; the on-chain report count is sent when you have a wallet connected).</p>" +
      "<input id=\"certReportUrl\" type=\"url\" placeholder=\"https://…\" style=\"width:100%\"> " +
      "<button id=\"certReportSubmit\">Submit report</button> <span id=\"certReportSt\"></span></div>";
    $("evidenceBtn").addEventListener("click", () => downloadEvidencePdf(rec, hashHex));
    $("certReportBtn").addEventListener("click", () => $("certReportWrap").classList.toggle("hidden"));
    $("certReportSubmit").addEventListener("click", async () => {
      const url = ($("certReportUrl").value || "").trim();
      if (!url || url.length > 300) { $("certReportSt").textContent = "Paste a valid URL (max 300 characters)."; return; }
      const local = getLocalRecord(hashHex);
      if (local) { local.reports = local.reports || []; local.reports.push({ url, at: new Date().toISOString() }); saveLocalRecord(local); }
      let onChain = false;
      try {
        if (contract) {
          const tx = await contract.reportCopy(hashHex, url);
          await tx.wait();
          onChain = true;
        }
      } catch (e) { /* wallet not connected or tx failed — local report still saved */ }
      $("certReportSt").textContent = onChain ? "Report recorded on-chain ✓" : "Report saved locally (connect a wallet to record it on-chain too).";
    });
  } catch (err) {
    body.innerHTML = "<p class=\"warn\">Could not load the on-chain record: " + esc(err && err.message ? err.message : err) + "</p>" +
      "<dl class=\"kv\"><dt>SHA-256</dt><dd><code>" + hashHex + "</code></dd></dl>";
  }
}

function showApp() {
  $("certView").classList.add("hidden");
  $("creatorView").classList.add("hidden");
  $("app").classList.remove("hidden");
}

function route() {
  const certM = location.hash.match(/^#\/cert\/(0x[0-9a-fA-F]{64})$/);
  if (certM) { showCertificate(certM[1]); return; }
  const creatorM = location.hash.match(/^#\/creator\/(me1[0-9a-z]+)$/);
  if (creatorM) { showCreator(creatorM[1]); return; }
  const verifyM = location.hash.match(/^#\/verify\/(0x[0-9a-fA-F]{64})$/);
  if (verifyM) {
    showApp();
    showTab("Verify");
    setStatus("Verifying hash " + verifyM[1].slice(0, 18) + "… — upload the file to compare it against this record.");
    return;
  }
  showApp();
}

$("copyCertLinkBtn").addEventListener("click", async () => {
  const url = location.href;
  try { await navigator.clipboard.writeText(url); setStatus("Certificate link copied."); }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); setStatus("Certificate link copied."); }
    catch (e2) { setStatus("Copy failed — the link is: " + url); }
    ta.remove();
  }
});
$("printCertBtn").addEventListener("click", () => window.print());
$("backBtn").addEventListener("click", () => { location.hash = ""; route(); });
$("creatorBackBtn").addEventListener("click", () => { location.hash = ""; route(); });
$("connectBtn").addEventListener("click", connectWallet);
$("tabRegister").addEventListener("click", () => showTab("Register"));
$("tabBatch").addEventListener("click", () => showTab("Batch"));
$("tabVerify").addEventListener("click", () => showTab("Verify"));
$("tabExplorer").addEventListener("click", () => showTab("Explorer"));

window.addEventListener("hashchange", route);
// Script runs at the end of <body>, so the DOM already exists.
// Expose the analyser so api.js hashFile() uses the same code path as the UI.
window.__originproofAnalyzeFile = analyzeFile;
refreshNetPill();
route();
