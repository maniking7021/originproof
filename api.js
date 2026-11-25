// OriginProof API (v0.3) — a tiny documented JS API so other apps can
// import the frontend and call register / verify without the UI.
// Pure static, no build step: import in a browser as a module, or require
// it in Node (lib.js is loaded from the same folder).
//
// Browser:
//   import * as OriginProof from "./api.js";
//   const info = await OriginProof.hashFile(file);
//   // info = { sha256Hex, phash, videoFp, thumb, meta, kind, name, type, size }
//   const manifest = OriginProof.buildManifest({ ...info, title: "Press photo", meId: "me1…" });
//   const check = OriginProof.validateManifest(manifest, { sha256Hex: info.sha256Hex });
//
// On-chain register / verify need ethers + the deployed contract; the app
// wires those in app.js. This module exposes only the offline pieces:
// hashing, perceptual hashing, C2PA manifest build/validate, AI score,
// watermark payloads, ME ID validation, and the REST-style endpoint
// description (see README "API" — the endpoints are a spec for the
// hosted service; the static site implements them client-side).
"use strict";

/* global ORIGINPROOF_CONFIG */

let LIB = null;
if (typeof require === "function") {
  // Node: load the browser lib from the same directory.
  LIB = require("./lib.js");
} else if (typeof window !== "undefined") {
  // Browser: lib.js is loaded by a <script> tag before api.js.
  LIB = window.OriginProofLib || null;
}

function needLib() {
  if (!LIB) throw new Error("OriginProof lib.js is not loaded. Include lib.js before api.js (browser) or require it (Node).");
  return LIB;
}

/** SHA-256 of a File/Blob (WebCrypto) — returns 0x-prefixed 64-char hex. */
async function sha256File(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Full offline analysis of a file: SHA-256, perceptual hash, video
 *  fingerprint, thumbnail, metadata forensics. The file never leaves
 *  the device. `onProgress(pct, label)` is called during video sampling. */
async function hashFile(file, opts) {
  needLib();
  const onProgress = (opts && opts.onProgress) || null;
  const sha = await sha256File(file);
  // Perceptual hashing needs the DOM (canvas/video) — available in the
  // browser; in Node, dHash helpers are in lib.js for tests.
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { sha256Hex: sha, phash: null, videoFp: null, thumb: null, meta: null, kind: "unknown", name: file.name, type: file.type || "", size: file.size };
  }
  // Delegate to the app's analyser when present (it is the same code
  // path the UI uses), otherwise fall back to a minimal image dHash.
  if (typeof window.__originproofAnalyzeFile === "function") {
    return window.__originproofAnalyzeFile(file, onProgress);
  }
  const kind = (file.type || "").startsWith("video/") ? "video" : (file.type || "").startsWith("image/") ? "image" : "other";
  return { sha256Hex: sha, phash: null, videoFp: null, thumb: null, meta: null, kind, name: file.name, type: file.type || "", size: file.size };
}

/** Build a C2PA-aligned manifest object for a registered file.
 *  Input: { fileName, contentType, size, sha256Hex, phash, title,
 *  uploader, meId, contractAddress, networkName, chainId, txHash,
 *  registeredAt }. Returns the manifest object (serialise with
 *  JSON.stringify / stableStringify). */
function buildManifest(input) {
  return needLib().buildC2paManifest(input);
}

/** Validate a manifest object against a file hash (and, optionally, the
 *  on-chain manifest hash). Returns { valid, errors, summary }. */
function validateManifest(manifest, opts) {
  return needLib().validateC2paManifest(manifest, opts || {});
}

/** SHA-256 of a manifest object, computed over its stable (sorted-key)
 *  serialisation — the value stored on-chain by attachManifest. */
function manifestHash(manifest) {
  const lib = needLib();
  return "0x" + lib.sha256HexSync(lib.stableStringify(manifest));
}

/** 0–100 "likely AI-generated" heuristic score with reasons.
 *  Input is a metadata object from lib.parseMetadata. Honest UI only:
 *  the score is a heuristic, never a certified verdict. */
function aiScore(meta) {
  return needLib().aiOriginScore(meta);
}

/** Validate an ME ID ("me1…" bech32 address). Returns true/false. */
function isValidMeId(meId) {
  return needLib().isValidMeId(meId);
}

/** Truncate an ME ID for display, e.g. me1tlx9…3xqf. */
function shortMeId(meId) {
  return needLib().shortMeId(meId);
}

/** Hamming distance between two 64-bit dHash strings (0–64). */
function phashDistance(a, b) {
  return needLib().hammingDistance(a, b);
}

/** Similarity % (0–100) from a dHash Hamming distance. */
function phashSimilarity(distance) {
  return needLib().phashSimilarity(distance);
}

/** REST-style endpoint description (spec — the static site implements
 *  these client-side; a hosted service would expose them as HTTP):
 *
 *  POST /api/v1/register  { sha256, phash, contentType, title, meId }
 *    -> { txHash, blockNumber, isFirst }
 *  GET  /api/v1/verify/:sha256
 *    -> { found, uploader, timestamp, blockNumber, meId, registrations }
 *  GET  /api/v1/near-duplicates?phash=<64-bit hex>&maxDistance=16
 *    -> [{ sha256, distance, similarity }]
 *  GET  /api/v1/creator/:meId
 *    -> { meId, works: [{ sha256, title, contentType, timestamp }] }
 *  GET  /api/v1/registry/stats
 *    -> { registrations, verifications, copiesFlagged, creators, reports }
 */
const REST_SPEC = {
  version: "v1",
  endpoints: [
    { method: "POST", path: "/api/v1/register", body: "{ sha256, phash, contentType, title, meId }", returns: "{ txHash, blockNumber, isFirst }" },
    { method: "GET", path: "/api/v1/verify/:sha256", returns: "{ found, uploader, timestamp, blockNumber, meId, registrations }" },
    { method: "GET", path: "/api/v1/near-duplicates?phash=<hex>&maxDistance=16", returns: "[{ sha256, distance, similarity }]" },
    { method: "GET", path: "/api/v1/creator/:meId", returns: "{ meId, works: [{ sha256, title, contentType, timestamp }] }" },
    { method: "GET", path: "/api/v1/registry/stats", returns: "{ registrations, verifications, copiesFlagged, creators, reports }" },
  ],
};

const OriginProofApi = {
  version: "0.3",
  sha256File,
  hashFile,
  buildManifest,
  validateManifest,
  manifestHash,
  aiScore,
  isValidMeId,
  shortMeId,
  phashDistance,
  phashSimilarity,
  REST_SPEC,
};

if (typeof window !== "undefined") window.OriginProofApi = OriginProofApi;
if (typeof module !== "undefined" && module.exports) module.exports = OriginProofApi;
