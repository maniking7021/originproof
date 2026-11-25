// Tests for frontend/lib.js — run: node tests/test-lib.js
// Exits non-zero on any failure. No network, no DOM needed.
"use strict";
const fs = require("fs");
const path = require("path");
const lib = require("../frontend/lib.js");

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

/* ---------- dHash / Hamming ---------- */
console.log("dHash / Hamming:");
{
  // Left half dark (0), right half bright (255): only the step column flips -> 0x10 per row.
  const gray = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) gray.push(c < 4 ? 0 : 255);
  check("step-edge dHash is 0x10 per row", lib.dhashFromGrayscale(gray) === "1010101010101010", lib.dhashFromGrayscale(gray));
  // Flat image: all comparisons equal -> all 0 bits.
  check("flat dHash is all-zero", lib.dhashFromGrayscale(new Array(72).fill(128)) === "0000000000000000");
  // One bit different -> distance 1.
  check("hamming distance 1", lib.hammingDistance("ffffffffffffffff", "fffffffffffffffe") === 1);
  check("hamming distance 64", lib.hammingDistance("ffffffffffffffff", "0000000000000000") === 64);
  check("hamming distance 0", lib.hammingDistance("a5a5a5a5a5a5a5a5", "a5a5a5a5a5a5a5a5") === 0);
  check("similarity 100% at 0", lib.phashSimilarity(0) === 100);
  check("similarity 50% at 32", lib.phashSimilarity(32) === 50);
  check("similarity 84% at 10", lib.phashSimilarity(10) === 84);
  check("band identical", lib.phashBand(0).band === "identical");
  check("band near-duplicate at 10", lib.phashBand(10).band === "near-duplicate");
  check("band altered at 12", lib.phashBand(12).band === "altered");
  check("band different at 30", lib.phashBand(30).band === "different");
  check("bytes8 round-trip", lib.bytes8ToPhash(lib.phashToBytes8("a5a5a5a5a5a5a5a5")) === "a5a5a5a5a5a5a5a5");
  check("bytes8 empty", lib.phashToBytes8("") === "0x0000000000000000");
  try { lib.dhashFromGrayscale([1, 2, 3]); check("dHash rejects bad length", false); }
  catch (e) { check("dHash rejects bad length", true); }
}

