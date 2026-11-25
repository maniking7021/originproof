# Deploy OriginProof to ME Network testnet — Remix guide (no install)

Muse never asks for private keys. The team deploys from its own wallet.

## 0. Pehle ye karo — wallet, verification, team (deploy se pehle zaroori)
Deploy tab hi kaam karega jab ye teeno ready hon. Order yahi rakho:

**0a. ME Pass app install karo (har member, apne phone par)**
1. Play Store / App Store se "ME Pass - Meta Earth Pass" install karo.
2. App kholo → "I don't have a Meta Earth Wallet" → wallet banao, Token Code (passcode) set karo.
3. Jo 12-word mnemonic phrase mile, use **kagaz par likh kar mehfooz jagah rakho** — kisi ko mat bhejo, screenshot bhi mat lo. Ye wallet ki chaabi hai.

**0b. ME ID verification (har member — iske baghair registration bhi invalid hai)**
1. ME Pass home screen par "Verify ME ID" tap karo → live face verification complete karo.
2. Phir **Advanced Verification** karo: government ID (CNIC/passport) submit karo, approval ka wait karo ("Waiting for approval" dikhe to theek hai — approval aane tak wait karo, dobara submit mat karo).
3. Verify hone ke baad tumhe **1 permanently staked MEC** milega — ye UBI hai, rozana thodi earning deta hai. Ye confirm karta hai ke verification complete hai.

**0c. Team final karo (2–5 members)**
- Captain (team leader) ek hoga — wahi Google form bharega aur prize usi ke ME ID-linked wallet par aayega.
- Har member ke paas ye details ready rakho (registration form ke members section ke liye): poora naam, email address, ME ID (ya wallet address). Sab ki advanced verification complete honi chahiye.

## 0d. Registration form — members section me kya bharna hai
Form ka wo hissa jo upar hota hai (team leader + members) — uska screenshot abhi nahi mila, lekin official rules se tay hai ke wahan ye manga jata hai:
- **Team leader:** poora naam, email, ME ID / wallet address, Google account (form usi se bhara jata hai).
- **Har member (2–5 total, leader samet):** poora naam, email, ME ID / wallet address.
- Bharte waqt: naam aur email bilkul wahi likho jo ME ID verification me use hue hon; kisi member ko do teams me mat likho; aur ek team sirf ek project submit kar sakti hai. Agar form me koi field samajh na aaye to uska screenshot bhej do — main exact bata dunga kya likhna hai.

## 1. Get test tokens + network details (official docs only)
1. Open https://www.mec.me/en-US/developer-center
2. Follow "Set Up Your Local Environment" and "Request Test Tokens".
3. **Already filled in `frontend/config.js` (21 Nov 2026, from official docs):**
   - Chain ID: **400** (`0x190`)
   - RPC: `http://118.175.0.249:8545` (plain HTTP — use Remix/local; endpoint not live-verified)
   - Explorer: `https://www.explorer-testnet.me/`
   - Faucet: `https://www.mec.me/en-US/faucet` (2 MEC per claim, 1 claim/address/day)
4. Add the ME testnet to MetaMask / ME Pass wallet with those exact values,
   then claim test MEC from the faucet.
5. Captain's deploy wallet (Muhammad Zaman, from the Harbor registration form):
   - bech32: `me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf`
   - EVM hex (same wallet, for MetaMask/Remix): `0x5fcc59451ca07a68df0ce1628a1f8f757b256969`
   - Faucet gives 2 MEC per claim, 1 claim/address/day. Check the balance on the
     testnet explorer first — if MEC is already there, no faucet claim is needed.
     Only the captain claims (he does the deploy); Sohail does not need to.
   - **Faucet status (24 Nov 2026 ~06:28 PKT): CLAIM SUCCEEDED — "Submitted successfully! We will transfer MEC to your account within 2 hours." 2 MEC arriving to the captain's wallet; check the balance on the explorer before deploying (~08:30 PKT).**

