# OriginProof — MetaEarth Hackathon 2026: HARBOR

**Track:** AI & Trust Infrastructure · **Prize pool:** 100,000 USDT (1st: 40,000)
**Submission deadline:** 21 Dec 2026, 15:59 UTC (8:59 PM PKT) · **Demo Day:** 15 Jan 2027
**Team:** Mani Team — Muhammad Zaman (captain) + Sohail Abbas — both members'
advanced ME ID verifications approved; registration fixed 23 Nov 2026.

Upload any photo or video → its SHA-256 fingerprint **and** its perceptual hash
(dHash) are stored on ME Network → anyone can re-upload the same file and verify
when it was registered, by whom, and whether it is the original — or a resized,
re-compressed or cropped near-duplicate. The file itself never leaves the device.

## Why this is different from a plain hash registry

A plain SHA-256 registry is beaten by the oldest trick in the book: resize or
re-compress a stolen photo and its fingerprint changes completely. OriginProof
stores a second fingerprint — a 64-bit perceptual hash — next to the SHA-256.
A resized, re-compressed or lightly cropped copy has a different SHA-256 but a
nearly identical perceptual hash, so verification reports **NEAR-DUPLICATE — 94%
similar** and points at the original registration instead of saying "not found".

## What is built (v0.3, 23 Nov 2026)

| File | What it is |
|---|---|
| `contracts/OriginProof.sol` | Registry contract **v3**: `register` / `registerBatch` (up to 10 files, one tx) with optional **ME ID**; `verify` (9-field record incl. `meId` + `manifestHash`); `isRegistered`, `registrationCount`, `totalRecords`, `hashAt` (enumerate records), `findByPhash` (on-chain near-duplicate search, view-only), `attachManifest` (C2PA hash anchoring, uploader-only), `reportCopy` / `reportCount` (copy reports), `VERSION = "3"`. v2 4-arg wrappers kept. First registration = origin claim; later registrations of the same hash are counted and flagged as copies. Compiles with Solidity 0.8.28 — 17 ABI entries, 12,801 bytecode bytes. |
| `frontend/index.html` | Single-page app, professional dark theme, responsive. Register · Batch register · Verify · **Public registry** tabs, forensics panel, certificate view with QR code, creator view, printable layout, PWA manifest + service-worker registration, EN/UR language switcher. |
| `frontend/app.js` | App logic: WebCrypto SHA-256, canvas dHash (images + **video frame sampling**), metadata forensics, batch flow, exact-then-near-duplicate verification, C2PA sidecar validation, watermark extraction, AI-origin score, tamper-diff heatmap + video frame diff, copy reporting, evidence PDF (print-to-PDF), explorer + creator pages, local record store, routes `#/cert/<sha256>`, `#/creator/<meId>`, `#/verify/<sha256>`. |
| `frontend/lib.js` | Dependency-free shared library: dHash + Hamming distance, **video fingerprint aggregation** (consensus hash, mean-min frame distance, frame coverage), **ME ID validation**, **sync SHA-256 + stable JSON**, **C2PA manifest build/validate**, **AI-origin score**, **LSB watermark** embed/extract, **thumbnail diff**, EXIF/metadata forensics parser (JPEG EXIF/XMP/JUMBF-C2PA, PNG text/eXIf), dependency-free QR encoder (byte mode, versions 1–10, all 8 masks, auto mask selection by penalty), helpers. Used by the app in the browser and by `tests/` in Node. |
| `frontend/api.js` | Public JS API (`OriginProofApi`): `hashFile`, `buildManifest`, `validateManifest`, `manifestHash`, `aiScore`, `isValidMeId`, `phashDistance`, `phashSimilarity` + a documented REST-style spec (`REST_SPEC`). Import in a browser or `require` in Node. |
| `frontend/i18n.js` | UI strings externalised — English (default) + Urdu scaffold, language switcher, `data-i18n` wiring. |
| `frontend/manifest.json` + `sw.js` + `icon.svg` | PWA: installable, offline hashing (local files cached; RPC/CDN still need network). |
| `frontend/config.js` | Network + contract address config — **ME Network testnet values filled in** (chain ID 400, RPC `http://118.175.0.249:8545`, explorer `https://www.explorer-testnet.me/`, faucet `https://www.mec.me/en-US/faucet`). Contract address still a placeholder until deploy. |
| `extension/` | Browser extension scaffold (Manifest V3): right-click any image → hash locally → open the verify page; popup for pasted hashes. Install instructions in `extension/README.md`. |
| `docs/submission/submission.md` | Ready-to-paste submission: description, problem, solution, architecture, ME integration, judging-criteria mapping, comparison table, roadmap. |
| `docs/demo-video-script.md` | 3–5 min English demo video script + recording checklist (record after deploy). |
| `docs/demo-records.md` | 3 sample files a judge can verify in one click (original / edited copy / unrelated). |
| `docs/security.md` | What the contract does/does not trust, re-entrancy/overflow notes, known limits. |
| `docs/benchmarks.md` | Measured fingerprinting times + gas estimates (solc + manual storage-slot counting), labelled as estimates until deploy. |
| `deploy-guide.md` | Step-by-step Remix deployment (no local setup needed). |
| `benchmark.js` | Re-runnable benchmark: `node benchmark.js` regenerates `docs/benchmarks.md`. |
| `tests/` | `test-lib.js` (111 checks), `test-contract.js` (29 checks), `test-extension.js` (19 checks), `test-i18n-api.js` (38 checks). Run all: `npm test`. QR output is also decoded by OpenCV (`tests/test-qr-decode.py`). |

