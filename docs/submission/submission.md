# OriginProof — HARBOR Submission Package

> Ready-to-paste text for the MetaEarth HARBOR submission form
> (track: **AI & Trust Infrastructure**). Deployed + live 25 Nov 2026 —
> only the demo video link `[VIDEO_URL]` is still open (record after the
> end-to-end test; script in `docs/demo-video-script.md`).

---

## 1. Project description (short — paste as the one-line summary)

**OriginProof** proves where a photo or video came from. Upload media —
its SHA-256 fingerprint and perceptual hash are computed in your browser
(the file never leaves your device) and registered on ME Network with the
uploader's verified ME ID. Anyone can then verify a file — exact match,
near-duplicate, or not found — without a wallet, and every registration
gets a shareable certificate with a QR code, a C2PA Content Credentials
manifest, an invisible watermark and a downloadable evidence PDF.

## 2. Problem statement

1. **Copies steal credit.** A creator's photo is reposted within minutes,
   cropped and recompressed; the reposter gets the reach, the creator gets
   nothing — and there is no public record of who published first.
2. **AI fakes are indistinguishable.** Anyone can generate a convincing
   image in seconds. Newsrooms, courts and marketplaces cannot tell real
   from synthetic, and metadata is stripped by every social platform.
3. **Existing provenance is centralised or partial.** Content Credentials
   depend on big vendors adopting them; watermarking alone is invisible
   to verifiers; hash registries prove "this exact file" but miss the
   edited copies that actually spread.
4. **Verification needs accounts and wallets.** Ordinary people — a
   journalist checking a photo, a buyer checking a listing — will not
   connect a wallet to check one image.

## 3. Solution

OriginProof is a **public, no-wallet media provenance registry on ME
Network**, with six layers that only work together here:

| Layer | What it does |
|---|---|
| **SHA-256 fingerprint** | Exact-match identity. Byte-identical file → ORIGINAL or COPY. |
| **Perceptual hash (dHash)** | Near-duplicate detection for images **and video** (sampled frames, consensus hash). Edited copies are caught with a similarity %. |
| **ME ID linking** | The uploader's verified MetaEarth identity is stored with the record, so the certificate shows a KYC-verified human owner, not just a wallet address. |
| **C2PA Content Credentials** | A C2PA-aligned manifest (`c2pa.hash`, `c2pa.actions`, `org.originproof.me-network`) is generated per registration; its hash is anchored on-chain. |
| **Invisible watermark** | LSB steganography embeds the record's fingerprint in a PNG copy; verification reads it back and links it to the record. |
| **Public verification** | Registry explorer, creator pages, evidence PDFs and a browser extension — anyone verifies without a wallet. |

The file itself is **never uploaded and never stored on-chain** — only
hashes, a title and the owner's identity. Hashing runs in the browser.

## 4. Architecture overview

```
Browser (pure static site — no build step, no server)
  ├─ SHA-256 (WebCrypto) + dHash (canvas) + video frame sampling
  ├─ EXIF / XMP / C2PA metadata forensics + AI-origin heuristic score
  ├─ C2PA manifest build/validate + LSB watermark embed/extract
  └─ ethers v6 (CDN) → ME Network JSON-RPC
        └─ OriginProof.sol (v3) — register / registerBatch / verify /
            findByPhash / attachManifest / reportCopy / hashAt
              └─ ME Network testnet (chain ID 400)
                    └─ Explorer: https://www.explorer-testnet.me/
```

- **Frontend:** `frontend/` — `index.html`, `app.js`, `lib.js` (pure
  functions, fully unit-tested), `api.js` (public JS API + REST spec),
  `i18n.js` (en + ur), `manifest.json` + `sw.js` (installable PWA,
  offline hashing), `config.js` (network + contract address).
- **Contract:** `contracts/OriginProof.sol` (Solidity 0.8.28) — first
  registration wins; re-registration counts copies; v2 wrappers kept
  for compatibility; `VERSION = "3"`.
- **Tests:** 140+ assertions across `tests/test-lib.js` (pure functions)
  and `tests/test-contract.js` (compile + ABI + invariants), plus an
  extension manifest test. Run: `npm test`.
- **Extension:** `extension/` — Manifest V3 scaffold: right-click any
  image → hash locally → open the verify page.
- **Docs:** `docs/demo-video-script.md`, `docs/security.md`,
  `docs/demo-records.md`, and this submission package.

## 5. ME Network integration

- **Network:** ME Network testnet — **chain ID 400**, RPC
  `http://118.175.0.249:8545`, explorer
  `https://www.explorer-testnet.me/`, faucet
  `https://www.mec.me/en-US/faucet` (2 MEC per claim, 1 per address/day).
- **Contract:** `OriginProof.sol` v3, deployed at `[CONTRACT_ADDRESS]`.
  Deploy: Remix IDE → compile with Solidity 0.8.28 → inject MetaMask →
  ME Network (chain ID 400) → deploy → paste the address into
  `frontend/config.js`. Full steps in `deploy-guide.md`.
- **ME ID:** the uploader's verified MetaEarth identity (`me1…` bech32
  address) is an optional field on `register` / `registerBatch`, stored
  on-chain in the record and shown on certificates and creator pages as
  "Verified owner". It is a public address — never a private key; the
  app never asks for, stores or logs keys, seeds or passwords.
- **Faucet / deploy flow:** claim testnet MEC from the faucet (needs
  wallet address + emailed code) → fund the deployer wallet → deploy in
  Remix → verify the contract on the explorer → set the address in
  `config.js` → the public registry reads live on-chain data.
- **On-chain reads used by the public portal:** `verify` (exact match),
  `findByPhash` (near-duplicates), `hashAt` + `totalRecords` (explorer
  enumeration), `reportCount` (copy reports), `attachManifest` (C2PA
  anchoring). All reads are view calls — no gas, no wallet.

