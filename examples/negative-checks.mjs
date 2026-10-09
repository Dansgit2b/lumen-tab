// Shows the provider rejecting replayed, inflated and SSRF requests. Run while provider.mjs is up.
import fs from "node:fs";
import { encodeVoucher } from "../sdk/index.mjs";
const base = process.env.PROVIDER_URL ?? "http://localhost:8402";
const tabId = process.argv[2] ?? "1";
const s = JSON.parse(fs.readFileSync(".demo/provider-vouchers.json", "utf8"))[tabId];
const call = async (label, url, v) => {
  const r = await fetch(`${base}/v1/extract?url=${encodeURIComponent(url)}`, { headers: { "x-lumen-tab": encodeVoucher(v) } });
  console.log(`${label.padEnd(28)} -> HTTP ${r.status}: ${(await r.json()).error}`);
};
await call("replay last voucher", "https://example.com", { tabId, cumulative: BigInt(s.cumulative), signature: s.signature });
await call("inflate amount, reuse sig", "https://example.com", { tabId, cumulative: BigInt(s.cumulative) + 2000n, signature: s.signature });
await call("private-network URL", "http://169.254.169.254/latest", { tabId, cumulative: BigInt(s.cumulative) + 2000n, signature: s.signature });
