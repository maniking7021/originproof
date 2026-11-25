// OriginProof shared library — pure functions, no DOM, no dependencies.
// Used by frontend/app.js in the browser and by tests/*.js in Node.
// (UMD-style export at the bottom so both environments work.)
"use strict";

/* ==========================================================================
   1 · Perceptual hash (dHash) + Hamming distance
   dHash: downscale the image to 9x8 grayscale, then compare each pixel with
   its right neighbour — 64 bits. Resizing, re-compression and light cropping
   keep most bits the same, so near-duplicates stay close.
   ========================================================================== */

/** 64-bit dHash from 72 grayscale values (9 wide x 8 high, row-major, 0-255).
 *  Returns a 16-char lowercase hex string. */
function dhashFromGrayscale(gray9x8) {
  if (!gray9x8 || gray9x8.length !== 72) throw new Error("dHash needs 72 grayscale values (9x8)");
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      const left = gray9x8[row * 9 + col];
      const right = gray9x8[row * 9 + col + 1];
      byte = (byte << 1) | (right > left ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Hamming distance between two 16-char hex perceptual hashes (0-64). */
const _POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
function hammingDistance(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== 16 || hexB.length !== 16) return 64;
  let d = 0;
  for (let i = 0; i < 16; i++) {
    d += _POPCOUNT[parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16)];
  }
  return d;
}

/** Similarity % from a Hamming distance (0-64 bits). */
function phashSimilarity(distance) {
  return Math.max(0, Math.round(((64 - distance) / 64) * 100));
}

/** "0x" + 16 hex chars, as stored on-chain (bytes8). "0x0000…" when unavailable. */
function phashToBytes8(hex) {
  if (!hex || hex.length !== 16) return "0x0000000000000000";
  return "0x" + hex.toLowerCase();
}

/** bytes8 (0x…) back to a 16-char hex string ("" when unavailable). */
function bytes8ToPhash(b8) {
  if (!b8) return "";
  const h = String(b8).toLowerCase().replace(/^0x/, "");
  return h === "0000000000000000" ? "" : h.padStart(16, "0");
}

/** Human-readable verdict band for a perceptual-hash distance. */
function phashBand(distance) {
  if (distance === 0) return { band: "identical", label: "Visually identical" };
  if (distance <= 10) return { band: "near-duplicate", label: "Near-duplicate — likely a resized, re-compressed or lightly cropped copy" };
  if (distance <= 16) return { band: "altered", label: "Possibly altered — same image heavily edited, or a weak match" };
  return { band: "different", label: "Different image" };
}

/* ==========================================================================
   1b · Video fingerprint (v0.3)
   A video is fingerprinted from up to 8 sampled frames (see app.js
   dhashForVideo). Each frame gets its own 64-bit dHash; the frames are
   aggregated into ONE consensus hash — the per-bit majority vote across
   frames — which is what goes on-chain (same bytes8 field as images, so
   findByPhash works unchanged). The per-frame hashes stay client-side and
   are used to refine verification: a lightly edited copy keeps most frames
   close to the original consensus, while a different video does not.
   Distances stay on the 0-64 scale, so phashBand() applies unchanged.
   ========================================================================== */

/** True when `h` is a valid 16-char lowercase hex perceptual hash. */
function isValidPhashHex(h) {
  return typeof h === "string" && /^[0-9a-f]{16}$/.test(h);
}

/** Aggregate per-frame dHashes into one video fingerprint.
 *  `frameHashes` — array of 16-char hex dHashes (1..N frames).
 *  Returns { consensus, frames, frameCount } or null when no valid frame.
 *  Consensus = per-bit majority vote (strict majority -> 1, ties -> 0),
 *  which makes the fingerprint robust to a few odd frames (fade-in, cuts,
 *  black frames) and to light re-encoding. */
function aggregateVideoPhash(frameHashes) {
  if (!Array.isArray(frameHashes)) return null;
  const frames = frameHashes.filter(isValidPhashHex);
  if (frames.length === 0) return null;
  let consensus = "";
  for (let bit = 0; bit < 64; bit++) {
    const nibble = Math.floor(bit / 4), shift = 3 - (bit % 4);
    let ones = 0;
    for (const h of frames) if ((parseInt(h[nibble], 16) >> shift) & 1) ones++;
    consensus += (ones * 2 > frames.length ? "1" : "0");
    if (bit % 4 === 3) {
      // flush the completed nibble into hex
      const bits = consensus.slice(-4);
      consensus = consensus.slice(0, -4) + parseInt(bits, 2).toString(16);
    }
  }
  return { consensus, frames: frames.slice(), frameCount: frames.length };
}

/** Mean minimum frame distance between two frame lists (symmetric).
 *  For each frame in A, the closest frame in B; averaged both ways.
 *  Identical frame sets -> 0. A trimmed copy (subset of frames) -> small. */
function meanMinFrameDistance(framesA, framesB) {
  if (!framesA.length || !framesB.length) return 64;
  const oneWay = (X, Y) => {
    let sum = 0;
    for (const h of X) {
      let best = 64;
      for (const g of Y) { const d = hammingDistance(h, g); if (d < best) best = d; }
      sum += best;
    }
    return sum / X.length;
  };
  return (oneWay(framesA, framesB) + oneWay(framesB, framesA)) / 2;
}

