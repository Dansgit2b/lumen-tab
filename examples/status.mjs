// Print on-chain state of tabs:  node examples/status.mjs [tabId...]
import { defaultPublicClient, readTab, fmtUsdc, lumenTabAbi, ARC_MAINNET } from "../sdk/index.mjs";
const pc = defaultPublicClient();
const next = await pc.readContract({ address: ARC_MAINNET.lumenTab, abi: lumenTabAbi, functionName: "nextTabId" });
const ids = process.argv.length > 2 ? process.argv.slice(2).map(BigInt) : Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
for (const id of ids) {
  const t = await readTab(pc, id);
  console.log(`tab #${id} payer=${t.payer} provider=${t.provider} deposited=${fmtUsdc(t.deposited)} paid=${fmtUsdc(t.paid)} ${t.closed ? "CLOSED" : t.closeAt ? `closing@${new Date(t.closeAt * 1000).toISOString()}` : "open"}`);
}
