// OriginProof i18n + API tests (v0.3) — Node.
// i18n.js and api.js are browser scripts; in Node they export via
// module.exports. api.js needs lib.js (require) and a crypto global
// for sha256File (Node 18+ provides webcrypto).
"use strict";

const fs = require("fs");
const path = require("path");

let passed = 0, failed = 0;
function check(name, ok, extra) {
  if (ok) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// --- i18n ---
console.log("i18n:");
const i18n = require("../frontend/i18n.js");
check("default language is en", i18n.getLanguage() === "en", i18n.getLanguage());
check("en tagline", i18n.t("app.tagline") === "On-chain media provenance · ME Network");
check("en register title", i18n.t("register.title") === "Register media");
i18n.setLanguage("ur");
check("ur switch works", i18n.getLanguage() === "ur");
check("ur register title differs", i18n.t("register.title") !== "Register media" && i18n.t("register.title").length > 0, i18n.t("register.title"));
check("ur falls back for missing keys", typeof i18n.t("tab.explorer") === "string" && i18n.t("tab.explorer").length > 0);
i18n.setLanguage("xx");
check("unknown language ignored", i18n.getLanguage() === "ur");
i18n.setLanguage("en");
check("back to en", i18n.getLanguage() === "en");
check("missing key returns key", i18n.t("does.not.exist") === "does.not.exist");
check("both locales have the same keys",
  JSON.stringify(Object.keys(i18n.STRINGS.en).sort()) === JSON.stringify(Object.keys(i18n.STRINGS.ur).sort()));

// --- api.js (Node) ---
console.log("API module:");
const api = require("../frontend/api.js");
check("api version 0.3", api.version === "0.3");
check("isValidMeId exposed", api.isValidMeId("me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf") === true && api.isValidMeId("0x123") === false);
check("shortMeId exposed", api.shortMeId("me1tlx9j3gu5pax3hcvu93g58u0w4aj26tf633xqf") === "me1tlx…3xqf");
check("phashDistance exposed", api.phashDistance("0".repeat(64), "f".repeat(64)) === 64);
check("phashSimilarity exposed", api.phashSimilarity(0) === 100 && api.phashSimilarity(64) === 0);
const m = api.buildManifest({ fileName: "a.jpg", sha256Hex: "0x" + "ab".repeat(32), title: "A" });
check("buildManifest works", m.claim_generator === "OriginProof/0.3");
check("validateManifest works", api.validateManifest(m, { sha256Hex: "0x" + "ab".repeat(32) }).valid === true);
check("manifestHash is 0x + 64 hex", /^0x[0-9a-f]{64}$/.test(api.manifestHash(m)));
const ai = api.aiScore({ format: "PNG", fields: [], aiMarkers: [], flags: { hasExif: false, hasXmp: false, hasC2pa: false, hasGps: false }, verdict: "none" });
check("aiScore exposed", ai.score === 25 && ai.band === "uncertain");
check("REST spec lists 5 endpoints", api.REST_SPEC.endpoints.length === 5);
check("REST spec has verify endpoint", api.REST_SPEC.endpoints.some((e) => e.path.includes("/api/v1/verify/")));

// --- PWA files ---
console.log("PWA:");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "frontend", "manifest.json"), "utf8"));
check("PWA manifest name", manifest.name === "OriginProof — On-chain media provenance");
check("PWA start_url is index.html", manifest.start_url === "index.html");
check("PWA display standalone", manifest.display === "standalone");
const sw = fs.readFileSync(path.join(__dirname, "..", "frontend", "sw.js"), "utf8");
check("service worker caches core files", /CORE_FILES/.test(sw) && /index\.html/.test(sw) && /app\.js/.test(sw) && /lib\.js/.test(sw));
check("service worker is same-origin only", /url\.origin !== self\.location\.origin/.test(sw));
check("service worker versions cache", /originproof-v0\.3\.0/.test(sw));
const index = fs.readFileSync(path.join(__dirname, "..", "frontend", "index.html"), "utf8");
check("index links manifest", /rel="manifest" href="manifest\.json"/.test(index));
check("index registers service worker", /serviceWorker.*register\("sw\.js"\)/.test(index));
check("index has language switcher", /id="langSelect"/.test(index));
check("index loads i18n + api", /src="i18n\.js"/.test(index) && /src="api\.js"/.test(index));
check("index has Explorer tab + panel", /id="tabExplorer"/.test(index) && /id="panelExplorer"/.test(index) && /id="explorerBody"/.test(index));
check("index has creator view", /id="creatorView"/.test(index) && /id="creatorBody"/.test(index));
check("index has ME ID inputs", /id="regMeId"/.test(index) && /id="batchMeId"/.test(index));
check("index has watermark checkbox", /id="regWatermark"/.test(index));
check("index has sidecar input", /id="sidecarInput"/.test(index));
check("index has tamper-diff containers", /id="tamperDiffWrap"/.test(index) && /id="tamperDiffCanvas"/.test(index) && /id="videoFrameDiffWrap"/.test(index));
check("index uses relative paths only (no absolute /frontend)", !/src="\/|href="\/frontend/.test(index));

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