/* ---------- EXIF / forensics ---------- */
console.log("EXIF / forensics:");
function craftExifJpeg() {
  // TIFF: "II", 42, IFD0 at 8. Two ASCII entries: Make="TestCam", Software="Stable Diffusion v1.5".
  const tiff = Buffer.alloc(68);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8); // 2 entries
  // Entry 1: Make 0x010F, ASCII(2), count 8, offset 38
  tiff.writeUInt16LE(0x010f, 10); tiff.writeUInt16LE(2, 12); tiff.writeUInt32LE(8, 14); tiff.writeUInt32LE(38, 18);
  // Entry 2: Software 0x0131, ASCII(2), count 22, offset 46
  tiff.writeUInt16LE(0x0131, 22); tiff.writeUInt16LE(2, 24); tiff.writeUInt32LE(22, 26); tiff.writeUInt32LE(46, 30);
  tiff.writeUInt32LE(0, 34); // next IFD = 0
  tiff.write("TestCam\0", 38, "ascii");
  tiff.write("Stable Diffusion v1.5\0", 46, "ascii");
  // JPEG: SOI + APP1(Exif) + EOI
  const app1Len = 2 + 6 + tiff.length;
  const jpg = Buffer.alloc(2 + 2 + 2 + 6 + tiff.length + 2);
  let o = 0;
  jpg[o++] = 0xff; jpg[o++] = 0xd8;
  jpg[o++] = 0xff; jpg[o++] = 0xe1;
  jpg.writeUInt16BE(app1Len, o); o += 2;
  jpg.write("Exif\0\0", o, "ascii"); o += 6;
  tiff.copy(jpg, o); o += tiff.length;
  jpg[o++] = 0xff; jpg[o++] = 0xd9;
  return jpg;
}
{
  const jpg = craftExifJpeg();
  const meta = lib.parseMetadata(jpg.buffer.slice(jpg.byteOffset, jpg.byteOffset + jpg.byteLength), "image/jpeg");
  check("JPEG detected", meta.format === "JPEG", meta.format);
  check("EXIF Make parsed", meta.fields.some((f) => f.label === "Camera make" && f.value === "TestCam"), JSON.stringify(meta.fields));
  check("EXIF Software parsed", meta.fields.some((f) => f.label === "Software" && f.value === "Stable Diffusion v1.5"), JSON.stringify(meta.fields));
  check("AI marker found (Stable Diffusion)", meta.aiMarkers.some((m) => m.kind === "ai" && m.marker === "Stable Diffusion"), JSON.stringify(meta.aiMarkers));
  check("verdict ai-marker", meta.verdict === "ai-marker", meta.verdict);
  check("hasExif flag", meta.flags.hasExif === true);
}
{
  // Plain PNG with no metadata -> verdict "none".
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  const meta = lib.parseMetadata(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength), "image/png");
  check("empty PNG verdict none", meta.verdict === "none", meta.verdict);
  check("empty PNG no fields", meta.fields.length === 0);
}
{
  // Raw scan: Midjourney string inside a fake file.
  const buf = Buffer.from("xxxx Midjourney v6 --ar 16:9 yyyy", "ascii");
  const meta = lib.parseMetadata(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "image/jpeg");
  check("raw scan finds Midjourney", meta.aiMarkers.some((m) => m.marker === "Midjourney"), JSON.stringify(meta.aiMarkers));
  check("raw scan verdict ai-marker", meta.verdict === "ai-marker");
}
{
  // C2PA / JUMBF marker in APP11.
  const app11 = Buffer.alloc(2 + 2 + 2 + 5 + 2);
  let o = 0;
  app11[o++] = 0xff; app11[o++] = 0xd8;
  app11[o++] = 0xff; app11[o++] = 0xeb;
  app11.writeUInt16BE(7, o); o += 2; // len = 2 + 5
  app11.write("JUMBF", o, "ascii"); o += 5;
  app11[o++] = 0xff; app11[o++] = 0xd9;
  const meta = lib.parseMetadata(app11.buffer.slice(app11.byteOffset, app11.byteOffset + app11.byteLength), "image/jpeg");
  check("JUMBF/C2PA detected", meta.flags.hasC2pa === true, JSON.stringify(meta.flags));
  check("C2PA marker listed", meta.aiMarkers.some((m) => m.kind === "c2pa"), JSON.stringify(meta.aiMarkers));
}