/** Distance (0-64) between two video fingerprints { consensus, frames }.
 *  Average of the consensus-hash distance and the mean frame distance:
 *  the consensus guards against a single lucky matching frame, the frame
 *  distance catches trimmed / re-ordered copies whose consensus drifted. */
function videoPhashDistance(fpA, fpB) {
  if (!fpA || !fpB || !isValidPhashHex(fpA.consensus) || !isValidPhashHex(fpB.consensus)) return 64;
  const dConsensus = hammingDistance(fpA.consensus, fpB.consensus);
  const dFrames = meanMinFrameDistance(fpA.frames || [], fpB.frames || []);
  return Math.round((dConsensus + dFrames) / 2);
}

/** Fraction (0..1) of `queryFrames` within `maxDistance` bits of a stored
 *  consensus hash. Used at verify time: the original's per-frame hashes
 *  are not on-chain, only its consensus — so coverage measures how many
 *  of the queried video's sampled frames still resemble the registered
 *  original. A lightly edited copy scores near 1; a different video near 0. */
function videoFrameCoverage(queryFrames, storedConsensus, maxDistance) {
  if (!Array.isArray(queryFrames) || !isValidPhashHex(storedConsensus)) return 0;
  const frames = queryFrames.filter(isValidPhashHex);
  if (!frames.length) return 0;
  const max = maxDistance == null ? 10 : maxDistance;
  let close = 0;
  for (const h of frames) if (hammingDistance(h, storedConsensus) <= max) close++;
  return close / frames.length;
}

/* ==========================================================================
   1c · ME ID helpers (v0.3)
   An ME ID is the uploader's verified MetaEarth identity — a public bech32
   address starting with "me1" (e.g. me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf).
   It is OPTIONAL at registration: empty means "not linked". It is a public
   address, never a secret — but a private key, seed phrase or password must
   NEVER be entered here (the UI says so; the contract only stores the
   public address string).
   ========================================================================== */

/** True when `s` is a usable ME ID: empty (not linked) or "me1" + 7..61
 *  lowercase letters/digits (total 10..64 chars, bech32-style). */
function isValidMeId(s) {
  if (s === "" || s === null || s === undefined) return true;
  return typeof s === "string" && /^me1[0-9a-z]{7,61}$/.test(s);
}

/** Truncated ME ID for display, e.g. me1tlx9…3xqf (full address shown
 *  alongside in the UI where space allows). */
function shortMeId(s) {
  if (!s) return "—";
  return s.length > 13 ? s.slice(0, 6) + "…" + s.slice(-4) : s;
}

/* ==========================================================================
   1d · SHA-256 (sync, dependency-free) + stable JSON (v0.3)
   WebCrypto is async and browser-only; the C2PA manifest hash must be
   computable synchronously in both the browser and Node tests, so lib.js
   carries a small pure-JS SHA-256. Verified against known vectors in
   tests (empty string, "abc").
   ========================================================================== */

const _SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256 of a string (UTF-8), Uint8Array or ArrayBuffer. Returns 64-char
 *  lowercase hex. Only for small inputs (manifests, test vectors) — file
 *  hashing still uses WebCrypto in the app. */
function sha256HexSync(input) {
  let bytes;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else bytes = input;
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false); // low 32 bits; high word stays 0
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + _SHA256_K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

/** JSON with sorted object keys (recursive), so the same manifest always
 *  serialises to the same bytes — the manifest hash is reproducible. */
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

/* ==========================================================================
   1e · C2PA-aligned Content Credentials manifest (v0.3)
   OriginProof generates a JSON sidecar manifest for each registration,
   using the C2PA assertion labels (c2pa.hash, c2pa.actions,
   stds.schema-org.CreativeWork) plus a custom org.originproof.me-network
   assertion carrying the ME Network proof. It is a sidecar JSON file
   (<name>.c2pa.json), NOT a signed JUMBF box — see README for exactly
   what is aligned and what is simplified. The manifest's SHA-256 can be
   anchored on-chain via attachManifest; validation recomputes it.
   ========================================================================== */

const C2PA_CLAIM_GENERATOR = "OriginProof/0.3";

/** Build a C2PA-aligned manifest object for a registered file.
 *  All inputs are plain data; `txHash`/`registeredAt` may be null when the
 *  manifest is built before registration (the hash then differs from the
 *  attached one — the app always builds it AFTER the tx confirms). */
function buildC2paManifest(input) {
  const inp = input || {};
  const sha = String(inp.sha256Hex || "").replace(/^0x/, "").toLowerCase();
  return {
    claim_generator: C2PA_CLAIM_GENERATOR,
    claim_generator_info: { name: "OriginProof", version: "0.3" },
    title: inp.title || inp.fileName || "",
    assertions: [
      { label: "c2pa.hash", data: { alg: "sha256", hash: sha, exclusions: [] } },
      {
        label: "c2pa.actions",
        data: {
          actions: [
            { action: "c2pa.created", softwareAgent: C2PA_CLAIM_GENERATOR },
            { action: "c2pa.published", softwareAgent: C2PA_CLAIM_GENERATOR },
            { action: "org.originproof.registered", softwareAgent: C2PA_CLAIM_GENERATOR, description: "Registered on ME Network" },
          ],
        },
      },
      { label: "stds.schema-org.CreativeWork", data: { "@type": "CreativeWork", name: inp.title || inp.fileName || "" } },
      {
        label: "org.originproof.me-network",
        data: {
          network: inp.networkName || "ME Network Testnet",
          chainId: inp.chainId == null ? null : inp.chainId,
          contractAddress: inp.contractAddress || null,
          txHash: inp.txHash || null,
          meId: inp.meId || "",
          uploader: inp.uploader || "",
          registeredAt: inp.registeredAt || null,
          perceptualHash: inp.phash || null,
          contentType: inp.contentType || "",
          fileName: inp.fileName || "",
          fileSize: inp.size == null ? null : inp.size,
        },
      },
    ],
  };
}