## Features (v0.3)

- **Video fingerprinting:** up to 8 evenly spaced frames are sampled
  (`<video>` + canvas), each dHash'd, then aggregated into a consensus
  hash + per-frame hashes. A re-uploaded or lightly edited video is
  detected as COPY / NEAR-DUPLICATE / ALTERED like an image, with a
  per-frame diff listing which sampled frames changed most. Progress is
  shown while sampling; large videos are capped at 8 frames.
- **ME ID linking:** optional `me1…` field at registration, stored
  on-chain with the record (contract v3). Certificates and verification
  results show "✓ Verified owner" with the linked ME ID (truncated
  `me1tlx9…3xqf`, full address on click), and each ME ID gets a public
  creator page listing its registered works. The app never asks for,
  stores or logs private keys, seeds or passwords.
- **C2PA Content Credentials (aligned):** each registration builds a
  manifest with `c2pa.hash`, `c2pa.actions` and a custom
  `org.originproof.me-network` assertion (contract, tx hash, ME ID),
  downloadable as `<name>.c2pa.json`. Its SHA-256 can be anchored
  on-chain via `attachManifest`. Verification reads an attached sidecar,
  validates the hash assertion against the file, and shows issuer,
  actions and ME Network proof. See the honest C2PA section below.
- **Public registry / explorer:** a public page listing recent
  registrations with dashboard stats (registrations, verifications,
  copies flagged, creators, reports — computed from real records only,
  honest zeros pre-deploy). Anyone verifies a file **without a wallet**:
  upload → hash → lookup → result.
- **Evidence PDF:** one-click downloadable evidence certificate —
  file hash, dHash, ME ID, timestamps, contract address, tx hash,
  explorer link, QR code — generated client-side via print-to-PDF (no
  server, no dependency).
- **Tamper diff:** for ALTERED / NEAR-DUPLICATE results, images get a
  side-by-side pixel-difference heatmap (16×12 thumbnail comparison)
  plus similarity %; videos get the list of most-changed sampled frames.
- **AI-origin score:** the forensics panel shows a 0–100
  "likely AI-generated" score with the reasons listed, built from the
  metadata signals already present (AI-generator tags, editing software,
  missing camera EXIF, GPS, C2PA). Labelled in the UI as a **heuristic,
  not a certified detector**.
- **Invisible watermark:** optional at registration — the record's
  fingerprint is embedded in the image's least-significant bits (PNG)
  and a watermarked copy is downloadable; verification extracts it and
  links it to the record (or reports a mismatch).
- **Copy reporting:** paste a URL where a suspected copy was seen; the
  report is stored with the record locally and, with a wallet connected,
  as an on-chain count via `reportCopy` (+ `CopyReported` event).
- **Creator profiles:** a public page per ME ID (`#/creator/<meId>`)
  showing that creator's registered works with verification badges.
- **API:** `frontend/api.js` — `hashFile`, `buildManifest`,
  `validateManifest`, `manifestHash`, `aiScore`, `isValidMeId`,
  `phashDistance`, `phashSimilarity`, plus a REST-style endpoint spec
  (`POST /api/v1/register`, `GET /api/v1/verify/:sha256`,
  `GET /api/v1/near-duplicates`, `GET /api/v1/creator/:meId`,
  `GET /api/v1/registry/stats`).
