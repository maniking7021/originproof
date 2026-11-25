# OriginProof — Security Notes

Honest security notes for the contract, the frontend and the threat model.
This is a hackathon submission, not an audit. Nothing here is a claim of
formal verification.

## What the contract trusts

- **The uploader's wallet** for the act of registering. Registration is
  first-come-first-served: whoever registers a hash first holds the
  origin claim. The contract cannot know who *really* created a file —
  it records who registered it first, and when. That is the product's
  honest limit, stated in the UI.
- **The caller's ME ID string.** `meId` is validated for format only
  (`me1` + 7–61 lowercase alphanumeric chars, 10–64 total). The contract
  does **not** verify that the caller owns that ME ID or that it passed
  advanced verification — anyone can put any well-formed ME ID in the
  field. A future version should check ME ID ownership on-chain (see
  submission roadmap). The UI calls it "verified owner" because ME IDs
  are issued through MetaEarth's verified-identity flow; the on-chain
  proof of *ownership of that ID by the uploader* is not yet enforced.
- **The perceptual hash.** dHash is a similarity signal, not a
  cryptographic commitment. Two different images can share a dHash, and
  heavy edits defeat it. The contract stores it as `bytes8` and searches
  it with `findByPhash` — it never treats a dHash match as proof of
  identity; only the SHA-256 match is exact.

## What the contract does NOT trust

- **No private keys, seed phrases or passwords** ever touch the app.
  The frontend only ever asks a wallet to *sign a transaction*; keys stay
  in the wallet. The contract has no owner, no admin functions, no
  upgrade path and no way to move funds — it holds no funds at all.
- **No off-chain data.** The contract never reads URLs, manifests or
  metadata. The C2PA manifest lives off-chain as a downloadable sidecar;
  only its SHA-256 is stored (`manifestHash` via `attachManifest`), so a
  sidecar can be checked against the chain but the chain never depends
  on the sidecar's contents.
- **No price, oracle or external call.** There are no external contract
  calls, so there is no oracle or re-entrancy surface from other contracts.

## Re-entrancy / overflow

- **Solidity 0.8.28** — arithmetic overflow/underflow reverts by default
  (checked math is built in); there are no manual `unchecked` blocks.
- **No external calls** in any function, and no ETH is accepted or sent,
  so classic re-entrancy does not apply. `register` / `registerBatch` /
  `attachManifest` / `reportCopy` only write to this contract's own
  storage and emit events.
- **Gas griefing:** `registerBatch` loops over caller-supplied arrays;
  the frontend caps batches at 10 files and the contract requires equal
  array lengths. `findByPhash` loops over all stored hashes — it is a
  `view` call (no gas when called off-chain), but it grows linearly with
  the registry; for very large registries a paged index would be needed
  (noted as a future improvement).

## Access control

- `attachManifest` — only the original uploader, and only once
  (`manifestHash` must be empty). Prevents anyone else from re-anchoring
  a record's manifest.
- `reportCopy` — anyone may report (that is the point: the public flags
  copies), but a report is only a **count + event**, never a verdict.
  The URL is stored in the event only, capped at 300 characters, and is
  not verified on-chain.
- `register` / `registerBatch` — permissionless by design (public
  registry). Duplicate registration of the same hash increments the
  `registrations` counter and returns `isFirst = false`; it never
  overwrites the first record.

## Frontend

- **The file never leaves the device.** Hashing (WebCrypto SHA-256),
  dHash (canvas), video frame sampling, metadata parsing, C2PA manifest
  building, watermarking and QR generation all run in the browser. The
  only data sent to the network are hashes, titles and ME IDs — in the
  transaction the user explicitly confirms in their wallet.
- **XSS hygiene:** all user-controlled strings (titles, ME IDs, URLs)
  are rendered through `escapeHtml` before insertion into the DOM.
- **Dependencies:** ethers v6 from the jsDelivr CDN (pinned
  `ethers@6.13.4`); everything else is hand-written in this repo. The
  service worker caches only same-origin files.
- **Local storage:** records and verification logs are kept in the
  user's own `localStorage` (max 100 records / 500 verifications) as a
  convenience cache; the on-chain record is always the source of truth
  and the UI labels the cache as local.

## Known limitations (not hidden)

- ME ID ownership is format-checked, not cryptographically proven (above).
- The AI-origin score is a metadata heuristic, not a detector.
- The C2PA manifest is a sidecar JSON, not a signed JUMBF box — see
  README "C2PA: what is aligned, what is simplified".
- The invisible watermark survives re-saving but not aggressive
  recompression or cropping.
- `findByPhash` is O(n) over all hashes; fine for a hackathon registry,
  needs paging at scale.