/** Parse sidecar text into { manifest, error }. */
function parseC2paSidecar(text) {
  try {
    const m = JSON.parse(text);
    if (!m || typeof m !== "object" || Array.isArray(m)) return { manifest: null, error: "Not a JSON object." };
    return { manifest: m, error: null };
  } catch (e) {
    return { manifest: null, error: "Invalid JSON: " + (e && e.message ? e.message : e) };
  }
}

function _manifestAssertion(manifest, label) {
  const list = (manifest && manifest.assertions) || [];
  return list.find((a) => a && a.label === label) || null;
}

/** Validate a manifest against a file and (optionally) an on-chain record.
 *  opts: { sha256Hex, expectedManifestHash, contractAddress }.
 *  Returns { valid, errors[], summary } where summary carries the
 *  generator, title, actions, network, chainId, contractAddress, txHash,
 *  meId and registeredAt for display. */
function validateC2paManifest(manifest, opts) {
  opts = opts || {};
  const errors = [];
  const summary = { generator: "", title: "", actions: [], network: "", chainId: null, contractAddress: "", txHash: "", meId: "", registeredAt: "" };
  if (!manifest || typeof manifest !== "object") return { valid: false, errors: ["Manifest is not an object."], summary };
  summary.generator = manifest.claim_generator || "";
  if (typeof summary.generator !== "string" || !summary.generator.startsWith("OriginProof/")) {
    errors.push("claim_generator is not OriginProof.");
  }
  summary.title = manifest.title || "";
  const hashA = _manifestAssertion(manifest, "c2pa.hash");
  const wantSha = String(opts.sha256Hex || "").replace(/^0x/, "").toLowerCase();
  if (!hashA || !hashA.data || hashA.data.alg !== "sha256" || typeof hashA.data.hash !== "string") {
    errors.push("Missing or invalid c2pa.hash assertion.");
  } else if (wantSha && hashA.data.hash.toLowerCase() !== wantSha) {
    errors.push("c2pa.hash does not match this file's SHA-256.");
  }
  const actA = _manifestAssertion(manifest, "c2pa.actions");
  if (!actA || !actA.data || !Array.isArray(actA.data.actions) || actA.data.actions.length === 0) {
    errors.push("Missing c2pa.actions assertion.");
  } else {
    summary.actions = actA.data.actions.map((a) => a && a.action).filter(Boolean);
  }
  const meA = _manifestAssertion(manifest, "org.originproof.me-network");
  if (meA && meA.data) {
    summary.network = meA.data.network || "";
    summary.chainId = meA.data.chainId == null ? null : meA.data.chainId;
    summary.contractAddress = meA.data.contractAddress || "";
    summary.txHash = meA.data.txHash || "";
    summary.meId = meA.data.meId || "";
    summary.registeredAt = meA.data.registeredAt || "";
    if (opts.contractAddress && summary.contractAddress &&
        summary.contractAddress.toLowerCase() !== String(opts.contractAddress).toLowerCase()) {
      errors.push("Manifest contract address does not match this deployment.");
    }
  } else {
    errors.push("Missing org.originproof.me-network assertion.");
  }
  if (opts.expectedManifestHash) {
    const want = String(opts.expectedManifestHash).replace(/^0x/, "").toLowerCase();
    if (sha256HexSync(stableStringify(manifest)) !== want) {
      errors.push("Manifest hash does not match the on-chain manifest hash (the sidecar was changed).");
    }
  }
  return { valid: errors.length === 0, errors, summary };
}

/* ==========================================================================
   1f · AI-origin score (v0.3) — heuristic, NOT a certified detector
   Combines the metadata signals parseMetadata already finds (AI-generator
   tags, editing software, camera EXIF presence, GPS, C2PA) into a 0-100
   "likely AI-generated" score with plain-language reasons. The UI must
   say it is a heuristic: metadata can be stripped or forged, and a clean
   score never proves a file is human-made.
   ========================================================================== */

function aiOriginScore(meta) {
  if (!meta) return { score: 10, band: "uncertain", reasons: ["No metadata could be read — nothing to judge by."] };
  const reasons = [];
  let score = 10;
  const fields = meta.fields || [];
  const aiMarkers = (meta.aiMarkers || []).filter((m) => m.kind === "ai");
  if (meta.flags && meta.flags.hasC2pa) {
    score -= 5;
    reasons.push("A C2PA manifest is present — the file carries provenance metadata.");
  }
  const hasCamera = fields.some((f) => /camera/i.test(f.label || ""));
  if (hasCamera) {
    score -= 15;
    reasons.push("Camera make/model present in EXIF.");
  } else {
    score += 15;
    reasons.push("No camera make/model in metadata.");
  }
  if (meta.flags && meta.flags.hasGps) {
    score -= 5;
    reasons.push("GPS data present.");
  }
  const hasSoftware = fields.some((f) => /software/i.test(f.label || ""));
  if (hasSoftware && !aiMarkers.length) {
    score += 5;
    reasons.push("Editing software named in metadata.");
  }
  if (aiMarkers.length) {
    score = Math.max(score, 78);
    reasons.push("Metadata names an AI generator: " + aiMarkers.map((m) => m.marker).join(", ") + ".");
  }
  score = Math.max(0, Math.min(100, score));
  const band = score < 25 ? "likely human-made" : score < 50 ? "uncertain" : score < 75 ? "likely AI-assisted" : "likely AI-generated";
  return { score, band, reasons };
}

