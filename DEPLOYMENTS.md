# Deployments and live demo transactions: Arc mainnet (chain id 5042)

| Contract | Address |
|---|---|
| LumenTab | [`0xb4a0364c58B2DF53e25FfF0463B5434160Ed2B50`](https://explorer.arc.io/address/0xb4a0364c58B2DF53e25FfF0463B5434160Ed2B50) |
| USDC (ERC-20 interface, 6 dp) | `0x3600000000000000000000000000000000000000` (constructor argument) |
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. The reference provider is agent **#2315**. |

Build:

- solc 0.8.24, evm `paris`, optimizer with 10,000 runs, OpenZeppelin v5.0.2.
- The standard-JSON input is in `deployments/LumenTab.standard-input.json` and the ABI in `deployments/LumenTab.abi.json`.
- The runtime bytecode reproduces from this repo; the only differences from `forge build` are the immutables.

Actors in the demo:

- Provider, the reference URL→Markdown API: `0xee9790cB3960952F585379F831a89b4e00B4029A`
- Agent (payer and signer): `0xBFFc9812205C9EB1A501b39b452E9C6e0DaD5B0E`

| # | Step | Tx | Gas used | Cost (USDC) |
|---|---|---|---|---|
| 1 | Deploy LumenTab | [0x06858d89…d225](https://explorer.arc.io/tx/0x06858d89410b3dcce818a6093f4aec988e9ca8c2fd5c29603bfbfbf30079d225) | 1,902,297 | 0.0380 |
| 2 | Register the provider as an ERC-8004 agent (#2315) | [0x25500cc6…53c6](https://explorer.arc.io/tx/0x25500cc6c80f30156f987f79d875475ae589a3a6da4bdd81a93b282059b753c6) | 638,478 | 0.0128 |
| 3 | Tab #1: approve USDC | [0x15ea3d2b…dc5b](https://explorer.arc.io/tx/0x15ea3d2b7fce4b85c36bba3258c88b659afd92115c376b1dfecbfb7c3d77dc5b) | 55,426 | 0.0011 |
| 4 | Tab #1: open (0.05 USDC, 10 min close delay) | [0xe58a0a2b…73a2](https://explorer.arc.io/tx/0xe58a0a2bf6434d8f50f3706b3d7f6a3c29b21c6c7f80183d55beb068fc7673a2) | 153,762 | 0.0031 |
| 5 | Tab #1: provider redeems 5 calls (0.01 USDC) | [0xfc8d79ea…51a0e5](https://explorer.arc.io/tx/0xfc8d79eadddad42feea512d1a1eb48594e597c0e69b6ff573176942e3f51a0e5) | 89,566 | 0.0018 |
| 6 | Tab #1: payer requestClose | [0x92192abf…de87](https://explorer.arc.io/tx/0x92192abfec0e9f8e94d548fdf6910a0a4ba6a4f98eaa5de8add9038ab974de87) | 32,876 | 0.0007 |
| 7 | Tab #1: finalize after the delay (refund 0.04) | [0x9b95657f…7f4f](https://explorer.arc.io/tx/0x9b95657f193830e2d2e5a995fbb57b0e0cbc6cf0464490d3217dc0ab4fa97f4f) | 62,234 | 0.0013 |
| 8 | Tab #2: approve | [0x4467a4da…8cb2](https://explorer.arc.io/tx/0x4467a4dae6bbed44082dd1ebc08b1c62e94504e12de102762894e1af3f338cb2) | 55,426 | 0.0011 |
| 9 | Tab #2: open (0.03 USDC, provider agent #2315) | [0xf6ed840a…716d](https://explorer.arc.io/tx/0xf6ed840a79b074ae081f9c606071fec60fe0ec882d6b2685067676eede16716d) | 153,786 | 0.0031 |
| 10 | Tab #2: closeByProvider (redeem 0.004, refund 0.026) | [0x7fb1f8d6…f4c9](https://explorer.arc.io/tx/0x7fb1f8d618a97bf92f0fdd272424e7a7e34d8d58dae8c9258cfdf596a258f4c9) | 113,392 | 0.0023 |
| 11 | Tab #3: approve | [0x38d46861…6f56](https://explorer.arc.io/tx/0x38d468614cfe4e5737124938a754b72e688b6b0e64eb40fdd47ba123f43f6f56) | 55,426 | 0.0011 |
| 12 | Tab #3: open (0.05 USDC, 1 day delay, agent #2315), left open | [0x02bfb271…2733](https://explorer.arc.io/tx/0x02bfb271b75e89fd7530032d5663a81a1dc398d34cf1d03390c7c3a7e6d92733) | 153,798 | 0.0031 |
| 13 | Tab #3: provider redeems 3 calls (0.006 USDC) | [0x6ddefd05…bd96](https://explorer.arc.io/tx/0x6ddefd05ec89d30880bfbf614f572ec586c1006ec335fcd27d770fc61a94bd96) | 89,566 | 0.0018 |

Totals:

- 11 paid API calls were served. One more call failed upstream (HTTP 404) and was not charged.
- 3 settlement transactions covered all 11 calls.
- Total gas for the whole demo, including the deploy, was about **0.072 USDC**.

Tab #2's first call failed upstream. The paywall rolled the charge back, and the agent's next voucher re-used the same cumulative amount, which shows that failed calls cost the agent nothing.
