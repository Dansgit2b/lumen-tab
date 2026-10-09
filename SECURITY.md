# Security notes

Lumen Tab has not been audited. It's an experimental public good, so use small deposits.

## Threat model

| Threat | Mitigation |
|---|---|
| Provider over-charges | It can only redeem amounts the signer signed for, and never more than `deposited`. Vouchers are bound by EIP-712 to chain id, contract and `tabId`, so a voucher from one tab can't be used on another. |
| Payer refuses to pay after the service | The provider redeems before serving more than it is willing to risk (`minRedeem`). A payer's `requestClose` triggers an immediate redeem within `closeDelay`. |
| Payer front-runs the provider by exiting | Exiting needs `requestClose` followed by `closeDelay` (at least 5 minutes), and the provider can redeem throughout that window. Top-ups are blocked while closing. |
| Voucher replay | Vouchers are cumulative. Redeeming requires `cumulative > paid`, so replaying an old voucher does nothing. |
| Concurrent double-spend of one increment (off-chain) | An atomic compare-and-set on the provider's high-water mark, plus a 409 response for the losing request. |
| Hot agent key compromised | The worst case is the remaining deposit of tabs naming that signer. Keep deposits small and treasury funds in `payer`. The signer can also be an ERC-1271 smart account with its own policy. |
| SSRF through the example provider | Only public http(s) URLs are allowed. DNS answers are checked against private and reserved ranges, and redirects are re-checked. |
| Reentrancy | State is written and events emitted before transfers (CEI). The token is Arc's native USDC ERC-20 interface. |

## Known limitations

- A provider with several server instances needs a shared store (Redis or a database) for the compare-and-set.
- `closeDelay` is chosen by the payer within protocol bounds. Providers should refuse tabs whose delay is shorter than their settlement interval (the middleware can check `tab.closeDelay`).
- There is no on-chain dispute over service quality. Quality is a reputation problem, which is why the ERC-8004 agent ids are there.
