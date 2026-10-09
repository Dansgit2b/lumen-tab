// Agent (payer): opens a USDC tab with the provider once, then pays per call with signed vouchers (no gas per call).
//   PAYER_PRIVATE_KEY=... PROVIDER_URL=http://localhost:8402 node examples/agent.mjs https://example.com https://...
//   TAB_ID=<n> reuses an existing tab; DEPOSIT_USDC sets the deposit for a new tab (default 0.05).
import fs from "node:fs";
import { TabPayer, openTab, defaultPublicClient, readTab, usdc, fmtUsdc, RECEIPT_HEADER } from "../sdk/index.mjs";
import { accountFromEnv, walletFor, tx } from "./common.mjs";

const base = process.env.PROVIDER_URL ?? "http://localhost:8402";
const urls = process.argv.slice(2);
const account = accountFromEnv("PAYER_PRIVATE_KEY");
const publicClient = defaultPublicClient();
const info = await (await fetch(base + "/")).json();
const provider = info.pricing.provider;
console.log(`[agent] ${account.address} -> provider ${provider} @ ${base} (${info.pricing.perCall}/call)`);

let tabId = process.env.TAB_ID ? BigInt(process.env.TAB_ID) : undefined;
if (!tabId) {
  const r = await openTab({ walletClient: walletFor(account), publicClient, provider, amount: usdc(process.env.DEPOSIT_USDC ?? "0.05"), closeDelay: Number(process.env.CLOSE_DELAY_S ?? 3600), providerAgentId: BigInt(process.env.PROVIDER_AGENT_ID ?? 0) });
  for (const h of r.hashes) console.log(`[agent] ${h.step}: ${tx(h.hash)}`);
  tabId = r.tabId;
  console.log(`[agent] opened tab #${tabId}`);
}
const tab = await readTab(publicClient, tabId);
// resume from our own last voucher (kept locally) or what the chain already settled
fs.mkdirSync(".demo", { recursive: true });
const statePath = `.demo/agent-tab-${tabId}.json`;
const saved = fs.existsSync(statePath) ? BigInt(JSON.parse(fs.readFileSync(statePath, "utf8")).cumulative) : 0n;
const payer = new TabPayer({
  account, tabId, provider, cumulative: saved > tab.paid ? saved : tab.paid, maxPerCall: usdc("0.01"),
  onVoucher: (v) => fs.writeFileSync(statePath, JSON.stringify({ cumulative: v.cumulative.toString() })),
});

for (const u of urls) {
  const res = await payer.fetch(`${base}/v1/extract?url=${encodeURIComponent(u)}`);
  const body = await res.json();
  const rc = res.headers.get(RECEIPT_HEADER);
  console.log(`[agent] ${res.status} ${u}  ${body.title ? `"${body.title.slice(0, 60)}" (${(body.markdown ?? "").length} chars md)` : body.error}  ${res.ok ? `receipt=${rc}` : "(not charged)"}`);
}
console.log(`[agent] tab #${tabId}: deposited ${fmtUsdc(tab.deposited)} USDC, signed so far ${fmtUsdc(payer.cumulative)} USDC`);
