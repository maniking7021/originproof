// OriginProof network config — ME Network (MetaEarth)
// ---------------------------------------------------------------------------
// FILLED 21 Nov 2026 from the OFFICIAL ME docs (docs.mec.me), checked
// 01:55–02:00 UTC via the live browser:
// - Chain ID 400 (decimal) + EVM RPC http://118.175.0.249:8545:
//   JS SDK docs, "EVM Contract Operations (sdk.contract)":
//   https://docs.mec.me/docs/development-guides/developer-guide/js-sdk#evm-contract-operations-sdkcontract
//   ("The testnet defaults to http://118.175.0.249:8545 with chain ID 400.")
// - Testnet explorer https://www.explorer-testnet.me/ (verified live;
//   listed as Testnet Explorer in the For Developers + Testnet Node Setup
//   Guide docs; no EVM-specific explorer URL is published).
// - Faucet https://www.mec.me/en-US/faucet (verified live as "ME Network
//   Testnet Faucet": 1 claim per address per day, 2 MEC per claim; needs a
//   wallet address + email + email code).
// CAVEATS (from the same docs):
// - chainIdHex "0x190" is the arithmetic hex of published decimal 400 —
//   Meta Earth does not publish the hex value itself.
// - The RPC is plain HTTP, not HTTPS: the JS SDK docs warn that a browser
//   app served over HTTPS cannot call it (mixed content). Use it from
//   Remix / a local or HTTP-served app, or an HTTPS RPC if ME publishes one.
// - Do NOT confuse this EVM testnet with the Cosmos ME Hub testnet
//   (chain "mechain_400-1", Tendermint RPC) — different network.
// - Re-check the RPC + faucet at deploy time: docs are inconsistent in
//   places (e.g. the JS SDK FAQ says only "contact the Meta Earth team"
//   for test tokens, while the faucet page loads live).
// - A direct eth_chainId probe of the RPC from this VM on 21 Nov returned
//   nothing (egress blocked in background preparation), so the endpoint is
//   docs-sourced, not live-verified here. Verify it responds in Remix
//   before deploying.
// ---------------------------------------------------------------------------
window.ORIGINPROOF_CONFIG = {
  // ME Network testnet (use testnet first; mainnet only if the team decides)
  chainIdDecimal: 400, // published in official JS SDK docs (see header)
  chainIdHex: "0x190", // arithmetic hex of 400; not published by ME itself
  networkName: "ME Network Testnet",
  rpcUrl: "http://118.175.0.249:8545", // HTTP only — see mixed-content caveat above
  blockExplorerUrl: "https://www.explorer-testnet.me/", // general testnet explorer
  currencySymbol: "MEC",
  currencyDecimals: 18,
  faucetUrl: "https://www.mec.me/en-US/faucet", // 1 claim/address/day, 2 MEC

  // Filled in after the contract is deployed (Remix gives the address).
  contractAddress: "0xbc6a84934ED39AB96259022Ac80d18C4b3d143cc", // Deployed 25 Nov 2026, tx 0xe162495961fc364b1f2ac00348cb3738201b5b6d38e26376c6b8cacd04f07706, block 5502685
};
