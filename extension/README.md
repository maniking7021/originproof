# OriginProof Verifier — browser extension scaffold (v0.3)

Right-click any image on the web → **Verify with OriginProof**. The extension
fetches the image and SHA-256-hashes it **inside the browser** (WebCrypto),
then opens the OriginProof verify page with the hash — the registry lookup
happens on ME Network. No image data is ever uploaded, and no wallet or
private key is involved.

## Install (Chrome / Edge / Brave — developer mode)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Set your OriginProof app URL in `background.js` (`ORIGINPROOF_URL`) —
   your GitHub Pages URL once hosted, or a `file://` path for local use.

## Use

- **Right-click an image** → “Verify with OriginProof” → the verify page
  opens with the image's hash. If the site blocks the fetch (CORS), the
  verify page opens empty — save the image and upload it there instead.
- **Popup:** click the OriginProof icon, paste a SHA-256 hash
  (`0x` + 64 hex chars) → Verify.

## What is a scaffold?

- The context-menu hash + verify-page flow works today.
- Not included: near-duplicate (perceptual-hash) lookup from the
  extension, in-page result badges, Firefox packaging, and Chrome Web
  Store publishing (out of scope for the hackathon).
- No data leaves the browser except the hash in the verify-page URL.
