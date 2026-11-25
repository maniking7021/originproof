# OriginProof — Performance & Gas Benchmarks

> Generated 2026-11-23T16:09:17.673Z on v24.22.1 (local machine).
> **These are estimates until the contract is deployed.** Gas figures are
> solc static estimates, not live network receipts; timing figures are
> local-machine measurements of the same primitives the browser uses.
> Re-run after deploy with real receipts: `node benchmark.js`.

## Fingerprinting time

| Operation | Time | Notes |
|---|---|---|
| SHA-256 of 5 MB image (WebCrypto) | 41.3 ms | browser equivalent; file hashing in the app |
| SHA-256 of 50 MB video (WebCrypto) | 519.5 ms | hashing only — video frame sampling (8 frames, canvas) is browser-only and not timed here; it adds a few hundred ms on a typical laptop |
| dHash per frame (9x8 grayscale) | 0.0 ms | 8 frames per video => ~8x this, negligible vs hashing |
| C2PA manifest hash (stable JSON + sync SHA-256) | 11.1 ms | manifest hash 40b96fa8ad642a3d51… |

## Gas (solc estimates)

Deployment (contract creation): `{"codeDepositCost":"2554600","executionCost":"2761","totalCost":"2557361"}`

| Function | Estimated gas |
|---|---|
| `VERSION()` | infinite |
| `attachManifest(bytes32,bytes32)` | infinite |
| `findByPhash(bytes8,uint8)` | infinite |
| `hashAt(uint256)` | 7069 |
| `isRegistered(bytes32)` | 2880 |
| `register(bytes32,bytes8,string,string)` | infinite |
| `register(bytes32,bytes8,string,string,string)` | infinite |
| `registerBatch(bytes32[],bytes8[],string[],string[])` | infinite |
| `registerBatch(bytes32[],bytes8[],string[],string[],string)` | infinite |
| `registrationCount(bytes32)` | 2818 |
| `reportCopy(bytes32,string)` | infinite |
| `reportCount(bytes32)` | 2791 |
| `totalRecords()` | 2464 |
| `verify(bytes32)` | infinite |

### How to read these numbers

- solc reports `infinite` for the state-changing functions because
  they write dynamic strings / loop over caller-supplied arrays —
  the compiler cannot bound them statically. The manual estimates
  below come from counting storage writes instead:
  - **First registration** (`register`, new hash): the Record struct
    opens ~8–10 new storage slots (uploader, timestamp, block,
    contentType, title, registrations, perceptualHash, meId,
    manifestHash) plus one `_allHashes` push — roughly **200,000–
    280,000 gas** at 20,000 gas per cold SSTORE, plus calldata and
    the event. *Estimate, not a receipt.*
  - **Re-registration** (same hash again): one counter increment +
    event — roughly **30,000–50,000 gas**.
  - **`registerBatch` (10 files):** roughly 10x one first
    registration minus shared overhead — **~1.8–2.5M gas** for 10
    new files in one transaction.
  - **`attachManifest` / `reportCopy`:** one storage write + event
    — roughly **30,000–60,000 gas** each.
- `verify`, `findByPhash`, `hashAt`, `totalRecords` and `reportCount`
  are `view` functions — free when called off-chain (the public
  registry uses them).
- Real gas depends on the ME Network gas price and the exact state at
  deploy time; the first live receipts will replace this table.