/* ---------- QR encoder ---------- */
console.log("QR encoder:");
{
  // Known spec vectors: EC level L, mask 0 -> 111011111000100; version 7 -> 000111110010010100.
  check("format bits L/mask0", lib.qrFormatBits(0) === 0b111011111000100,
    "got " + lib.qrFormatBits(0).toString(2));
  check("version bits v7", lib.qrVersionBits(7) === 0b000111110010010100,
    "got " + lib.qrVersionBits(7).toString(2));
  check("version bits v10", lib.qrVersionBits(10) === 0b001010010011010011,
    "got " + lib.qrVersionBits(10).toString(2).padStart(18, "0"));
}
{
  // Reed-Solomon syndrome check: data + EC must be divisible by the generator.
  // Rebuild GF(256) here and evaluate the codeword polynomial at alpha^0..alpha^(deg-1).
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
  const data = [0x48, 0x65, 0x6c, 0x6c, 0x6f]; // "Hello"
  const deg = 10;
  const ec = lib._rsRemainder(data, deg);
  const code = data.concat(ec);
  let ok = true;
  for (let r = 0; r < deg; r++) {
    let sum = 0;
    for (let i = 0; i < code.length; i++) sum ^= mul(code[i], EXP[(r * (code.length - 1 - i)) % 255]);
    if (sum !== 0) ok = false;
  }
  check("RS syndrome is zero (valid codeword)", ok);
  check("RS EC length", ec.length === deg);
}
{
  const q1 = lib.encodeQR("HELLO");
  check("QR v1 size 21", q1.version === 1 && q1.size === 21, "v" + q1.version + " size " + q1.size);
  const q2 = lib.encodeQR("https://example.com"); // 19 bytes > v1-L capacity (17) -> v2
  check("QR 19-byte URL is v2", q2.version === 2, "v" + q2.version);
  check("QR finder top-left dark", q1.modules[0][0] === true && q1.modules[3][3] === true && q1.modules[1][1] === false);
  check("QR timing pattern", q1.modules[6][8] === true && q1.modules[6][9] === false);
  check("QR dark module", q1.modules[q1.size - 8][8] === true);
  const qLong = lib.encodeQR("https://originproof.example/#/cert/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  check("long cert URL fits v<=10", qLong.version >= 1 && qLong.version <= 10, "v" + qLong.version);
  let threw = false;
  try { lib.encodeQR("x".repeat(300)); } catch (e) { threw = true; }
  check("QR rejects >271 byte text", threw);
  // Determinism: same input -> same matrix.
  const a = lib.encodeQR("determinism check"), b = lib.encodeQR("determinism check");
  check("QR deterministic", JSON.stringify(a.modules) === JSON.stringify(b.modules));
  // Write one QR as PBM for the OpenCV decode test.
  const out = path.join(__dirname, "qr-test.pbm");
  const scale = 8, quiet = 4;
  const px = (qLong.size + quiet * 2) * scale;
  const bits = [];
  for (let y = 0; y < px; y++) {
    for (let xx = 0; xx < px; xx++) {
      const mx = Math.floor(xx / scale) - quiet, my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < qLong.size && my < qLong.size && qLong.modules[my][mx];
      bits.push(dark ? "1" : "0");
    }
  }
  let pbm = "P4\n" + px + " " + px + "\n";
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] === "1" ? 1 : 0);
    bytes.push(byte);
  }
  fs.writeFileSync(out, pbm + Buffer.from(bytes).toString("latin1"), "latin1");
  fs.writeFileSync(path.join(__dirname, "qr-test-text.txt"),
    "https://originproof.example/#/cert/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  console.log("  (wrote qr-test.pbm for OpenCV decode test)");
}

