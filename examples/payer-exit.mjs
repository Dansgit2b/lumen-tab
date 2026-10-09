// Payer's unilateral exit (no provider cooperation needed):
//   node examples/payer-exit.mjs request <tabId>   -> starts the close delay (provider can still redeem during it)
//   node examples/payer-exit.mjs finalize <tabId>  -> after the delay, refunds deposited - paid to the payer (anyone may call)
import { defaultPublicClient, lumenTabAbi, ARC_MAINNET, readTab, fmtUsdc } from "../sdk/index.mjs";
import { accountFromEnv, walletFor, tx } from "./common.mjs";
const [cmd, id] = process.argv.slice(2);
const pc = defaultPublicClient();
const w = walletFor(accountFromEnv("PAYER_PRIVATE_KEY"));
const fn = { request: "requestClose", finalize: "finalize" }[cmd];
if (!fn || !id) throw new Error("usage: payer-exit.mjs request|finalize <tabId>");
const hash = await w.writeContract({ address: ARC_MAINNET.lumenTab, abi: lumenTabAbi, functionName: fn, args: [BigInt(id)] });
const r = await pc.waitForTransactionReceipt({ hash });
const t = await readTab(pc, BigInt(id));
console.log(`${fn}(${id}) ${r.status} ${tx(hash)}  -> paid=${fmtUsdc(t.paid)} closed=${t.closed} closeAt=${t.closeAt ? new Date(t.closeAt * 1000).toISOString() : "-"}`);
