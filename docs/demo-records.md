# OriginProof — Sample Demo Records

Three sample files a judge can verify in one click, to show the three
different answers OriginProof gives. **These are local-demo records
until the contract is deployed** — no on-chain data is fabricated here.
After deploy, register them in order (1 → 2 → 3) from the live app and
the expected results below become real.

## How to make the samples (2 minutes)

Any three images work; the examples below use a press-style photo so the
story is concrete. Use your own photos — do not use anyone else's
copyrighted work.

| # | File | How to make it | Expected result |
|---|---|---|---|
| 1 | `press-photo.jpg` | Any original photo you took (e.g. a street scene, a product shot). | **ORIGINAL ✓** — first registration, certificate issued |
| 2 | `press-photo-edited.jpg` | Open #1, crop ~10% off one side, re-save as JPEG quality 80, maybe add a small caption. | **NEAR-DUPLICATE — ~90–97% similar** — SHA-256 differs, dHash matches, tamper-diff heatmap shows the cropped edge |
| 3 | `unrelated.jpg` | A completely different photo (different subject, different day). | **NOT FOUND** — never registered, no near-duplicate |

## The one-click demo flow (after deploy)

1. **Register #1** — Register tab → upload `press-photo.jpg` → title
   "Press photo — street scene" → ME ID `me1…` → tick invisible
   watermark → Register → confirm in wallet → certificate page opens.
   Download the C2PA manifest (`.c2pa.json`) and the evidence PDF.
2. **Verify #1 again** — Verify tab → upload the same file → **ORIGINAL ✓**.
   Attach the `.c2pa.json` sidecar → "Manifest valid ✓".
3. **Verify #2** — upload the edited copy → **NEAR-DUPLICATE — ~94%
   similar** → tamper-diff heatmap shows the changed edge → AI-origin
   score shown in the panel.
4. **Verify #3** — upload the unrelated photo → **NOT FOUND**.
5. **Public check** — open the Public registry tab (no wallet) → the
   press photo is listed → open its certificate → download the evidence
   PDF → scan the QR code with a phone → the certificate opens.

## What each result proves

- **ORIGINAL** proves the file is byte-identical to the registered one.
- **NEAR-DUPLICATE** proves visual similarity (similarity %) and shows
  *what* changed (heatmap / frame list) — it does not prove the copy
  came from the original.
- **NOT FOUND** proves nothing about the file except that it was never
  registered here — it may be edited, AI-generated, or simply
  unregistered. The UI says exactly that.

## Pre-deploy status

- Contract: **not deployed** (no testnet MEC yet — faucet claim pending).
- Frontend: runs locally; registration/verification against the chain
  need the contract address in `frontend/config.js`.
- Local demo: hashing, dHash, forensics, AI score, C2PA manifest
  build/validate, watermark embed/extract and tamper-diff all work
  fully offline in the browser without any deploy.
