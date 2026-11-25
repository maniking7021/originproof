// OriginProof extension scaffold tests (v0.3) — static checks only.
// The extension runs in a browser; these tests validate the manifest,
// popup and background script without launching Chrome.
"use strict";

const fs = require("fs");
const path = require("path");

let passed = 0, failed = 0;
function check(name, ok, extra) {
  if (ok) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

const EXT = path.join(__dirname, "..", "extension");
console.log("Extension manifest:");
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
check("manifest_version is 3", manifest.manifest_version === 3, "got " + manifest.manifest_version);
check("name is OriginProof Verifier", manifest.name === "OriginProof Verifier");
check("version is 0.3.0", manifest.version === "0.3.0");
check("background service worker exists", manifest.background && manifest.background.service_worker === "background.js");
check("contextMenus permission", (manifest.permissions || []).includes("contextMenus"));
check("popup action set", manifest.action && manifest.action.default_popup === "popup.html");
check("host permissions cover http/https", (manifest.host_permissions || []).some((h) => h.includes("https://*/*")));

console.log("Extension files:");
for (const f of ["manifest.json", "background.js", "popup.html", "popup.js", "README.md"]) {
  check(f + " exists", fs.existsSync(path.join(EXT, f)));
}
const bg = fs.readFileSync(path.join(EXT, "background.js"), "utf8");
check("background creates image context menu", /contextMenus\.create/.test(bg) && /contexts:\s*\["image"\]/.test(bg));
check("background hashes with WebCrypto SHA-256", /crypto\.subtle\.digest\("SHA-256"/.test(bg));
check("background opens verify page with hash", /#\/verify\//.test(bg));
check("background never asks for keys", !/privateKey|seed|mnemonic|password/i.test(bg));
const popup = fs.readFileSync(path.join(EXT, "popup.html"), "utf8");
check("popup has hash input + button", /hashInput/.test(popup) && /goBtn/.test(popup));
const popupJs = fs.readFileSync(path.join(EXT, "popup.js"), "utf8");
check("popup validates 0x + 64 hex", /0x\[0-9a-fA-F\]\{64\}/.test(popupJs));
const readme = fs.readFileSync(path.join(EXT, "README.md"), "utf8");
check("extension README has install steps", /Load unpacked/.test(readme) && /Developer mode/.test(readme));

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
