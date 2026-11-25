// OriginProof extension popup — open the verify page for a pasted hash.
"use strict";

document.getElementById("goBtn").addEventListener("click", () => {
  const hash = (document.getElementById("hashInput").value || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    document.getElementById("hashInput").focus();
    document.getElementById("hashInput").placeholder = "Needs a 0x + 64 hex chars";
    return;
  }
  chrome.runtime.sendMessage({ type: "open-verify", hash });
});
document.getElementById("hashInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("goBtn").click();
});