## 6. Judging-criteria mapping

| Criterion (weight) | How OriginProof answers it |
|---|---|
| **Technical implementation — 30** | Working Solidity registry (v3, 17 ABI entries, 12,801 bytecode bytes) + a pure-static frontend with zero build step; 140+ passing tests (pure-function unit tests, contract compile + ABI + invariant tests, extension manifest test); video fingerprinting via multi-frame consensus dHash; C2PA manifest build/validate with on-chain hash anchoring; LSB watermarking; QR certificates; evidence PDFs. All of it runs client-side with no server. |
| **ME Network integration depth — 25** | The contract is the source of truth, not a bolt-on: registration, verification, near-duplicate search, C2PA anchoring, copy reports and registry enumeration are all on-chain calls on ME Network (chain ID 400). ME ID — MetaEarth's own verified identity — is a first-class record field, shown as "Verified owner" on certificates and creator pages. Deploy uses the official faucet + Remix flow documented step-by-step in `deploy-guide.md`. |
| **Product value — 20** | Solves a real, daily problem for creators, journalists and marketplaces: "who published this first?" A journalist verifies a photo in one upload with no wallet; a creator registers work before posting and gets a certificate, a C2PA manifest and an evidence PDF; a buyer checks a listing image in one right-click. The public registry makes verification free for everyone, including people who will never own crypto. |
| **Innovation — 15** | The combination is the moat (see comparison table): ME ID verified ownership + C2PA + video fingerprinting + invisible watermark + public no-wallet verification + evidence PDF in one tool. No existing product combines all six. Video fingerprinting (consensus dHash over sampled frames) and the on-chain-anchored C2PA manifest are new in this space. |
| **UX — 10** | One-page app, three tabs (Register / Batch / Verify) plus a public registry; every result is a plain-language verdict (ORIGINAL / COPY / NEAR-DUPLICATE / ALTERED / NOT FOUND) with a similarity % and a tamper-diff heatmap showing *what* changed; installable PWA that works offline for hashing; English + Urdu UI; "your file never leaves your device" stated everywhere it matters. |

## 7. Comparison — OriginProof vs existing provenance tools

| Capability | **OriginProof** | Adobe Content Credentials | Truepic | Numbers Protocol |
|---|---|---|---|---|
| SHA-256 exact-match registry | ✅ on-chain | ❌ (manifest only) | ❌ | ✅ |
| Near-duplicate / perceptual-hash detection | ✅ images + **video** | ❌ | ❌ | partial |
| Video fingerprinting | ✅ multi-frame consensus | ❌ | ❌ | ❌ |
| ME ID verified-owner linking | ✅ on-chain | ❌ | ❌ | ❌ |
| C2PA-aligned manifest | ✅ + on-chain hash anchor | ✅ (native) | ✅ | ✅ |
| Invisible watermark (LSB) | ✅ + verify-back | ❌ | ✅ | ✅ |
| Public verification **without a wallet** | ✅ | partial | ❌ | partial |
| Creator pages per verified identity | ✅ | ❌ | ❌ | ✅ |
| Evidence certificate (PDF + QR) | ✅ | ❌ | ✅ | ❌ |
| Copy reporting (on-chain count) | ✅ | ❌ | ❌ | ❌ |
| Browser extension (right-click verify) | ✅ scaffold | ❌ | ❌ | ❌ |
| Open source, no vendor lock-in | ✅ | ❌ | ❌ | partial |
| Works fully offline for hashing (PWA) | ✅ | ❌ | ❌ | ❌ |

**Reading the table honestly:** Adobe's implementation is the reference
C2PA implementation and is more complete on signing (see README for what
OriginProof simplifies). Truepic and Numbers Protocol are real, shipped
products. OriginProof's claim is not that any single feature is better —
it is that **no other tool combines all of them**, and that the
combination is anchored on MetaEarth's own verified identity (ME ID),
which no competitor has.

## 8. Future roadmap

1. **Post-deploy (this week):** deploy v3 on ME Network testnet, host
   the frontend on GitHub Pages, record the 3–5 min demo video, run the
   sample verification set in `docs/demo-records.md` on camera.
2. **Signed C2PA (JUMBF):** embed manifests as signed JUMBF boxes inside
   JPEG/PNG files using a proper C2PA SDK, with a real certificate chain
   — moving from "C2PA-aligned" to certifiable Content Credentials.
3. **Mainnet + ME ID verification badges:** on-chain check that a linked
   ME ID has passed advanced verification, shown as a badge on creator
   pages.
4. **Takedown-ready reports:** copy reports escalate to a public queue
   with evidence PDFs attached, so platforms can act on them.
5. **Mobile app (PWA → native wrapper):** camera capture registers at
   the moment of shooting, with GPS + timestamp in the manifest.
6. **AI-video detection:** extend the AI-origin heuristic to video
   (frame-consistency signals) and publish the scoring rubric.
7. **Creator monetisation:** optional "license this work" field on the
   record, with on-chain licensing terms.

## 9. Links (fill after deploy)

- Live demo: `https://maniking7021.github.io/originproof/`
- Contract on ME explorer: `https://www.explorer-testnet.me/` — contract `0xbc6a84934ED39AB96259022Ac80d18C4b3d143cc` (deployed 25 Nov 2026, tx `0xe162495961fc364b1f2ac00348cb3738201b5b6d38e26376c6b8cacd04f07706`, block 5502685)
- Code repository: `https://github.com/maniking7021/originproof`
- Demo video (3–5 min, English): `[VIDEO_URL]`
- Team: Mani Team — Muhammad Zaman (captain, ME ID verified) + Sohail Abbas (ME ID verified)