/* ---------- Video fingerprint (v0.3) ---------- */
console.log("Video fingerprint:");
{
  const A = "1010101010101010"; // step-edge frame
  const B = "1010101010101011"; // A with one bit flipped
  const C = "0000000000000000"; // flat frame
  const D = "ffffffffffffffff"; // opposite of C
  check("aggregate identical frames", lib.aggregateVideoPhash([A, A, A]).consensus === A);
  check("aggregate frameCount kept", lib.aggregateVideoPhash([A, A, A]).frameCount === 3);
  check("aggregate majority vote wins", lib.aggregateVideoPhash([D, D, C]).consensus === D);
  check("aggregate tie goes to 0", lib.aggregateVideoPhash([D, C]).consensus === C);
  check("aggregate single frame", lib.aggregateVideoPhash(["a5a5a5a5a5a5a5a5"]).consensus === "a5a5a5a5a5a5a5a5");
  check("aggregate empty -> null", lib.aggregateVideoPhash([]) === null);
  check("aggregate invalid only -> null", lib.aggregateVideoPhash(["not-a-hash", ""]) === null);
  const agg = lib.aggregateVideoPhash([A, "junk", A]);
  check("aggregate filters invalid entries", agg && agg.consensus === A && agg.frameCount === 2);
  check("video distance identical is 0",
    lib.videoPhashDistance({ consensus: A, frames: [A, A, A] }, { consensus: A, frames: [A, A] }) === 0);
  check("video distance one-bit edit is 1",
    lib.videoPhashDistance({ consensus: A, frames: [A, A] }, { consensus: B, frames: [B, B] }) === 1);
  check("video distance trimmed copy stays small",
    lib.videoPhashDistance({ consensus: A, frames: [A, A, A, A] }, { consensus: A, frames: [A, A] }) <= 2);
  check("video distance different videos is large",
    lib.videoPhashDistance({ consensus: C, frames: [C, C] }, { consensus: D, frames: [D, D] }) === 64);
  check("video distance bad input is 64",
    lib.videoPhashDistance(null, { consensus: A, frames: [A] }) === 64);
  check("frame coverage all close is 1", lib.videoFrameCoverage([A, A, A], A) === 1);
  check("frame coverage none close is 0", lib.videoFrameCoverage([D, D], A) === 0);
  const cov = lib.videoFrameCoverage([A, B, D], A);
  check("frame coverage partial is 2/3", Math.abs(cov - 2 / 3) < 0.001, "got " + cov);
  check("frame coverage empty is 0", lib.videoFrameCoverage([], A) === 0);
  check("frame coverage bad consensus is 0", lib.videoFrameCoverage([A], "zzz") === 0);
  check("isValidPhashHex accepts 16 hex", lib.isValidPhashHex("a5a5a5a5a5a5a5a5") === true);
  check("isValidPhashHex rejects short", lib.isValidPhashHex("a5a5") === false);
  check("isValidPhashHex rejects non-hex", lib.isValidPhashHex("g5a5a5a5a5a5a5a5") === false);
}

/* ---------- ME ID helpers (v0.3) ---------- */
console.log("ME ID:");
{
  check("meId empty is valid (optional)", lib.isValidMeId("") === true);
  check("meId null is valid (optional)", lib.isValidMeId(null) === true);
  check("meId real address valid", lib.isValidMeId("me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf") === true);
  check("meId EVM hex rejected", lib.isValidMeId("0x5fcc59451ca07a68df0ce1628a1f8f757b256969") === false);
  check("meId too short rejected", lib.isValidMeId("me1") === false);
  check("meId too long rejected", lib.isValidMeId("me1" + "a".repeat(62)) === false);
  check("meId uppercase rejected", lib.isValidMeId("ME1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf") === false);
  check("meId space rejected", lib.isValidMeId("me1abc def") === false);
  check("shortMeId truncates", lib.shortMeId("me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf") === "me1tlx…3xqf",
    lib.shortMeId("me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf"));
  check("shortMeId empty is dash", lib.shortMeId("") === "—");
}

