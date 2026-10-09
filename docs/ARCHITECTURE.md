# Lumen Tab architecture

## On-chain: `LumenTab.sol`

State per tab:

- `payer`: funds the tab and receives refunds.
- `provider`: receives redeemed USDC.
- `signer`: signs vouchers. It can be an EOA hot key or an ERC-1271 contract.
- `closeDelay`: between 5 min and 30 days.
- `closeAt`: 0 while open.
- `closed`
- `deposited`, `paid`: both uint128, in USDC units with 6 decimals.

| Function | Who | Effect |
|---|---|---|
| `open(provider, signer, amount, closeDelay, providerAgentId)` | anyone (becomes payer) | Pulls `amount` USDC and emits `TabOpened`, including the provider's ERC-8004 agent id (0 = none). |
| `topUp(tabId, amount)` | anyone | Adds to the deposit. Not allowed once a close has been requested. |
| `redeem(tabId, cumulative, sig)` | anyone (a relayer works) | Requires `paid < cumulative ≤ deposited` and a valid signature. Pays `cumulative − paid` to the provider. |
| `closeByProvider(tabId, cumulative, sig)` | provider | Optional final redeem, then refunds the rest to the payer and closes. |
| `requestClose(tabId)` | payer | Sets `closeAt = now + closeDelay`. The provider can still redeem until finalize. |
| `finalize(tabId)` | anyone, once `now ≥ closeAt` | Refunds `deposited − paid` to the payer and closes. |
| `voucherDigest`, `getTab`, `available`, `domainSeparator` | view | Helpers for off-chain verifiers. |

Invariants (fuzz-tested):

- `paid ≤ deposited`.
- The USDC held by the contract equals Σ(deposited − paid) over open tabs.
- Once a tab is `closed`, it never moves again.

Arc specifics:

- USDC is both the native gas token (18 decimals) and an ERC-20 at `0x3600…0000` (6 decimals). The contract only uses the ERC-20 view, with SafeERC20, and never touches `msg.value`.
- It is compiled for `paris` (no PUSH0 or transient storage assumptions), with solc 0.8.24 and 10k optimizer runs.
- With sub-second deterministic finality, a provider can treat `open` as final once the receipt arrives. There's no reorg window to wait out before serving.

## Off-chain protocol: `lumen-tab-v1` over HTTP 402

1. A request without payment gets `402` with `{accepts:[{scheme:"lumen-tab-v1", chainId:5042, contract, provider, price, asset}]}`.
2. The client retries with the header `x-lumen-tab: base64url(JSON{s:"lumen-tab-v1", t:tabId, c:cumulative, sig})`.
3. The provider middleware (`lumenTabPaywall`) checks, in order:
   1. tab provider == self;
   2. the tab is not closing;
   3. `cumulative − max(lastAccepted, paid) ≥ price`;
   4. `cumulative ≤ deposited`;
   5. the signature is valid for the tab's `signer` (viem `verifyTypedData`, which supports both EOAs and ERC-1271);
   6. an atomic compare-and-set on the store's high-water mark, so two concurrent requests can't both spend the same increment.
4. On success it sets `x-lumen-tab-receipt: {tabId, cumulative, charged}` and serves the request. If the handler responds ≥ 400, the charge is rolled back.
5. `Settler.tick()` redeems a tab once the unredeemed amount reaches `minRedeem`, and **immediately** when the payer has requested close.

Costs measured on Arc mainnet (about 20 gwei, paid in USDC):

| Operation | Gas | Cost |
|---|---|---|
| open | ≈154k | ≈0.003 USDC |
| approve | ≈55k | ≈0.001 USDC |
| redeem | ≈90k | ≈0.0018 USDC |
| closeByProvider (with redeem) | ≈113k | ≈0.0023 USDC |
| requestClose | ≈33k | ≈0.0007 USDC |

A tab with 500 calls at $0.002 costs about $0.007 in gas in total, compared with about $0.9 if each call were settled on-chain.

## Components

```
sdk/index.mjs      vouchers (EIP-712), TabPayer (client), lumenTabPaywall (server), Settler, openTab, readTab
sdk/store.mjs      MemoryStore / JsonFileStore: highest accepted voucher per tab, CAS + rollback
examples/          provider (URL→Markdown), agent, payer-exit, provider-close, status, negative-checks
docs/index.html    static dashboard (viem from esm.sh + Arc public RPC), voucher verifier
```
