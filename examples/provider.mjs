// Paid API provider: URL -> clean Markdown for agents, 0.002 USDC per call, paid via Lumen Tab vouchers.
//   PROVIDER_PRIVATE_KEY=...  node examples/provider.mjs
// Calls cost the agent zero gas; the provider batches settlement on Arc with the Settler.
import express from "express";
import { RECEIPT_HEADER, lumenTabPaywall, Settler, JsonFileStore, defaultPublicClient, usdc, fmtUsdc, ARC_MAINNET } from "../sdk/index.mjs";
import { accountFromEnv, walletFor } from "./common.mjs";
import { extractUrl, assertSafePublicUrl } from "./lib/extract.mjs";
import fs from "node:fs";

const PORT = Number(process.env.PORT ?? 8402);
const PRICE = usdc(process.env.PRICE_USDC ?? "0.002");
const account = accountFromEnv("PROVIDER_PRIVATE_KEY");
fs.mkdirSync(".demo", { recursive: true });
const store = new JsonFileStore(process.env.STORE ?? ".demo/provider-vouchers.json");
const publicClient = defaultPublicClient();
const settler = new Settler({ walletClient: walletFor(account), publicClient, store, minRedeem: usdc(process.env.MIN_REDEEM_USDC ?? "0.05") });

const app = express();
app.disable("x-powered-by");
app.get("/", (_req, res) => res.json({
  service: "Lumenworks extract — URL to Markdown for AI agents",
  pricing: { perCall: fmtUsdc(PRICE) + " USDC", scheme: "lumen-tab-v1", chainId: ARC_MAINNET.chainId, contract: ARC_MAINNET.lumenTab, provider: account.address },
  endpoints: { "GET /v1/extract?url=": "paid", "GET /tabs": "provider-side voucher state" },
}));
app.get("/tabs", (_req, res) => res.json(Object.fromEntries(store.entries().map(([k, v]) => [k.toString(), { cumulative: fmtUsdc(v.cumulative) }]))));

app.get("/v1/extract",
  // validate input BEFORE charging, so a bad request never costs the agent anything
  async (req, res, next) => {
    try { await assertSafePublicUrl(String(req.query.url ?? "")); next(); }
    catch (e) { res.status(400).json({ error: e.message }); }
  },
  lumenTabPaywall({ provider: account.address, price: PRICE, store, publicClient, description: "URL to clean Markdown (title, byline, markdown)" }),
  async (req, res) => {
    try {
      const out = await extractUrl(String(req.query.url));
      res.json({ ...out, paid: { tabId: req.lumenTab.tabId.toString(), charged: fmtUsdc(req.lumenTab.charged), cumulative: fmtUsdc(req.lumenTab.cumulative) } });
    } catch (e) {
      // delivery failed: the paywall rolls the charge back (status >= 400), so the agent pays nothing
      res.removeHeader(RECEIPT_HEADER);
      res.status(502).json({ error: e.message, charged: "0" });
    }
  });

app.listen(PORT, () => console.log(`[provider] ${account.address} listening on :${PORT}, ${fmtUsdc(PRICE)} USDC/call`));
const every = Number(process.env.SETTLE_EVERY_S ?? 60) * 1000;
setInterval(() => settler.tick().catch((e) => console.error("[settler]", e.shortMessage ?? e.message)), every);
process.on("SIGUSR2", () => settler.tick({ force: true }).catch(console.error));