/* ==========================================================================
   1g · Invisible watermark (v0.3) — LSB steganography, pure bit logic
   Payload (11 bytes): "OP" + version 0x01 + first 8 bytes of the record's
   SHA-256. Bits go into the R-channel least-significant bit of each pixel
   (1 bit per pixel, row-major). Canvas loading / PNG export lives in
   app.js; these functions work on raw RGBA pixel arrays so they are
   testable in Node.
   ========================================================================== */

function watermarkPayloadForHash(shaHex) {
  const clean = String(shaHex || "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{16,}$/.test(clean)) return null;
  const out = new Uint8Array(11);
  out[0] = 0x4f; out[1] = 0x50; out[2] = 0x01; // "OP" + version 1
  for (let i = 0; i < 8; i++) out[3 + i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function parseWatermarkPayload(bytes) {
  if (!bytes || bytes.length < 11) return null;
  if (bytes[0] !== 0x4f || bytes[1] !== 0x50 || bytes[2] !== 0x01) return null;
  let hex = "";
  for (let i = 3; i < 11; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return { magic: "OP", version: 1, hashPrefix: hex };
}

/** Embed payload bytes into RGBA pixel data (R-channel LSB). Returns the
 *  number of bits written, or -1 when the image is too small. */
function lsbEmbedPixels(pixels, payloadBytes) {
  const need = payloadBytes.length * 8;
  if (Math.floor(pixels.length / 4) < need) return -1;
  for (let i = 0; i < need; i++) {
    const bit = (payloadBytes[i >> 3] >> (7 - (i & 7))) & 1;
    pixels[i * 4] = (pixels[i * 4] & 0xfe) | bit;
  }
  return need;
}

/** Extract `byteLength` bytes from RGBA pixel data (R-channel LSB). */
function lsbExtractPixels(pixels, byteLength) {
  const need = byteLength * 8;
  if (Math.floor(pixels.length / 4) < need) return null;
  const out = new Uint8Array(byteLength);
  for (let i = 0; i < need; i++) {
    out[i >> 3] |= (pixels[i * 4] & 1) << (7 - (i & 7));
  }
  return out;
}

/* ==========================================================================
   1h · Tamper-diff thumbnails (v0.3)
   Registration stores a compact 16x12 grayscale thumbnail (192 values)
   in the local record; verification compares the query file's thumbnail
   against it. Pure array math — the app renders the heatmap on canvas.
   ========================================================================== */

/** Compare two 16x12 grayscale thumbnails (arrays of 192 values 0-255).
 *  Returns { meanAbs, maxAbs, changedPct, heat } or null on bad input.
 *  `changed` counts pixels whose brightness moved by more than 24/255.
 *  `heat` is a 192-value 0-255 array (0 = identical, 255 = fully changed). */
function imageThumbDiff(thumbA, thumbB) {
  if (!thumbA || !thumbB || thumbA.length !== 192 || thumbB.length !== 192) return null;
  let sum = 0, max = 0, changed = 0;
  const heat = [];
  for (let i = 0; i < 192; i++) {
    const d = Math.abs(thumbA[i] - thumbB[i]);
    sum += d;
    if (d > max) max = d;
    if (d > 24) changed++;
    heat.push(Math.min(255, Math.round(d * 2)));
  }
  return {
    meanAbs: Math.round((sum / 192) * 10) / 10,
    maxAbs: max,
    changedPct: Math.round((changed / 192) * 100),
    heat,
  };
}

/* ==========================================================================
   2 · Metadata / EXIF forensics (dependency-free, client-side)
   Parses JPEG APP1 Exif (TIFF), JPEG APP1 XMP, JPEG APP11 JUMBF/C2PA,
   PNG text chunks + eXIf, and scans raw bytes for known AI-generator
   markers. These are METADATA SIGNALS, not proof: metadata can be stripped
   or forged. The UI must say so.
   ========================================================================== */

const AI_MARKERS = [
  { key: "stable diffusion", kind: "ai", label: "Stable Diffusion" },
  { key: "midjourney", kind: "ai", label: "Midjourney" },
  { key: "dall-e", kind: "ai", label: "DALL-E" },
  { key: "dall·e", kind: "ai", label: "DALL-E" },
  { key: "firefly", kind: "ai", label: "Adobe Firefly" },
  { key: "imagen", kind: "ai", label: "Google Imagen" },
  { key: "synthid", kind: "ai", label: "Google SynthID" },
  { key: "leonardo", kind: "ai", label: "Leonardo.Ai" },
  { key: "nightcafe", kind: "ai", label: "NightCafe" },
  { key: "ideogram", kind: "ai", label: "Ideogram" },
  { key: "runway", kind: "ai", label: "Runway" },
  { key: "flux", kind: "ai", label: "FLUX" },
  { key: "ai generated", kind: "ai", label: "AI-generated label" },
  { key: "generated by ai", kind: "ai", label: "AI-generated label" },
  { key: "c2pa", kind: "c2pa", label: "C2PA manifest" },
  { key: "content credentials", kind: "c2pa", label: "Content Credentials (C2PA)" },
  { key: "jumbf", kind: "c2pa", label: "JUMBF manifest" },
];
const SOFTWARE_MARKERS = [
  { key: "adobe photoshop", kind: "software", label: "Adobe Photoshop" },
  { key: "lightroom", kind: "software", label: "Adobe Lightroom" },
  { key: "gimp", kind: "software", label: "GIMP" },
  { key: "canva", kind: "software", label: "Canva" },
];

function _cleanStr(s) {
  return String(s || "").replace(/[\x00-\x1F\x7F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

function _latin1(bytes, start, len) {
  let s = "";
  const end = Math.min(bytes.length, start + len);
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Minimal TIFF/EXIF parser. Returns { fields, hasGps }. */
function _parseTiff(bytes, tiffStart) {
  const out = { fields: [], hasGps: false };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const getU16 = (o, le) => view.getUint16(o, le);
  const getU32 = (o, le) => view.getUint32(o, le);
  if (tiffStart + 8 > bytes.length) return out;
  const le = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49; // "II"
  if (bytes[tiffStart] !== 0x49 && bytes[tiffStart] !== 0x4d) return out; // not II/MM
  if (getU16(tiffStart + 2, le) !== 42) return out;
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const readValue = (entryOff) => {
    const type = getU16(entryOff + 2, le);
    const count = getU32(entryOff + 4, le);
    const size = (TYPE_SIZE[type] || 1) * count;
    const valOff = size <= 4 ? entryOff + 8 : tiffStart + getU32(entryOff + 8, le);
    if (type === 2) return _latin1(bytes, valOff, count).replace(/\0.*$/, "");
    if (type === 7) return _latin1(bytes, valOff, Math.min(count, 200));
    if (type === 3 && count === 1) return String(getU16(valOff, le));
    if (type === 4 && count === 1) return String(getU32(valOff, le));
    if (type === 3) {
      const arr = [];
      for (let i = 0; i < count; i++) arr.push(getU16(valOff + i * 2, le));
      return arr.join(", ");
    }
    return "";
  };
  const IFD0_TAGS = {
    0x010e: "Description", 0x010f: "Camera make", 0x0110: "Camera model",
    0x0131: "Software", 0x0132: "Date & time", 0x013b: "Artist",
    0x8298: "Copyright",
  };
  const EXIF_TAGS = {
    0x9003: "Original date & time", 0x9286: "User comment",
    0xa434: "Lens model", 0xa405: "Focal length (35mm equiv.)",
  };
  const parseIfd = (ifdOff, tagMap, label) => {
    if (ifdOff <= 0 || tiffStart + ifdOff + 2 > bytes.length) return;
    const n = getU16(tiffStart + ifdOff, le);
    for (let i = 0; i < n; i++) {
      const e = tiffStart + ifdOff + 2 + i * 12;
      if (e + 12 > bytes.length) break;
      const tag = getU16(e, le);
      if (tag === 0x8825) { out.hasGps = true; continue; } // GPS IFD — presence only, never coordinates
      const name = tagMap[tag];
      if (!name) continue;
      const val = _cleanStr(readValue(e));
      if (val) out.fields.push({ label: name, value: val, source: label });
      if (tag === 0x8769) {
        // Exif IFD pointer — value is an offset from the TIFF start
        const sub = getU32(e + 8, le);
        parseIfd(sub, EXIF_TAGS, "EXIF");
      }
    }
  };
  const ifd0 = getU32(tiffStart + 4, le);
  parseIfd(ifd0, IFD0_TAGS, "EXIF");
  return out;
}

function _scanForMarkers(text, aiMarkers, seen) {
  const low = text.toLowerCase();
  for (const m of AI_MARKERS.concat(SOFTWARE_MARKERS)) {
    if (seen.has(m.key)) continue;
    const idx = low.indexOf(m.key);
    if (idx === -1) continue;
    seen.add(m.key);
    const ctx = _cleanStr(text.slice(Math.max(0, idx - 30), idx + m.key.length + 40));
    aiMarkers.push({ marker: m.label, kind: m.kind, context: ctx });
  }
}

/** Parse image metadata. `buf` is an ArrayBuffer, `mimeType` e.g. "image/jpeg".
 *  Returns { format, fields, aiMarkers, flags, verdict }.
 *  verdict: "ai-marker" | "signal" | "clean" | "none".
 *  "signal" = software/C2PA marker but no AI marker. "clean" = metadata
 *  present, no markers. "none" = no readable metadata at all. */
function parseMetadata(buf, mimeType) {
  const bytes = new Uint8Array(buf);
  const result = {
    format: "unknown",
    fields: [],
    aiMarkers: [],
    flags: { hasExif: false, hasXmp: false, hasC2pa: false, hasGps: false },
    verdict: "none",
  };
  const seen = new Set();
  const isJpeg = bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47;

  if (isJpeg) {
    result.format = "JPEG";
    let off = 2;
    while (off + 4 <= bytes.length) {
      if (bytes[off] !== 0xff) break;
      const marker = bytes[off + 1];
      if (marker === 0xda || marker === 0xd9) break; // SOS / EOI — scan data follows
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
      const len = (bytes[off + 2] << 8) | bytes[off + 3];
      if (len < 2 || off + 2 + len > bytes.length) break;
      const dataStart = off + 4, dataLen = len - 2;
      if (marker === 0xe1) { // APP1
        const head = _latin1(bytes, dataStart, Math.min(dataLen, 32));
        if (head.startsWith("Exif\0\0")) {
          const t = _parseTiff(bytes, dataStart + 6);
          result.fields.push(...t.fields);
          result.flags.hasExif = t.fields.length > 0;
          result.flags.hasGps = result.flags.hasGps || t.hasGps;
        } else if (head.startsWith("http://ns.adobe.com/xap/1.0/")) {
          result.flags.hasXmp = true;
          _scanForMarkers(_latin1(bytes, dataStart, dataLen), result.aiMarkers, seen);
        }
      } else if (marker === 0xeb) { // APP11 — JUMBF / C2PA
        if (_latin1(bytes, dataStart, Math.min(dataLen, 16)).includes("JUMBF")) {
          result.flags.hasC2pa = true;
          _scanForMarkers("jumbf c2pa", result.aiMarkers, seen);
        }
      }
      off += 2 + len;
    }
  } else if (isPng) {
    result.format = "PNG";
    let off = 8;
    while (off + 8 <= bytes.length) {
      const len = (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
      const type = _latin1(bytes, off + 4, 4);
      if (len < 0 || off + 12 + len > bytes.length) break;
      const dataStart = off + 8;
      if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
        const text = _latin1(bytes, dataStart, len);
        const nul = text.indexOf("\0");
        const keyword = nul >= 0 ? text.slice(0, nul) : type;
        const value = nul >= 0 ? text.slice(nul + 1) : text;
        const v = _cleanStr(value.replace(/^[^:]*:/, ""));
        if (v) result.fields.push({ label: "PNG " + _cleanStr(keyword), value: v, source: "PNG" });
        _scanForMarkers(text, result.aiMarkers, seen);
      } else if (type === "eXIf") {
        const t = _parseTiff(bytes, dataStart);
        result.fields.push(...t.fields);
        result.flags.hasExif = t.fields.length > 0;
      } else if (type === "IEND") break;
      off += 12 + len;
    }
  } else {
    result.format = (mimeType || "").startsWith("video/") ? "Video" : "Other";
  }

  // Raw-byte fallback scan (catches XMP/C2PA strings in odd places, MP4 meta, etc.)
  const scanLen = Math.min(bytes.length, 1024 * 1024);
  _scanForMarkers(_latin1(bytes, 0, scanLen), result.aiMarkers, seen);

  // Software fields themselves can carry markers (e.g. Software = "Adobe Firefly")
  for (const f of result.fields) _scanForMarkers(f.label + " " + f.value, result.aiMarkers, seen);

  const hasAi = result.aiMarkers.some((m) => m.kind === "ai");
  const hasAnyMarker = result.aiMarkers.length > 0;
  result.verdict = hasAi ? "ai-marker" : hasAnyMarker ? "signal" : result.fields.length > 0 ? "clean" : "none";
  return result;
}

/* ==========================================================================
   3 · QR Code encoder (byte mode, error-correction level L, versions 1–10)
   Dependency-free, written to the QR spec (ISO/IEC 18004). No network, no
   canvas needed: returns a boolean matrix the app renders itself.
   Verified in tests: format-info vector, version-info vector, Reed-Solomon
   syndromes, and end-to-end decode with OpenCV.
   ========================================================================== */

const QR_TABLE = [ // [totalCodewords, ecCodewordsPerBlock, [ [blockCount, dataCodewords], ... ]]
  null,
  { total: 26, ec: 7, groups: [[1, 19]] },
  { total: 44, ec: 10, groups: [[1, 34]] },
  { total: 70, ec: 15, groups: [[1, 55]] },
  { total: 100, ec: 20, groups: [[1, 80]] },
  { total: 134, ec: 26, groups: [[1, 108]] },
  { total: 172, ec: 18, groups: [[2, 68]] },
  { total: 196, ec: 20, groups: [[2, 78]] },
  { total: 242, ec: 24, groups: [[2, 97]] },
  { total: 292, ec: 30, groups: [[2, 116]] },
  { total: 346, ec: 18, groups: [[2, 68], [2, 69]] },
];
const QR_ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

// GF(256) with primitive polynomial x^8+x^4+x^3+x^2+1 (0x11D)
const _GF_EXP = new Uint8Array(512);
const _GF_LOG = new Uint8Array(256);
(function _initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    _GF_EXP[i] = x;
    _GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) _GF_EXP[i] = _GF_EXP[i - 255];
})();
function _gfMul(a, b) { return a === 0 || b === 0 ? 0 : _GF_EXP[_GF_LOG[a] + _GF_LOG[b]]; }

// Reed-Solomon generator polynomial for `degree` error-correction codewords.
// Returned in DESCENDING order: gen[0] = 1 (x^degree term), gen[k] = coeff of x^(degree-k).
function _rsGenerator(degree) {
  let gen = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]; // multiply by x
      next[j + 1] ^= _gfMul(gen[j], _GF_EXP[i]); // multiply by alpha^i
    }
    gen = next;
  }
  return gen;
}

// Reed-Solomon remainder: data bytes -> `degree` error-correction bytes.
function _rsRemainder(data, degree) {
  const gen = _rsGenerator(degree);
  const res = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ res.shift();
    res.push(0);
    for (let i = 0; i < degree; i++) res[i] ^= _gfMul(gen[i + 1], factor);
  }
  return res;
}

// BCH format info: 5 data bits (EC level L=01, mask 0-7) -> 15-bit codeword.
function qrFormatBits(mask) {
  const data = (0b01 << 3) | mask; // EC level L
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

// BCH version info: 6-bit version -> 18-bit codeword (versions >= 7).
function qrVersionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
  return (version << 12) | rem;
}

function _qrDataCodewords(text) {
  const bytes = new TextEncoder().encode(text);
  for (let v = 1; v <= 10; v++) {
    const t = QR_TABLE[v];
    const dataBits = t.groups.reduce((s, g) => s + g[0] * g[1], 0) * 8;
    const countBits = v <= 9 ? 8 : 16;
    const needBits = 4 + countBits + bytes.length * 8;
    if (needBits <= dataBits) {
      // Build the bit stream: mode 0100, char count, data, terminator, pad.
      const bits = [];
      const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
      push(0b0100, 4);
      push(bytes.length, countBits);
      for (const b of bytes) push(b, 8);
      const cap = dataBits;
      const term = Math.min(4, cap - bits.length);
      for (let i = 0; i < term; i++) bits.push(0);
      while (bits.length % 8 !== 0) bits.push(0);
      const out = [];
      for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
        out.push(byte);
      }
      const dataLen = t.groups.reduce((s, g) => s + g[0] * g[1], 0);
      for (let pad = 0; out.length < dataLen; pad++) out.push(pad % 2 === 0 ? 0xec : 0x11);
      return { version: v, dataCodewords: out };
    }
  }
  throw new Error("QR: text too long for version 10-L (max ~271 bytes)");
}

function _qrInterleave(dataCodewords, version) {
  const t = QR_TABLE[version];
  const blocks = [];
  let off = 0;
  for (const [count, len] of t.groups) {
    for (let i = 0; i < count; i++) { blocks.push(dataCodewords.slice(off, off + len)); off += len; }
  }
  const ecBlocks = blocks.map((b) => _rsRemainder(b, t.ec));
  const out = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < t.ec; i++) for (const e of ecBlocks) out.push(e[i]);
  if (out.length !== t.total) throw new Error("QR: interleave length mismatch");
  return out;
}