- **Browser extension scaffold:** Manifest V3, right-click any image →
  verify against OriginProof (hash computed locally in the extension).
- **PWA:** installable manifest + service worker; hashing works offline
  (the file never leaves the device — stated in the UI).
- **i18n scaffold:** English (default) + Urdu strings, language
  switcher in the header.
- **Perceptual hash (dHash):** 9×8 grayscale downscale, neighbour
  comparison, 64 bits. Hamming distance → similarity %. Bands:
  identical (0 bits), near-duplicate (1–10), altered (11–16),
  different (17+).
- **Near-duplicate search:** `findByPhash` runs entirely on-chain as a
  view call (no gas) and returns registered hashes within a distance of
  16 bits; the app verifies each and shows the closest match.
- **Metadata forensics:** reads camera make/model, software, dates,
  copyright and user comment from JPEG EXIF and PNG chunks, and flags
  AI-generator markers (Stable Diffusion, Midjourney, DALL-E, Firefly,
  Imagen, SynthID, …) and C2PA/JUMBF manifests. The UI says plainly
  these are **metadata signals, not proof**.
- **Certificates:** every registration gets a shareable certificate page
  (`#/cert/<sha256>`) with registration time, uploader, ME ID, block, tx
  link, a QR code, a copy-link button and a clean printable layout.
- **Batch registration:** up to 10 files in one transaction, with
  per-file progress and a summary (how many were first registrations
  vs copies).
- **Result states:** ORIGINAL · COPY (already registered) ·
  NEAR-DUPLICATE xx% · ALTERED xx% · NOT FOUND — each with a
  plain-language explanation.

## C2PA: what is aligned, what is simplified — read this before judging

OriginProof's manifest is **C2PA-aligned, not C2PA-certified**, and the
app says so in the UI and in `docs/security.md`:

- **Aligned:** the manifest uses the real C2PA assertion labels
  (`c2pa.hash` with `alg: "sha256"`, `c2pa.actions` with
  `c2pa.created` / `c2pa.published`, `stds.schema-org.CreativeWork`) and
  the same claim-generator pattern (`OriginProof/0.3`); the manifest's
  SHA-256 is anchored on-chain, so a tampered sidecar is detectable.
- **Simplified:** the manifest is a **sidecar JSON file**, not a signed
  JUMBF box embedded in the image; there is **no cryptographic
  signature and no certificate chain** (no trust list, no CA). Anyone
  can generate a manifest claiming anything — the on-chain anchor only
  proves *this* manifest was attached to *this* record by its uploader.
- **What would make it certifiable:** embed the manifest as a signed
  JUMBF box (c2pa library / proper SDK), sign with a certificate from
  the C2PA trust list, and verify signatures on the verify path. That is
  item 2 on the submission roadmap.

## ME Network configuration (filled in, 21 Nov 2026)

From the official ME docs — `frontend/config.js` now has:

- `chainIdDecimal: 400`, `chainIdHex: "0x190"`
- `rpcUrl: "http://118.175.0.249:8545"` (plain HTTP — use Remix/local;
  endpoint not live-verified)
- `blockExplorerUrl: "https://www.explorer-testnet.me/"`
- `faucetUrl: "https://www.mec.me/en-US/faucet"` (1 claim/address/day,
  2 MEC)
- `contractAddress: ""` — **fill after deploy** (Remix shows it)

## Quick start (deploy via Remix — no install)

See `deploy-guide.md`. In short: claim testnet MEC from the faucet →
open remix.ethereum.org → paste `contracts/OriginProof.sol` → compile
(0.8.28) → Deploy with Injected Provider on ME Network testnet (chain ID
400) → copy the contract address into `frontend/config.js` → host the
frontend (GitHub Pages — steps below) or serve locally over http
(`python3 -m http.server` in `frontend/`, because WebCrypto needs a
secure context) → open `index.html`.

## Hosting the frontend (GitHub Pages — no build step)

The frontend is a pure static site: relative paths only, no build step,
no server. To host it:

1. Create a free GitHub account (the user does this — Muse must not
   create accounts).
2. Create a repository (e.g. `originproof`), upload the `frontend/`
   folder contents to its root (or to `docs/`).
