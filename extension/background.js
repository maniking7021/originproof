// OriginProof extension — background service worker (Manifest V3).
// Right-click any image -> "Verify with OriginProof". The image is fetched
// and SHA-256-hashed INSIDE the extension (WebCrypto); only the hash is
// sent to the OriginProof verify page, which looks it up on ME Network.
// No image data ever leaves the browser, and no private key is involved.
//
// Before first use, set your OriginProof app URL below (local file or
// hosted GitHub Pages URL). Default: the GitHub Pages URL pattern.
"use strict";

const ORIGINPROOF_URL = "https://thecuriovaultfacts.github.io/originproof/"; // <-- change to your hosted URL

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "originproof-verify-image",
    title: "Verify with OriginProof",
    contexts: ["image"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "originproof-verify-image" || !info.srcUrl) return;
  try {
    const res = await fetch(info.srcUrl);
    const buf = await res.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const hash = "0x" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    chrome.tabs.create({ url: ORIGINPROOF_URL + "#/verify/" + hash });
  } catch (e) {
    // Some sites block cross-origin fetches (CORS). Fall back to opening
    // the verify page so the user can save and upload the image instead.
    chrome.tabs.create({ url: ORIGINPROOF_URL + "#/verify/" });
  }
});

// Popup asks the background worker to verify a pasted hash.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "open-verify" && typeof msg.hash === "string") {
    chrome.tabs.create({ url: ORIGINPROOF_URL + "#/verify/" + msg.hash });
  }
});
