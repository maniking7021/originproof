// OriginProof i18n scaffold (v0.3) — UI strings externalised.
// English is the default (demo video and submission are English); Urdu is a
// small scaffold of the main strings. Add a language by adding a key and
// its strings here, then an <option> in index.html. No build step.
"use strict";

const OriginProofI18n = (function () {
  const STRINGS = {
    en: {
      "app.tagline": "On-chain media provenance · ME Network",
      "tab.register": "Register",
      "tab.batch": "Batch register",
      "tab.verify": "Verify",
      "tab.explorer": "Public registry",
      "register.title": "Register media",
      "register.sub": "Upload a photo or video. Its SHA-256 fingerprint and its perceptual hash (dHash) are stored on ME Network. The file itself never leaves your device.",
      "register.button": "Register on ME Network",
      "verify.title": "Verify media",
      "verify.sub": "Upload a file to check it. First we look for an exact SHA-256 match; if there is none, we search by perceptual hash for near-duplicates — resized, re-compressed or lightly cropped copies of a registered original.",
      "verify.button": "Verify",
      "explorer.title": "Public registry — verify without a wallet",
      "explorer.sub": "Anyone can check a file here: upload it on the Verify tab and the result is looked up in the registry — no wallet, no account, no upload. The file never leaves your device; only its hashes are compared.",
      "common.clear": "Clear",
      "common.back": "← Back to OriginProof",
      "privacy.note": "Your file never leaves your device.",
    },
    ur: {
      "app.tagline": "آن چین میڈیا پروویننس · ME نیٹ ورک",
      "tab.register": "رجسٹر کریں",
      "tab.batch": "بیچ رجسٹر",
      "tab.verify": "تصدیق کریں",
      "tab.explorer": "عوامی رجسٹری",
      "register.title": "میڈیا رجسٹر کریں",
      "register.sub": "تصویر یا ویڈیو اپ لوڈ کریں۔ اس کا SHA-256 فنگر پرنٹ اور پرسیپچوئل ہیش ME نیٹ ورک پر محفوظ ہوگا۔ فائل آپ کے آلے سے کبھی باہر نہیں جاتی۔",
      "register.button": "ME نیٹ ورک پر رجسٹر کریں",
      "verify.title": "میڈیا کی تصدیق کریں",
      "verify.sub": "چیک کرنے کے لیے فائل اپ لوڈ کریں۔ پہلے SHA-256 کا عین مطابق ملان دیکھتے ہیں؛ اگر نہ ملے تو پرسیپچوئل ہیش سے قریبی نقول تلاش کرتے ہیں۔",
      "verify.button": "تصدیق کریں",
      "explorer.title": "عوامی رجسٹری — بغیر والیٹ تصدیق کریں",
      "explorer.sub": "یہاں کوئی بھی فائل چیک کر سکتا ہے: Verify ٹیب پر اپ لوڈ کریں — نہ والیٹ، نہ اکاؤنٹ، نہ اپ لوڈ۔ فائل آپ کے آلے سے کبھی باہر نہیں جاتی۔",
      "common.clear": "صاف کریں",
      "common.back": "← OriginProof پر واپس",
      "privacy.note": "آپ کی فائل آپ کے آلے سے کبھی باہر نہیں جاتی۔",
    },
  };

  const KEY = "originproof-lang";
  let lang = "en";
  try { lang = localStorage.getItem(KEY) || (navigator.language || "en").slice(0, 2); } catch (e) { lang = "en"; }
  if (!STRINGS[lang]) lang = "en";

  function t(key) {
    return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
  }
  function getLanguage() { return lang; }
  function setLanguage(next) {
    if (!STRINGS[next]) return;
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ }
    apply();
  }
  // Applies strings to elements carrying data-i18n="<key>".
  // The main headings are wired by data-i18n attributes in index.html.
  // No-op in Node (no document) — tests call t() directly.
  function apply() {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang === "ur" ? "ur" : "en";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
  }
  return { t, getLanguage, setLanguage, apply, STRINGS };
})();

if (typeof module !== "undefined" && module.exports) module.exports = OriginProofI18n;