3. Settings → Pages → Source: Deploy from a branch → branch `main`,
   folder `/` (or `/docs`) → Save.
4. The site is live at `https://<username>.github.io/originproof/` —
   paste that URL into the submission as the live demo link and into
   `extension/background.js` (`ORIGINPROOF_URL`).
5. Put the deployed contract address in `frontend/config.js` and push —
   Pages redeploys automatically.

## Local checks (no deployment needed)

```bash
cd originproof
npm install solc        # Solidity compiler (JS)
npm test                # 197 checks: lib (111) + contract (29) + extension (19) + i18n/api (38)
node compile.js         # writes build/OriginProof.json (ABI + bytecode + gas estimates)
node benchmark.js       # regenerates docs/benchmarks.md (timing + gas)
~/.streamclips/venv/bin/python tests/test-qr-decode.py  # OpenCV decodes our QR
```

Compile check (23 Nov 2026): solc 0.8.28, 17 ABI entries, 12,801
bytecode bytes. Deployment creation cost (solc): 2,557,361 gas total.
Measured locally: SHA-256 of a 5 MB image ≈ 41 ms; of a 50 MB video ≈
520 ms; dHash per frame < 1 ms. See `docs/benchmarks.md` — all figures
labelled as estimates until the first live receipts.

## Honest limits

- Perceptual hash works on images and sampled video frames. It is a
  similarity signal, not a legal proof of ownership — heavy edits,
  mirroring or large crops can push a copy past the 16-bit match band.
- The AI-origin score is a metadata heuristic, not a certified detector.
- The C2PA manifest is a sidecar JSON, not a signed JUMBF box — see the
  C2PA section above.
- The invisible watermark survives re-saving but not aggressive
  recompression or cropping.
- ME ID ownership is format-checked on-chain, not cryptographically
  proven — anyone can put any well-formed ME ID in the field (see
  `docs/security.md`).
- Metadata forensics only reads what is *in the file*. Metadata can be
  stripped or forged, so an AI-generator flag is a signal, not proof the
  image was AI-generated, and a clean result does not prove it was not.
- A SHA-256 match proves the file is byte-identical to the registered
  one; a near-duplicate match proves visual similarity, not that the copy
  came from the original.
- Registration is first-come-first-served: whoever registers first holds
  the origin claim. OriginProof does not check that the uploader actually
  owns the media.
- `findByPhash` scans all registered hashes on-chain; it is a view call
  (no gas) but returns at most 50 matches. On a very large registry it
  would need paging — not built yet.

## Status / next steps

- [x] Contract v3 written + compiles (23 Nov 2026) — ME ID, C2PA
  anchoring, copy reports, record enumeration
- [x] Frontend v0.3 — video fingerprinting, ME ID, C2PA, public
  registry, evidence PDF, tamper diff, AI score, watermark, copy
  reports, creator pages, API, extension scaffold, PWA, i18n
- [x] Tests: 197 checks passing (`npm test`)
- [x] Submission package, demo video script, security notes, demo
  records, benchmarks — all in `docs/`
- [x] Team: Mani Team, both members' advanced ME ID verifications
  approved; registration fixed 23 Nov 2026
- [x] `config.js` filled from official ME docs (chain ID 400, RPC,
  explorer, faucet)
- [ ] **Faucet claim** — 24h wait until ~12:15 PM PKT Tue 24 Nov 2026
  (too many code requests); retry then, claim 2 MEC for deploy gas
- [ ] Deploy to ME testnet (Remix), record contract address + first tx
  hashes, fill `config.js`
- [ ] Host the frontend on GitHub Pages (needs the user's GitHub
  account — see hosting steps above)
- [ ] End-to-end test with real photos/videos (original → ORIGINAL,
  edited copy → NEAR-DUPLICATE, unrelated → NOT FOUND)
- [ ] Demo video (3–5 min, English — script in
  `docs/demo-video-script.md`) + submission before 21 Dec 8:59 PM PKT

## Registration form answers

Project name `OriginProof` (form field reads "Mani Mera Project" —
OriginProof is named in the overview text), track `AI and trust
infrastructure`, overview text — all prepared, see
`../originproof-plan.md` and `docs/submission/submission.md`. Still only
the user can answer: "On which platform did you first see this event?"
(Meta Earth website / ME Pass / X / Telegram / Discord / Other).
