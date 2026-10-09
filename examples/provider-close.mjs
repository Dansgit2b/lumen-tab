// Provider cooperative close: redeem best voucher + refund the rest to the payer in one tx.
//   PROVIDER_PRIVATE_KEY=... node examples/provider-close.mjs <tabId>
import { Settler, JsonFileStore, defaultPublicClient } from "../sdk/index.mjs";
import { accountFromEnv, walletFor, tx } from "./common.mjs";
const s = new Settler({ walletClient: walletFor(accountFromEnv("PROVIDER_PRIVATE_KEY")), publicClient: defaultPublicClient(), store: new JsonFileStore(process.env.STORE ?? ".demo/provider-vouchers.json") });
const r = await s.closeTab(BigInt(process.argv[2]));
console.log(tx(r.hash));