function _maskApplies(mask, x, y) {
  switch (mask) {
    case 0: return (y + x) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (y + x) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((y * x) % 2) + ((y * x) % 3) === 0;
    case 6: return (((y * x) % 2) + ((y * x) % 3)) % 2 === 0;
    default: return (((y + x) % 2) + ((y * x) % 3)) % 2 === 0;
  }
}

function _qrPenalty(modules, size) {
  let score = 0;
  // Rule 1: runs of 5+ same colour in a row/column.
  for (let y = 0; y < size; y++) {
    let run = 1, prev = modules[y][0];
    for (let x = 1; x < size; x++) {
      if (modules[y][x] === prev) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; prev = modules[y][x]; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let x = 0; x < size; x++) {
    let run = 1, prev = modules[0][x];
    for (let y = 1; y < size; y++) {
      if (modules[y][x] === prev) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; prev = modules[y][x]; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  // Rule 3: finder-like patterns 10111010000 / 00001011101.
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matchAt = (arr, at, pat) => pat.every((v, i) => arr[at + i] === v);
  for (let y = 0; y < size; y++)
    for (let x = 0; x <= size - 11; x++)
      if (matchAt(modules[y], x, pat1) || matchAt(modules[y], x, pat2)) score += 40;
  for (let x = 0; x < size; x++) {
    const col = modules.map((r) => r[x]);
    for (let y = 0; y <= size - 11; y++)
      if (matchAt(col, y, pat1) || matchAt(col, y, pat2)) score += 40;
  }
  // Rule 4: dark-module proportion vs 50%.
  let dark = 0;
  for (const row of modules) for (const c of row) if (c) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += k * 10;
  return score;
}

/** Encode `text` as a QR Code (byte mode, EC level L, versions 1-10).
 *  Returns { version, size, modules } — modules is a size x size array of
 *  0/1 (row-major). Throws when the text is too long (~271 bytes max). */
function encodeQR(text) {
  if (typeof text !== "string" || text.length === 0) throw new Error("QR: empty text");
  const { version, dataCodewords } = _qrDataCodewords(text);
  const size = version * 4 + 17;
  const all = _qrInterleave(dataCodewords, version);

  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunc = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFunc = (x, y, v) => { modules[y][x] = !!v; isFunc[y][x] = true; };
  const bit = (n, i) => (n >>> i) & 1;

  // Timing patterns (drawn first — finders overwrite the overlap).
  for (let i = 0; i < size; i++) { setFunc(6, i, i % 2 === 0); setFunc(i, 6, i % 2 === 0); }
  // Finder patterns + separators (centres: top-left, top-right, bottom-left).
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const xx = cx + dx, yy = cy + dy;
      if (0 <= xx && xx < size && 0 <= yy && yy < size) setFunc(xx, yy, dist !== 2 && dist !== 4);
    }
  }
  // Alignment patterns.
  const centers = QR_ALIGN[version];
  for (let i = 0; i < centers.length; i++) for (let j = 0; j < centers.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === centers.length - 1) || (i === centers.length - 1 && j === 0)) continue;
    const cx = centers[i], cy = centers[j];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      setFunc(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Version info (versions >= 7).
  if (version >= 7) {
    const bits = qrVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const b = bit(bits, i);
      const a = size - 11 + (i % 3), c = Math.floor(i / 3);
      setFunc(a, c, b); setFunc(c, a, b);
    }
  }
  // Reserve format-info positions + dark module as function modules BEFORE
  // data placement (their values are filled in after mask selection).
  // Without this, data bits would be placed into format cells and then
  // overwritten by the format bits, corrupting the stream.
  const reserve = (x, y) => { isFunc[y][x] = true; };
  for (let i = 0; i <= 5; i++) reserve(8, i);
  reserve(8, 7); reserve(8, 8); reserve(7, 8);
  for (let i = 9; i < 15; i++) reserve(14 - i, 8);
  for (let i = 0; i < 8; i++) reserve(size - 1 - i, 8);
  for (let i = 8; i < 15; i++) reserve(8, size - 15 + i);
  reserve(8, size - 8); // dark module: column 8, row 4V+9 (NOT transposed)

  // Data placement (zig-zag, two columns at a time, skipping column 6).
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunc[y][x] && bi < all.length * 8) {
          modules[y][x] = bit(all[bi >>> 3], 7 - (bi & 7)) === 1;
          bi++;
        }
      }
    }
  }
  if (bi !== all.length * 8) throw new Error("QR: data placement incomplete");

  // Try all 8 masks, keep the lowest-penalty one (masking flips data modules only).
  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      if (!isFunc[y][x] && _maskApplies(mask, x, y)) modules[y][x] = !modules[y][x];
  };
  let bestMask = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    const s = _qrPenalty(modules, size);
    if (s < bestScore) { bestScore = s; bestMask = m; }
    applyMask(m); // un-apply (XOR is its own inverse)
  }
  applyMask(bestMask);

  // Format info (both copies) + dark module.
  const fmt = qrFormatBits(bestMask);
  for (let i = 0; i <= 5; i++) setFunc(8, i, bit(fmt, i));
  setFunc(8, 7, bit(fmt, 6));
  setFunc(8, 8, bit(fmt, 7));
  setFunc(7, 8, bit(fmt, 8));
  for (let i = 9; i < 15; i++) setFunc(14 - i, 8, bit(fmt, i));
  for (let i = 0; i < 8; i++) setFunc(size - 1 - i, 8, bit(fmt, i));
  for (let i = 8; i < 15; i++) setFunc(8, size - 15 + i, bit(fmt, i));
  setFunc(8, size - 8, true); // dark module: column 8, row 4V+9

  return { version, size, modules, mask: bestMask };
}