## 2. Compile in Remix
1. Open https://remix.ethereum.org
2. Create `OriginProof.sol`, paste in `contracts/OriginProof.sol`.
3. Solidity Compiler tab → compiler `0.8.28` → Compile.
4. Fix any error Remix reports; the contract has no dependencies, so it
   should compile cleanly. (Local check: `node compile.js` — solc 0.8.28,
   17 ABI entries, 12,801 bytecode bytes; deployment creation cost
   2,557,361 gas per solc estimate — see `docs/benchmarks.md`.)

## 3. Deploy — CONFIRMED ROUTE (research 24 Nov 2026, official docs; CORRECTED 07:15 PKT)
⚠️ METAMASK MOBILE BLOCKER (verified): MetaMask requires HTTPS RPC URLs and REJECTS the ME HTTP RPC (`http://118.175.0.249:8545`) — error "URIs require the appropriate HTTPS prefix". No official HTTPS RPC exists (checked web search + chainid.network — chain ID 400 in the public registry is "HyperonChain TestNet", not ME Network). ME's own JS SDK docs confirm the HTTP RPC is the ONLY testnet default AND warn that HTTPS browser pages cannot call it (mixed content) — so NO browser/wallet route works: not MetaMask, not Remix deploy, not ME Pass (ME Pass has no verified WalletConnect/dApp browser; it only hosts curated mini-programs).
⚠️ SDK PACKAGE GONE (found 07:15 PKT, verified on npm): `meta-earth-js-sdk` was UNPUBLISHED from npm on 12 Feb 2026 — `npm install meta-earth-js-sdk` returns 404. The docs still tell you to install it, but it does not exist. DO NOT use the SDK route.
✅ CONFIRMED ROUTE (plain ethers.js, ME's own Rollup-guide pattern): (0) Faucet funds the ME Pass address (2 MEC — DONE 24 Nov). (1) Compile is ALREADY DONE — ABI + bytecode are baked into `deploy-termux.js` (compiled here with solc 0.8.28, matches verified v0.3: 17 ABI entries, 12,801 bytes). No Remix-on-phone needed. (2) On the phone: install Termux from F-Droid → `pkg install nodejs-lts`. (3) In Termux: `mkdir me-deploy && cd me-deploy && npm init -y && npm install ethers@5`, copy `deploy-termux.js` there. (4) Edit ONLY the MNEMONIC line in the file (nano) with the 12 words — typed ONLY on the user's own phone, NEVER sent to Muse. (5) `node deploy-termux.js` — Node has no mixed-content block, so the HTTP RPC works. The script FIRST derives the address from the phrase on BOTH paths (118 and 60), compares to the funded wallet 0x5fcc...6969, and STOPS before deploying if neither matches (guard tested offline with a random phrase — stops correctly). Then it checks chain 400 + balance, estimates gas, deploys (no constructor args), waits for confirmation, prints contract address + tx hash, and saves them to `deploy-result.json`. (6) Verify contract + tx on https://www.explorer-testnet.me/; keep contract address + tx hash for the HARBOR submission "Run Records".
(Old Remix deploy steps removed — superseded by the ethers/Termux route above. Do NOT deploy from Remix.)
After deploy: paste the contract address into `frontend/config.js` as `contractAddress`.

## 4. Smoke test (proves the on-chain core works)
1. Serve the frontend over http — `cd frontend && python3 -m http.server`
   — then open `http://localhost:8000/index.html` in a browser.
   (WebCrypto needs a secure context; `file://` works in some browsers but
   http is reliable. The page will show "Network: not configured" until
   `config.js` is filled in.)
2. Connect wallet → pick a small photo → title it → **paste your ME ID**
   (`me1…`) → Register. Confirm the transaction, note the tx hash.
3. Re-upload the SAME file → Verify → must show **ORIGINAL** with your
   address, timestamp and "✓ Verified owner" + your ME ID.
4. **Near-duplicate check:** resize or re-compress that photo (any image
   editor, or `convert photo.jpg -resize 50% small.jpg`), then Verify the
   resized copy → must show **NEAR-DUPLICATE — ~90%+ similar** and point
   at the original registration, with the tamper-diff heatmap showing what
   changed. The SHA-256 differs, the perceptual hash is what catches it.
5. **Video check (v0.3):** register a short video, then verify a
   re-encoded copy → must show NEAR-DUPLICATE with the per-frame diff
   listing the most-changed sampled frames.
6. **C2PA check (v0.3):** after registering, download the C2PA manifest
   (`.c2pa.json`), then Verify the same file with the sidecar attached →
   must show "Manifest valid ✓" with the issuer and ME ID.
7. **Watermark check (v0.3):** register an image with the watermark box
   ticked, download the watermarked PNG, verify it → the panel must show
   "Watermark found — it matches this file".
8. **Batch check:** Batch register tab → pick 2–3 photos → Register all →
   one transaction, per-file summary (first registrations vs copies).
9. **Certificate + evidence check:** after any registration, open its
   certificate link (`#/cert/<sha256>`) → it must show the record and the
   ME ID, the QR code must scan to the same certificate page, and
   "Download evidence certificate (PDF)" must produce a PDF with the
   hash, ME ID, tx hash and explorer link.
10. **Public registry check (v0.3):** open the Public registry tab with
    NO wallet connected → the registrations above must be listed with
    dashboard stats; open a creator page (`#/creator/<meId>`) → it must
    list that ME ID's works.
11. Edit the file heavily, or pick an unrelated file → Verify → must show
    **NOT FOUND**.
12. Save the contract address + tx hashes: they are the "on-chain records"
    the submission form requires.

## 5. If Remix / deployment fails
- Wrong network in the wallet is the usual cause — check the chain ID matches
  the official docs exactly.
- No test tokens → use the faucet again (some faucets drip once per day).
- "Batch size 1..10" — `registerBatch` rejects empty batches and batches
  over 10 files; the UI already caps at 10.
- Verification reads need the RPC URL + contract address in `config.js`;
  without them the page says so instead of failing silently.
- Ask in the official MetaEarth Discord / devsupport@mec.me and keep the
  exact error message.

## 6. Contract v3 reference (for the demo / judges)

| Function | What it does |
|---|---|
| `register(bytes32 contentHash, bytes8 phash, string contentType, string title, string meId)` | Register one file's SHA-256 + dHash + optional ME ID. Returns `isFirst`. |
| `register(bytes32, bytes8, string, string)` | v2 wrapper — same, with an empty ME ID. |
| `registerBatch(bytes32[], bytes8[], string[], string[], string meId)` | Register up to 10 files in one tx. Returns per-file `firsts[]`. Never reverts on a duplicate — it is counted as a copy. |
| `registerBatch(bytes32[], bytes8[], string[], string[])` | v2 wrapper — same, with an empty ME ID. |
| `verify(bytes32)` | Returns the origin record (uploader, timestamp, block, type, title, registrations, perceptualHash, **meId**, **manifestHash**). Empty uploader = never registered. |
| `isRegistered(bytes32)` / `registrationCount(bytes32)` | Quick checks. |
| `totalRecords()` / `hashAt(uint256)` | Registry enumeration — the public explorer reads these. |
| `attachManifest(bytes32 contentHash, bytes32 manifestHash)` | Anchor a C2PA manifest hash. Only the original uploader, only once. |
| `reportCopy(bytes32 contentHash, string url)` | File a copy report (count + `CopyReported` event). Anyone may report. |
| `reportCount(bytes32)` | How many copy reports a hash has. |
| `findByPhash(bytes8 phash, uint8 maxDistance)` | View-only near-duplicate search; returns up to 50 matching hashes. No gas. |
| `ContentRegistered` event | Emitted on every registration, with `perceptualHash`, `isFirst` and `meId`. |
| `ManifestAttached` / `CopyReported` events | Emitted by `attachManifest` / `reportCopy`. |
