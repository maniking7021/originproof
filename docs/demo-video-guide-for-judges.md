# OriginProof — Demo Video: Guide for Judges

**Video:** OriginProof demo (4 min 54 sec, English narration with burned-in English subtitles)
**Team:** Mani Team — Muhammad Zaman (captain) + Sohail Abbas
**Track:** AI & Trust Infrastructure
**Live demo:** https://maniking7021.github.io/originproof/
**Code:** https://github.com/maniking7021/originproof
**Contract (ME Network, chain ID 400):** `0xbc6a84934ED39AB96259022Ac80d18C4b3d143cc`
(Deployed 25 Nov 2026, tx `0xe162495961fc364b1f2ac00348cb3738201b5b6d38e26376c6b8cacd04f07706`, block 5502685)

> **About the narration:** the presenter speaks English with a strong accent.
> The burned-in subtitles carry the exact intended wording, and this guide
> explains step by step what is happening on screen, so nothing is lost.

---

## What the video shows (timestamps are the final video)

### 0:00 – 0:15 — The problem
A viral photo is copied, edited and re-posted as if it were original.
Creators lose credit, newsrooms cannot tell what is real, and AI can now
fake any image in seconds. The question: who published this first, and how
do we prove it?

### 0:15 – 0:45 — The answer: OriginProof
Upload a photo or video and OriginProof computes its fingerprint — a
SHA-256 hash and a perceptual hash — inside the browser. The file never
leaves the device. Only the fingerprint goes on ME Network, together with
who registered it and when. After that, anyone in the world can verify it
— no wallet, no account.

### 0:45 – 1:37 — Register (live demo)
The presenter opens the live app in Chrome, uploads a photo
(`Related.jpeg`), gives it a title, pastes his verified MetaEarth ID
(`me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf`) so the record shows a real,
KYC-verified owner, ticks the invisible-watermark box, and clicks
**Register on ME Network**. The registration transaction is sent.

### 1:37 – 1:57 — Wallet confirmation (live)
MetaMask opens for the transaction. It shows its standard warning for a
new, unlisted site; the presenter reviews it, acknowledges it and
confirms. The transaction is then confirmed on ME Network. (This is a
genuine part of the demo — the warning appears because the demo site is
new, not because anything is wrong with it.)

### 1:57 – 2:31 — The certificate
The app returns a shareable certificate with a QR code and a downloadable
evidence PDF. The certificate shown in the video is a **real on-chain
record** from this recording session:
- **Title:** Test Image 1
- **SHA-256:** `0xa4d2c13c7508ea4461e0cb06c5580930200b12c82536c318e3d1e9ce1a740d40`
- **Uploader:** `0x43EEf80BB4Ac4D5157863E666fF49e822B1ec7b9`
- **Verified owner:** ME ID `me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf`
- **Registered:** Sat, 28 Nov 2026 09:58:38 GMT — **Block 5560457**
- **Perceptual hash:** `c0d8d8989c9c9e9a`

### 2:31 – 2:58 — Verify: the original file
The same photo is uploaded in the Verify tab. Result: **COPY — already
registered** — the file was registered minutes earlier in this same demo,
so the registry correctly reports it as already registered, and shows the
verified owner. (A first-time verification of a fresh registration shows
ORIGINAL; the registry was verified end-to-end returning ORIGINAL on
26 Nov 2026.)

### 2:58 – 3:27 — Verify: an unrelated photo
A completely different photo is uploaded. Result: **NOT FOUND** — it is
not on the system. The person who registers a file first is the one whose
record stands as evidence of origin.

### 3:27 – 3:47 — Verify: the edited copy
The same photo, cropped and re-saved, is uploaded. Its SHA-256 is now
completely different — a plain hash registry would say "not found". The
perceptual hash catches it: **NEAR-DUPLICATE — 77% similar**. This is the
feature that beats plain hash registries: edited copies are still linked
to the original registration.

### 3:47 – 4:08 — How it works
Upload → fingerprint → ME Network → verify. The fingerprint goes on-chain
and becomes secure; anyone can verify it at any time.

### 4:08 – 4:39 — Architecture in 30 seconds
A Solidity registry on ME Network (chain ID 400) stores fingerprints,
perceptual hashes, ME IDs and C2PA manifest hashes. The front-end is a
pure static site: no server, no database, no build step. All sensitive
work happens in the browser, and private keys never touch the app.

### 4:39 – 4:54 — Close
The certificate and verified owner are shown once more: OriginProof lets
anyone verify any image on the internet. "OriginProof — prove where media
came from."

---

## The six layers (why this combination is new)
1. **SHA-256 fingerprint** — exact-match identity.
2. **Perceptual hash (dHash)** — near-duplicate detection for images **and video** (sampled frames, consensus hash).
3. **ME ID linking** — the uploader's verified MetaEarth identity stored on-chain.
4. **C2PA Content Credentials** — a C2PA-aligned manifest per registration, hash anchored on-chain.
5. **Invisible watermark** — LSB steganography, verifiable back to the record.
6. **Public verification without a wallet** — registry explorer, creator pages, evidence PDFs, browser extension.

No other tool combines all six on one network.