/* ==========================================================================
   4 · Small helpers
   ========================================================================== */

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shortAddr(a) {
  if (!a) return "—";
  return a.length > 13 ? a.slice(0, 6) + "…" + a.slice(-4) : a;
}

function shortHash(h) {
  if (!h) return "—";
  return h.length > 18 ? h.slice(0, 10) + "…" + h.slice(-6) : h;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    dhashFromGrayscale, hammingDistance, phashSimilarity, phashToBytes8,
    bytes8ToPhash, phashBand, parseMetadata, encodeQR, qrFormatBits,
    qrVersionBits, escapeHtml, shortAddr, shortHash,
    isValidPhashHex, aggregateVideoPhash, meanMinFrameDistance,
    videoPhashDistance, videoFrameCoverage, isValidMeId, shortMeId,
    sha256HexSync, stableStringify, buildC2paManifest, parseC2paSidecar,
    validateC2paManifest, C2PA_CLAIM_GENERATOR, aiOriginScore,
    watermarkPayloadForHash, parseWatermarkPayload, lsbEmbedPixels,
    lsbExtractPixels, imageThumbDiff,
    _rsRemainder, _rsGenerator, _qrDataCodewords, _qrInterleave, QR_TABLE,
  };
}

// Browser global (same surface) so api.js and other scripts loaded after
// lib.js can call the pure functions without importing.
if (typeof window !== "undefined") {
  window.OriginProofLib = {
    dhashFromGrayscale, hammingDistance, phashSimilarity, phashToBytes8,
    bytes8ToPhash, phashBand, parseMetadata, encodeQR, qrFormatBits,
    qrVersionBits, escapeHtml, shortAddr, shortHash,
    isValidPhashHex, aggregateVideoPhash, meanMinFrameDistance,
    videoPhashDistance, videoFrameCoverage, isValidMeId, shortMeId,
    sha256HexSync, stableStringify, buildC2paManifest, parseC2paSidecar,
    validateC2paManifest, C2PA_CLAIM_GENERATOR, aiOriginScore,
    watermarkPayloadForHash, parseWatermarkPayload, lsbEmbedPixels,
    lsbExtractPixels, imageThumbDiff,
    _rsRemainder, _rsGenerator, _qrDataCodewords, _qrInterleave, QR_TABLE,
  };
}
