// Compiles contracts/OriginProof.sol with the solc JS package.
// Usage: npm install solc && node compile.js
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const source = fs.readFileSync(path.join(__dirname, "contracts", "OriginProof.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "OriginProof.sol": { content: source } },
  settings: {
    // ME testnet EVM does NOT support PUSH0 (Shanghai) — "invalid opcode: PUSH0" on deploy.
    // Compile for Paris so solc emits PUSH1 00 instead of PUSH0.
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.gasEstimates"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors) {
  for (const e of output.errors) console.log(e.severity + ": " + e.formattedMessage);
  if (output.errors.some((e) => e.severity === "error")) process.exit(1);
}
const contract = output.contracts["OriginProof.sol"]["OriginProof"];
fs.mkdirSync(path.join(__dirname, "build"), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, "build", "OriginProof.json"),
  JSON.stringify({ abi: contract.abi, bytecode: contract.evm.bytecode.object, gasEstimates: contract.evm.gasEstimates || null }, null, 2)
);
console.log("OK: OriginProof compiled. ABI entries:", contract.abi.length,
  "| bytecode bytes:", contract.evm.bytecode.object.length / 2);
if (contract.evm.gasEstimates && contract.evm.gasEstimates.external) {
  console.log("Gas estimates (solc, creation / external functions):");
  const ext = contract.evm.gasEstimates.external;
  for (const [sig, gas] of Object.entries(ext)) console.log("  " + sig + " -> " + gas);
  if (contract.evm.gasEstimates.creation) console.log("  creation -> " + JSON.stringify(contract.evm.gasEstimates.creation));
}