/* ---------- SHA-256 sync + stable JSON (v0.3) ---------- */
console.log("SHA-256 sync / stable JSON:");
{
  check("sha256 empty vector", lib.sha256HexSync("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  check("sha256 abc vector", lib.sha256HexSync("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  check("sha256 hello world", lib.sha256HexSync("hello world") === "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  check("sha256 Uint8Array matches string", lib.sha256HexSync(new TextEncoder().encode("abc")) === lib.sha256HexSync("abc"));
  check("stableStringify sorts keys", lib.stableStringify({ b: 1, a: { d: 4, c: 3 } }) === '{"a":{"c":3,"d":4},"b":1}');
  check("stableStringify arrays keep order", lib.stableStringify([3, 1, 2]) === "[3,1,2]");
}

/* ---------- C2PA manifest (v0.3) ---------- */
console.log("C2PA manifest:");
{
  const input = {
    fileName: "press.jpg", contentType: "image/jpeg", size: 12345,
    sha256Hex: "0x" + "ab".repeat(32), phash: "1010101010101010", title: "Press photo",
    uploader: "0x1111111111111111111111111111111111111111", meId: "me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf",
    contractAddress: "0x2222222222222222222222222222222222222222",
    networkName: "ME Network Testnet", chainId: 400,
    txHash: "0x" + "cd".repeat(32), registeredAt: "2026-11-23T00:00:00.000Z",
  };
  const m = lib.buildC2paManifest(input);
  check("manifest claim generator", m.claim_generator === "OriginProof/0.3", m.claim_generator);
  const labels = m.assertions.map((a) => a.label);
  check("manifest has c2pa.hash", labels.includes("c2pa.hash"));
  check("manifest has c2pa.actions", labels.includes("c2pa.actions"));
  check("manifest has me-network assertion", labels.includes("org.originproof.me-network"));
  const hashA = m.assertions.find((a) => a.label === "c2pa.hash");
  check("manifest hash assertion matches file", hashA.data.hash === "ab".repeat(32) && hashA.data.alg === "sha256");
  const meA = m.assertions.find((a) => a.label === "org.originproof.me-network");
  check("manifest carries tx + meId", meA.data.txHash === input.txHash && meA.data.meId === input.meId && meA.data.chainId === 400);
  const manifestHash = lib.sha256HexSync(lib.stableStringify(m));
  const ok = lib.validateC2paManifest(m, { sha256Hex: input.sha256Hex, expectedManifestHash: "0x" + manifestHash, contractAddress: input.contractAddress });
  check("valid manifest verifies", ok.valid === true, JSON.stringify(ok.errors));
  check("validation summary has actions", ok.summary.actions.includes("c2pa.created") && ok.summary.meId === input.meId);
  // Tampered hash assertion fails.
  const bad1 = JSON.parse(JSON.stringify(m));
  bad1.assertions.find((a) => a.label === "c2pa.hash").data.hash = "00".repeat(32);
  check("tampered hash assertion fails", lib.validateC2paManifest(bad1, { sha256Hex: input.sha256Hex }).valid === false);
  // Wrong file hash fails.
  check("wrong file hash fails", lib.validateC2paManifest(m, { sha256Hex: "0x" + "00".repeat(32) }).valid === false);
  // Tampered sidecar (title changed) fails the on-chain hash check.
  const bad2 = JSON.parse(JSON.stringify(m));
  bad2.title = "Forged title";
  check("tampered manifest fails on-chain hash", lib.validateC2paManifest(bad2, { sha256Hex: input.sha256Hex, expectedManifestHash: "0x" + manifestHash }).valid === false);
  // Missing assertions fails.
  check("manifest without assertions fails", lib.validateC2paManifest({ claim_generator: "OriginProof/0.3", assertions: [] }, { sha256Hex: input.sha256Hex }).valid === false);
  // Sidecar parse.
  const parsed = lib.parseC2paSidecar(lib.stableStringify(m));
  check("sidecar parses", parsed.error === null && parsed.manifest.claim_generator === "OriginProof/0.3");
  check("bad sidecar JSON errors", lib.parseC2paSidecar("{not json").error !== null);
  check("wrong generator fails", lib.validateC2paManifest({ claim_generator: "SomeoneElse/1.0", assertions: [] }, {}).valid === false);
}

/* ---------- AI-origin score (v0.3) ---------- */
console.log("AI-origin score:");
{
  const sdMeta = { format: "JPEG", fields: [{ label: "Camera make", value: "TestCam" }, { label: "Software", value: "Stable Diffusion v1.5" }], aiMarkers: [{ marker: "Stable Diffusion", kind: "ai" }], flags: { hasExif: true, hasXmp: false, hasC2pa: false, hasGps: false }, verdict: "ai-marker" };
  const sd = lib.aiOriginScore(sdMeta);
  check("AI marker scores high", sd.score >= 75 && sd.band === "likely AI-generated", sd.score + " " + sd.band);
  check("AI score lists reason", sd.reasons.some((r) => /Stable Diffusion/.test(r)));
  const cleanMeta = { format: "JPEG", fields: [{ label: "Camera make", value: "TestCam" }, { label: "Camera model", value: "X100" }], aiMarkers: [], flags: { hasExif: true, hasXmp: false, hasC2pa: false, hasGps: true }, verdict: "clean" };
  const cl = lib.aiOriginScore(cleanMeta);
  check("camera EXIF scores low", cl.score < 25 && cl.band === "likely human-made", cl.score + " " + cl.band);
  const emptyMeta = { format: "PNG", fields: [], aiMarkers: [], flags: { hasExif: false, hasXmp: false, hasC2pa: false, hasGps: false }, verdict: "none" };
  const em = lib.aiOriginScore(emptyMeta);
  check("no metadata is uncertain", em.score === 25 && em.band === "uncertain", em.score + " " + em.band);
  check("null metadata is uncertain", lib.aiOriginScore(null).band === "uncertain");
  check("score stays in 0..100", lib.aiOriginScore(sdMeta).score <= 100 && lib.aiOriginScore(cleanMeta).score >= 0);
}

/* ---------- LSB watermark (v0.3) ---------- */
console.log("LSB watermark:");
{
  const sha = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
  const payload = lib.watermarkPayloadForHash("0x" + sha);
  check("watermark payload is 11 bytes", payload && payload.length === 11);
  check("watermark payload magic OP", payload && payload[0] === 0x4f && payload[1] === 0x50 && payload[2] === 0x01);
  check("watermark payload bad hash -> null", lib.watermarkPayloadForHash("xyz") === null);
  // Round-trip on synthetic pixels: 200 pixels, R values 100..199.
  const px = new Uint8ClampedArray(200 * 4);
  for (let i = 0; i < 200; i++) { px[i * 4] = 100 + (i % 100); px[i * 4 + 1] = 50; px[i * 4 + 2] = 200; px[i * 4 + 3] = 255; }
  const written = lib.lsbEmbedPixels(px, payload);
  check("LSB embed writes 88 bits", written === 88, "wrote " + written);
  const back = lib.lsbExtractPixels(px, 11);
  const parsedWm = lib.parseWatermarkPayload(back);
  check("LSB round-trip recovers hash prefix", parsedWm && parsedWm.hashPrefix === sha.slice(0, 16), parsedWm && parsedWm.hashPrefix);
  check("LSB only flips LSBs", px[0] === 100 || px[0] === 101);
  check("LSB too-small image returns -1", lib.lsbEmbedPixels(new Uint8ClampedArray(10 * 4), payload) === -1);
  check("LSB wrong magic -> null", lib.parseWatermarkPayload(new Uint8Array([0x58, 0x50, 0x01, 0, 0, 0, 0, 0, 0, 0, 0])) === null);
  check("LSB short bytes -> null", lib.parseWatermarkPayload(new Uint8Array([0x4f, 0x50])) === null);
}

/* ---------- Tamper-diff thumbnails (v0.3) ---------- */
console.log("Tamper-diff:");
{
  const flat = new Array(192).fill(128);
  const same = lib.imageThumbDiff(flat, flat.slice());
  check("identical thumbs diff 0", same && same.meanAbs === 0 && same.changedPct === 0 && same.maxAbs === 0);
  const half = flat.slice();
  for (let i = 96; i < 192; i++) half[i] = 200;
  const d = lib.imageThumbDiff(flat, half);
  check("half-changed thumb diff", d && d.changedPct === 50 && d.meanAbs === 36, JSON.stringify(d && { mean: d.meanAbs, pct: d.changedPct }));
  check("heat array is 192 values", d && d.heat.length === 192 && d.heat[0] === 0 && d.heat[100] > 0);
  check("bad thumbs -> null", lib.imageThumbDiff([1, 2], flat) === null && lib.imageThumbDiff(null, flat) === null);
}

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
