# Lumen Tab

**Prepaid USDC tabs for pay-per-call AI agent APIs on Arc.**

An agent opens one USDC tab with an API provider, then pays for each call with a signed
EIP-712 voucher: no transaction, no gas and no block wait per call. The provider settles
on Arc in USDC whenever it wants, with one transaction covering hundreds of calls. The
payer can always recover whatever it hasn't spent. Neither side has to trust the other
for more than the deposit.

- **Live on Arc mainnet:** [`0xb4a0364c58B2DF53e25FfF0463B5434160Ed2B50`](https://explorer.arc.io/address/0xb4a0364c58B2DF53e25FfF0463B5434160Ed2B50) (chain id 5042)
- **Dashboard and voucher verifier:** https://dansgit2b.github.io/lumen-tab/ (static page that reads Arc directly; source in [`docs/index.html`](docs/index.html))
- **Reference provider identity:** ERC-8004 agent **#2315** in Arc's IdentityRegistry

## Why

Agents are about to buy a lot of very small things: a page extraction, a search, an
inference, a data point. They want to pay **$0.001–$0.01 per call**. Each existing option
breaks somewhere:

| Approach | Problem for $0.002 calls |
|---|---|
| One on-chain payment per call (e.g. plain x402 "exact") | A transaction and a confirmation on every request. The fee and the latency go on the hot path. |
| API keys and monthly invoices | Needs accounts, KYC and credit risk. Agents can't sign up for these on their own. |
| Custodial prepaid credits | The provider holds the funds. A refund depends on the provider's goodwill. |

Lumen Tab is a **unidirectional payment channel** built for HTTP APIs on Arc:

- **USDC end to end.** On Arc, USDC is the gas token, so an agent only needs one asset, and fees are dollar-denominated and predictable.
- **Sub-second finality.** Opening a tab and settling are effectively instant, so an agent can open a tab just in time, on its first `402`.
- **Calls are free and instant.** Verifying a voucher is one `ecrecover` (or an ERC-1271 check) against a cached tab, with no RPC write.
- **Bounded trust.** The provider can never take more than the payer signed for. The payer can always exit after the tab's close delay, and the provider gets that window to redeem.
- **Agent-native identity.** Tabs can name the provider's **ERC-8004** agent id (Arc ships the ERC-8004 registries), so reputation systems and explorers can tie spend to agent identities.

## How it works

```
 Agent (payer)                         Provider API                         Arc (LumenTab)
     |  1. approve + open(provider, signer, 5 USDC, 1h, agentId) ----------------> | escrow
     |  2. GET /v1/extract?url=...  ---------> |                                    |
     |  <------- 402 {scheme: lumen-tab-v1, price: 2000, contract, provider}       |
     |  3. sign Voucher(tabId, cumulative = prev + 2000)                           |
     |  GET ... + header x-lumen-tab: <voucher> > | verify sig + bounds (cached tab) |
     |  <------- 200 + x-lumen-tab-receipt      |                                   |
     |       ... hundreds of calls, zero gas ...  |                                   |
     |                                            | 4. redeem(tabId, latest) -------> | pay provider
     |  5. requestClose → (closeDelay) → finalize --------------------------------->  | refund rest
```

- **Voucher.** `Voucher(uint256 tabId, uint128 cumulative)` is signed under the EIP-712 domain `LumenTab / 1 / 5042 / <contract>`. Vouchers are cumulative and monotonic: only the latest one matters, and replaying an old one does nothing.
- **Signer separation.** A tab's `signer` can be a hot agent key, or a smart account via **ERC-1271**, while `payer` is the treasury that funds it and gets refunds.
- **Exits.**
  - The provider can `closeByProvider` cooperatively, which redeems and refunds in one transaction.
  - The payer can `requestClose`. That blocks top-ups and gives the provider `closeDelay` to redeem. After the delay, anyone can call `finalize`.
- **Failed calls are not charged.** The paywall rolls back its high-water mark when the handler returns an error. The agent then re-signs the same cumulative amount, so the retained voucher is never worth more than what was delivered.

More detail is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and the threat model is in [SECURITY.md](SECURITY.md).

## What's in the repo

| Path | What |
|---|---|
| `src/LumenTab.sol` | The contract: ~190 lines on OpenZeppelin v5 (SafeERC20, EIP712, SignatureChecker). |
| `test/LumenTab.t.sol` | 16 Foundry tests. They cover replay, cross-tab binding, wrong signer, over-deposit, the exit paths, an ERC-1271 smart-account signer, and a fuzzed conservation invariant. |
| `sdk/` | JS SDK on viem: `signVoucher`, `TabPayer` (a fetch wrapper that answers 402s), `lumenTabPaywall` (Express middleware), `Settler` (batch redeem), `openTab`. |
| `examples/provider.mjs` | A real paid API: **URL → clean Markdown for agents** at 0.002 USDC per call. It has SSRF protection and only charges after input validation. |
| `examples/agent.mjs` | An agent that opens a tab and pays per call. |
| `examples/payer-exit.mjs`, `provider-close.mjs`, `status.mjs`, `negative-checks.mjs` | Lifecycle and adversarial demos. |
| `docs/index.html` | Static dashboard: live tabs, the event feed, and a voucher verifier. No backend. |
| `deployments/` | ABI, standard-JSON input for verification, and the ERC-8004 registration file. |

## Demo (Arc mainnet)

Prerequisites: Node ≥ 20, Foundry, and two funded Arc keys with a little USDC each.

```bash
git clone --recursive https://github.com/Dansgit2b/lumen-tab && cd lumen-tab
npm install
forge test                     # 16 contract tests
ONLINE=1 node --test sdk/test/ # SDK tests; checks the EIP-712 digest against the deployed contract

# terminal 1: the provider (paid URL→Markdown API)
PROVIDER_PRIVATE_KEY=0x... MIN_REDEEM_USDC=0.005 node examples/provider.mjs

# terminal 2: the agent opens a 0.05 USDC tab and makes paid calls
PAYER_PRIVATE_KEY=0x... DEPOSIT_USDC=0.05 node examples/agent.mjs https://example.com https://en.wikipedia.org/wiki/Stablecoin
node examples/negative-checks.mjs <tabId>   # replay / inflated voucher / SSRF are rejected
kill -USR2 <provider pid>                   # force the settler to redeem now
node examples/payer-exit.mjs request <tabId>  # then, after the close delay: finalize <tabId>
node examples/status.mjs
```

Use it in your own API:

```js
// npm install github:Dansgit2b/lumen-tab
import express from "express";
import { lumenTabPaywall, Settler, JsonFileStore, usdc } from "lumen-tab";
const store = new JsonFileStore("vouchers.json");
app.get("/paid", lumenTabPaywall({ provider: myAddress, price: usdc("0.001"), store }), handler);
setInterval(() => new Settler({ walletClient, store }).tick(), 60_000);
```

…and in your agent:

```js
import { TabPayer } from "lumen-tab";
const payer = new TabPayer({ account, tabId, provider });
const res = await payer.fetch("https://api.example/paid"); // handles 402 → voucher → retry
```

## Deployments (Arc mainnet, chain id 5042)

| What | Address / tx |
|---|---|
| LumenTab | [`0xb4a0364c58B2DF53e25FfF0463B5434160Ed2B50`](https://explorer.arc.io/address/0xb4a0364c58B2DF53e25FfF0463B5434160Ed2B50) · deploy tx [`0x06858d89…d225`](https://explorer.arc.io/tx/0x06858d89410b3dcce818a6093f4aec988e9ca8c2fd5c29603bfbfbf30079d225) (block 25046341) |
| USDC (ERC-20 interface of native USDC) | `0x3600000000000000000000000000000000000000` |
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. The reference provider is agent **#2315** ([register tx](https://explorer.arc.io/tx/0x25500cc6c80f30156f987f79d875475ae589a3a6da4bdd81a93b282059b753c6)). |

Every live demo transaction is listed in [DEPLOYMENTS.md](DEPLOYMENTS.md). The demo exercised all three lifecycles on mainnet:

- tab #1: unilateral payer exit;
- tab #2: cooperative provider close;
- tab #3: an open tab with partial settlement.

## Status and roadmap

This is working, tested and deployed, but it's early software and hasn't been audited, so start with small deposits.

Next steps:

- Publish the SDK to npm.
- Add an x402-compatible `scheme` adapter so existing x402 clients can pay with tabs.
- Multi-provider "hub" tabs.
- Write `giveFeedback` to the ERC-8004 ReputationRegistry on settlement.
- Gas-sponsored `open` via Permit2 / EIP-2612.

## License

MIT © Lumenworks
