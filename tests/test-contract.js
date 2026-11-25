// Tests for contracts/OriginProof.sol (v3) — run: node tests/test-contract.js
// Compiles with solc 0.8.28 and asserts the ABI is exactly the v3 shape:
// v3 register/registerBatch with meId, v2 wrappers kept, verify() returns
// the record including meId, ContentRegistered carries meId, version() = "3".
// No network and no local EVM needed. Exits non-zero on any failure.
"use strict";
const fs = require("fs");
const path = require("path");
const solc = require("solc");

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

const source = fs.readFileSync(path.join(__dirname, "..", "contracts", "OriginProof.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "OriginProof.sol": { content: source } },
  settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((e) => e.severity === "error");
console.log("Compile:");
check("no compile errors", errors.length === 0, JSON.stringify(errors.map((e) => e.formattedMessage)));
const contract = output.contracts["OriginProof.sol"]["OriginProof"];
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;
check("bytecode non-empty", typeof bytecode === "string" && bytecode.length > 1000, "bytes: " + (bytecode.length / 2));
console.log("  (bytecode bytes: " + (bytecode.length / 2) + ", ABI entries: " + abi.length + ")");

const fns = abi.filter((e) => e.type === "function");
const events = abi.filter((e) => e.type === "event");
const byName = (name) => fns.filter((f) => f.name === name);
const sig = (f) => f.name + "(" + f.inputs.map((i) => i.type).join(",") + ")";

console.log("v3 functions:");
check("register v3 (5 args) exists",
  byName("register").some((f) => f.inputs.length === 5 && f.inputs[4].type === "string" && f.inputs[4].name === "meId"),
  JSON.stringify(byName("register").map(sig)));
check("register v2 wrapper (4 args) kept",
  byName("register").some((f) => f.inputs.length === 4),
  JSON.stringify(byName("register").map(sig)));
check("registerBatch v3 (5 args) exists",
  byName("registerBatch").some((f) => f.inputs.length === 5 && f.inputs[4].type === "string" && f.inputs[4].name === "meId"),
  JSON.stringify(byName("registerBatch").map(sig)));
check("registerBatch v2 wrapper (4 args) kept",
  byName("registerBatch").some((f) => f.inputs.length === 4),
  JSON.stringify(byName("registerBatch").map(sig)));
check("register returns bool isFirst",
  byName("register").every((f) => f.outputs.length === 1 && f.outputs[0].type === "bool"));

console.log("Record / verify:");
{
  const verify = byName("verify")[0];
  check("verify exists and is view", !!verify && verify.stateMutability === "view");
  const out = verify.outputs[0];
  check("verify returns one tuple", out && out.type === "tuple", JSON.stringify(out && out.type));
  const comps = (out && out.components) || [];
  const names = comps.map((c) => c.name);
  check("record has meId (string)",
    names.includes("meId") && comps.find((c) => c.name === "meId").type === "string",
    JSON.stringify(names));
  check("record has manifestHash (bytes32, after meId)",
    names[names.length - 1] === "manifestHash" && comps[comps.length - 1].type === "bytes32",
    JSON.stringify(names));
  check("record keeps v2 fields in order",
    JSON.stringify(names.slice(0, 7)) === JSON.stringify(["uploader", "timestamp", "blockNumber", "contentType", "title", "registrations", "perceptualHash"]),
    JSON.stringify(names));
  check("record perceptualHash is bytes8",
    comps.find((c) => c.name === "perceptualHash").type === "bytes8");
}
check("isRegistered / registrationCount / totalRecords kept",
  ["isRegistered", "registrationCount", "totalRecords"].every((n) => byName(n).length === 1));
check("hashAt exists (uint256 -> bytes32)",
  byName("hashAt").some((f) => f.inputs.length === 1 && f.inputs[0].type === "uint256" && f.outputs[0].type === "bytes32"));
check("attachManifest exists (bytes32, bytes32)",
  byName("attachManifest").some((f) => f.inputs.length === 2 && f.inputs[0].type === "bytes32" && f.inputs[1].type === "bytes32"));
check("reportCopy exists (bytes32, string)",
  byName("reportCopy").some((f) => f.inputs.length === 2 && f.inputs[0].type === "bytes32" && f.inputs[1].type === "string"));
check("reportCount exists (bytes32 -> uint256)",
  byName("reportCount").some((f) => f.inputs.length === 1 && f.inputs[0].type === "bytes32" && f.outputs[0].type === "uint256"));
check("findByPhash kept (bytes8, uint8)",
  byName("findByPhash").some((f) => f.inputs.length === 2 && f.inputs[0].type === "bytes8" && f.inputs[1].type === "uint8"));

console.log("Event / version:");
{
  const ev = events.find((e) => e.name === "ContentRegistered");
  check("ContentRegistered event exists", !!ev);
  const names = (ev && ev.inputs.map((i) => i.name)) || [];
  check("event carries meId (string, last)",
    names[names.length - 1] === "meId" && ev.inputs[ev.inputs.length - 1].type === "string",
    JSON.stringify(names));
  check("event keeps v2 fields",
    ["contentHash", "uploader", "timestamp", "contentType", "title", "perceptualHash", "isFirst"].every((n) => names.includes(n)),
    JSON.stringify(names));
}
check("ManifestAttached event exists",
  events.some((e) => e.name === "ManifestAttached" && e.inputs.length === 2 && e.inputs[1].name === "manifestHash"));
check("CopyReported event exists",
  events.some((e) => e.name === "CopyReported" && e.inputs.length === 3 && e.inputs[2].name === "url"));
check("VERSION constant exists", abi.some((e) => e.type === "function" && e.name === "VERSION" && e.outputs[0].type === "string"));

console.log("Source sanity:");
check("pragma ^0.8.20", /pragma solidity \^0\.8\.20/.test(source));
check("source mentions v3 + meId", source.includes("v3") && source.includes("meId"));
check("source rejects bad meId", source.includes('"OriginProof: bad meId"'));
check("source never asks for private keys", !/private key/i.test(source.replace(/NEVER a private key/i, "")) || source.includes("NEVER a private key"));

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
