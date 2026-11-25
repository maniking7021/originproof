# OriginProof — Demo Video Script (3–5 minutes, English)

> **Do NOT record yet.** This script is written for the deployed app: it
> needs the contract live on ME Network (faucet MEC → Remix deploy) and the
> frontend hosted (GitHub Pages). Record after deploy, using the sample
> records in `docs/demo-records.md`. Narration is written to be read aloud
> as-is; timings are approximate. Target length: 4 minutes.

## 0:00–0:20 — The problem (hook)

**On screen:** A viral photo, then the same photo edited and re-posted by
three different accounts. A news headline about AI-generated fakes.

**Voiceover:**
> "Every day, millions of photos and videos are copied, edited, and
> re-posted as if they were original. Creators lose credit. Newsrooms
> can't tell what's real. And AI can now fake any image in seconds.
> The question is simple — who published this first, and how do we prove it?"

## 0:20–0:50 — The answer

**On screen:** OriginProof home page. The logo, the tagline: "Prove where
media came from."

**Voiceover:**
> "OriginProof answers that question on-chain. Upload a photo or video,
> and we compute its fingerprint — a SHA-256 hash and a perceptual hash —
> in your browser. The file never leaves your device. Only the fingerprint
> goes on ME Network, together with who registered it and when. From that
> moment, anyone in the world can verify it — no wallet, no account."

## 0:50–1:40 — Register (live demo)

**On screen:** Register tab. Upload `press-photo.jpg`. The metadata panel
appears. Type a title. Paste an ME ID (`me1…`). Tick the invisible
watermark box. Click Register, confirm the wallet transaction.

**Voiceover:**
> "Here's a press photo. I upload it — the hash is computed locally.
> I add a title, and link my verified MetaEarth ID, so the record shows
> a real, KYC-verified owner, not just a wallet address. I also add an
> invisible watermark, hidden inside the image itself. One transaction —
> and the photo is registered. The app builds a C2PA Content Credentials
> manifest and gives me a shareable certificate with a QR code."

**On screen:** Certificate page, QR code, evidence PDF download.

## 1:40–2:40 — Verify: original, copy, edited (live demo)

**On screen:** Verify tab. Upload the same photo → **ORIGINAL ✓**.
Upload the edited copy (cropped, recompressed) → **NEAR-DUPLICATE —
94% similar**, with the tamper-diff heatmap showing exactly what changed.
Upload an unrelated photo → **NOT FOUND**.

**Voiceover:**
> "Now the test. The original file verifies instantly. This edited copy —
> cropped and recompressed — has a different fingerprint, but the
> perceptual hash catches it: ninety-four percent similar, and the heatmap
> shows exactly which pixels changed. And an unrelated photo? Not found.
> That's the point: exact matches, near-duplicates, and fakes are three
> different answers, and OriginProof gives you all three."

## 2:40–3:20 — The unique combination

**On screen:** Quick montage — public registry page (no wallet), creator
profile page, C2PA manifest JSON, AI-origin score panel, copy-report form,
browser extension right-click menu.

**Voiceover:**
> "What makes OriginProof different is the combination. Verified ME ID
> ownership. C2PA Content Credentials. Video fingerprinting, frame by
> frame. An invisible watermark. A public registry anyone can check
> without a wallet. Evidence certificates you can download as PDF. And a
> browser extension that verifies any image on the web in one click.
> No other tool puts all of that together on one network."

## 3:20–3:50 — Architecture in 30 seconds

**On screen:** Simple diagram — browser → SHA-256/dHash (client-side) →
ME Network smart contract (chain ID 400) → explorer link.

**Voiceover:**
> "Under the hood it's deliberately simple. A Solidity registry on ME
> Network — chain ID 400 — stores fingerprints, perceptual hashes, ME
> IDs and C2PA manifest hashes. The frontend is a pure static site: no
> server, no database, no build step. Everything sensitive happens in
> your browser, and your private keys never touch the app."

## 3:50–4:00 — Close

**On screen:** OriginProof logo + "Prove where media came from" +
GitHub Pages link + certificate QR.

**Voiceover:**
> "OriginProof — prove where media came from. Try it yourself: upload
> any photo and see what it says."

---

## Recording checklist

- [ ] Contract deployed on ME Network testnet (chain ID 400); address in `frontend/config.js`
- [ ] Frontend hosted (GitHub Pages) — record against the live URL
- [ ] Sample files from `docs/demo-records.md` ready (original, edited copy, unrelated)
- [ ] Wallet funded with testnet MEC (faucet) for the register transaction
- [ ] Screen recorder at 1080p, browser zoom 100%, dark UI as-is
- [ ] Voiceover: read the script above, one take per section, clean audio
- [ ] Export 1080p, 3–5 minutes, English, upload as the submission demo video
