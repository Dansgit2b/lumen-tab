// Lumen Tab SDK — prepaid USDC tabs for pay-per-call APIs on Arc.
// Payer side:    signVoucher / TabPayer (fetch wrapper that answers HTTP 402 with a voucher)
// Provider side: verifyVoucher / lumenTabPaywall (Express middleware) / Settler (batch on-chain redeem)
import {
  createPublicClient, http, parseUnits, formatUnits, isAddressEqual, decodeEventLog,
} from "viem";
import { arc } from "viem/chains";
import { lumenTabAbi, erc20Abi } from "./abi.mjs";
import { JsonFileStore, MemoryStore } from "./store.mjs";

export { lumenTabAbi, erc20Abi, JsonFileStore, MemoryStore, arc };

/** Canonical deployment on Arc mainnet (chain id 5042). */
export const ARC_MAINNET = Object.freeze({
  chainId: 5042,
  lumenTab: "0xb4a0364c58B2DF53e25FfF0463B5434160Ed2B50",
  usdc: "0x3600000000000000000000000000000000000000", // native USDC, ERC-20 interface (6 decimals)
  rpc: "https://rpc.mainnet.arc.io",
  explorer: "https://explorer.arc.io",
});

export const HEADER = "x-lumen-tab";          // request: voucher
export const RECEIPT_HEADER = "x-lumen-tab-receipt"; // response: what was charged
export const SCHEME = "lumen-tab-v1";

export const usdc = (x) => parseUnits(String(x), 6);
export const fmtUsdc = (x) => formatUnits(BigInt(x), 6);

export function defaultPublicClient(rpc = ARC_MAINNET.rpc) {
  return createPublicClient({ chain: arc, transport: http(rpc) });
}

// ---------------------------------------------------------------- vouchers

export function voucherTypedData({ tabId, cumulative, contract = ARC_MAINNET.lumenTab, chainId = ARC_MAINNET.chainId }) {
  return {
    domain: { name: "LumenTab", version: "1", chainId, verifyingContract: contract },
    types: { Voucher: [{ name: "tabId", type: "uint256" }, { name: "cumulative", type: "uint128" }] },
    primaryType: "Voucher",
    message: { tabId: BigInt(tabId), cumulative: BigInt(cumulative) },
  };
}

/** Sign a cumulative voucher with a viem Account (local) or WalletClient. */
export async function signVoucher(signer, { tabId, cumulative, contract, chainId }) {
  return signer.signTypedData(voucherTypedData({ tabId, cumulative, contract, chainId }));
}

export function encodeVoucher({ tabId, cumulative, signature }) {
  const json = JSON.stringify({ s: SCHEME, t: String(tabId), c: String(cumulative), sig: signature });
  return Buffer.from(json).toString("base64url");
}

export function decodeVoucher(header) {
  const o = JSON.parse(Buffer.from(String(header), "base64url").toString("utf8"));
  if (o.s !== SCHEME) throw new Error("unknown voucher scheme");
  if (!/^\d{1,78}$/.test(o.t) || !/^\d{1,39}$/.test(o.c)) throw new Error("malformed voucher numbers");
  if (!/^0x[0-9a-fA-F]+$/.test(o.sig)) throw new Error("malformed signature");
  return { tabId: BigInt(o.t), cumulative: BigInt(o.c), signature: o.sig };
}

/**
 * Verify a voucher against live on-chain tab state. Works for EOAs and ERC-1271
 * smart-account signers (viem's publicClient.verifyTypedData handles both).
 */
export async function verifyVoucher(publicClient, v, { contract = ARC_MAINNET.lumenTab, chainId = ARC_MAINNET.chainId, tab } = {}) {
  tab ??= await readTab(publicClient, v.tabId, contract);
  if (tab.payer === "0x0000000000000000000000000000000000000000") return { ok: false, reason: "unknown tab" };
  if (tab.closed) return { ok: false, reason: "tab closed" };
  if (v.cumulative > tab.deposited) return { ok: false, reason: "voucher exceeds deposit" };
  const ok = await publicClient.verifyTypedData({ address: tab.signer, signature: v.signature, ...voucherTypedData({ tabId: v.tabId, cumulative: v.cumulative, contract, chainId }) });
  return ok ? { ok: true, tab } : { ok: false, reason: "bad signature" };
}

export async function readTab(publicClient, tabId, contract = ARC_MAINNET.lumenTab) {
  const t = await publicClient.readContract({ address: contract, abi: lumenTabAbi, functionName: "getTab", args: [BigInt(tabId)] });
  return {
    payer: t.payer, provider: t.provider, signer: t.signer,
    closeDelay: Number(t.closeDelay), closeAt: Number(t.closeAt), closed: t.closed,
    deposited: BigInt(t.deposited), paid: BigInt(t.paid),
  };
}

// ---------------------------------------------------------------- payer

/**
 * TabPayer: wraps fetch(). When a server answers 402 with a lumen-tab-v1 offer for
 * this tab's provider, it signs the next cumulative voucher (+price) and retries.
 * `maxPerCall` caps what any single server may charge; `spent` is tracked locally.
 */
export class TabPayer {
  constructor({ account, tabId, provider, contract = ARC_MAINNET.lumenTab, chainId = ARC_MAINNET.chainId, maxPerCall = usdc("0.01"), cumulative = 0n, onVoucher }) {
    Object.assign(this, { account, tabId: BigInt(tabId), provider, contract, chainId, maxPerCall: BigInt(maxPerCall), cumulative: BigInt(cumulative), onVoucher });
  }
  async voucherFor(price) {
    price = BigInt(price);
    if (price > this.maxPerCall) throw new Error(`price ${fmtUsdc(price)} exceeds maxPerCall ${fmtUsdc(this.maxPerCall)}`);
    const cumulative = this.cumulative + price;
    const signature = await signVoucher(this.account, { tabId: this.tabId, cumulative, contract: this.contract, chainId: this.chainId });
    return { tabId: this.tabId, cumulative, signature };
  }
  async fetch(url, init = {}) {
    let res = await fetch(url, init);
    if (res.status !== 402) return res;
    const offer = await res.clone().json().catch(() => null);
    const o = offer?.accepts?.find((a) => a.scheme === SCHEME);
    if (!o) return res;
    if (Number(o.chainId) !== this.chainId || !isAddressEqual(o.contract, this.contract)) throw new Error("402 offer is for a different chain/contract");
    if (this.provider && !isAddressEqual(o.provider, this.provider)) throw new Error("402 offer is for a different provider than this tab");
    const v = await this.voucherFor(o.price);
    const headers = new Headers(init.headers);
    headers.set(HEADER, encodeVoucher(v));
    res = await fetch(url, { ...init, headers });
    if (res.ok) {
      this.cumulative = v.cumulative; // only advance once the server accepted it
      this.onVoucher?.(v, res);
    }
    return res;
  }
}

// ---------------------------------------------------------------- provider

/**
 * Express middleware. Charges `price` (USDC base units, 6 dp) per request.
 * Off-chain checks only (no gas per call); settlement happens in Settler.
 */
export function lumenTabPaywall({ provider, price, store, publicClient = defaultPublicClient(), contract = ARC_MAINNET.lumenTab, chainId = ARC_MAINNET.chainId, description = "", tabCacheMs = 5_000 }) {
  price = BigInt(price);
  const cache = new Map();
  const getTab = async (id) => {
    const c = cache.get(id);
    if (c && Date.now() - c.at < tabCacheMs) return c.tab;
    const tab = await readTab(publicClient, id, contract);
    cache.set(id, { at: Date.now(), tab });
    return tab;
  };
  const offer = (req, error) => ({
    error: error ?? "payment required",
    accepts: [{
      scheme: SCHEME, chainId, contract, provider, price: price.toString(), priceUsdc: fmtUsdc(price),
      asset: ARC_MAINNET.usdc, resource: req.originalUrl, description,
      howTo: "Open a tab with LumenTab.open(provider, signer, amount, closeDelay, agentId), then send header " + HEADER + ": base64url({s,t,c,sig}) where sig is an EIP-712 Voucher(tabId,cumulative) for previous+price.",
    }],
  });
  return async function paywall(req, res, next) {
    const h = req.get(HEADER);
    if (!h) return res.status(402).json(offer(req));
    let v;
    try { v = decodeVoucher(h); } catch (e) { return res.status(402).json(offer(req, "bad voucher: " + e.message)); }
    try {
      const tab = await getTab(v.tabId);
      if (!isAddressEqual(tab.provider, provider)) return res.status(402).json(offer(req, "tab is for another provider"));
      if (tab.closeAt !== 0) return res.status(402).json(offer(req, "tab is closing; open a new one"));
      const prev = store.get(v.tabId)?.cumulative ?? tab.paid;
      const base = prev > tab.paid ? prev : tab.paid;
      if (v.cumulative - base < price) return res.status(402).json(offer(req, `voucher must be >= ${(base + price).toString()} (last accepted ${base})`));
      const r = await verifyVoucher(publicClient, v, { contract, chainId, tab });
      if (!r.ok) return res.status(402).json(offer(req, r.reason));
      // atomic check-and-set (single process): reject if a concurrent request already moved the high-water mark
      if (!store.accept(v.tabId, v.cumulative, v.signature, base)) return res.status(409).json({ error: "concurrent voucher, retry" });
      res.set(RECEIPT_HEADER, JSON.stringify({ tabId: v.tabId.toString(), cumulative: v.cumulative.toString(), charged: (v.cumulative - base).toString() }));
      req.lumenTab = { tabId: v.tabId, cumulative: v.cumulative, charged: v.cumulative - base, payer: tab.payer,
        refund: () => store.rollback(v.tabId, v.cumulative) };
      // if the handler fails (status >= 400), un-charge: the payer re-signs the same cumulative next time,
      // so the retained signature can never be redeemed for more than what was actually delivered.
      res.on("finish", () => { if (res.statusCode >= 400) store.rollback(v.tabId, v.cumulative); });
      next();
    } catch (e) {
      res.status(503).json({ error: "verification unavailable: " + (e.shortMessage ?? e.message) });
    }
  };
}

/**
 * Settler: periodically redeems the best voucher held for each tab once the
 * unredeemed amount crosses `minRedeem`, and immediately when the payer has
 * requested close (so the provider never loses earned funds).
 */
export class Settler {
  constructor({ walletClient, publicClient = defaultPublicClient(), store, contract = ARC_MAINNET.lumenTab, minRedeem = usdc("0.05"), log = console.log }) {
    Object.assign(this, { walletClient, publicClient, store, contract, minRedeem: BigInt(minRedeem), log });
  }
  async tick({ force = false } = {}) {
    const out = [];
    for (const [tabId, best] of this.store.entries()) {
      const tab = await readTab(this.publicClient, tabId, this.contract);
      if (tab.closed) continue;
      const owed = best.cumulative - tab.paid;
      if (owed <= 0n) continue;
      if (!force && owed < this.minRedeem && tab.closeAt === 0) continue;
      const hash = await this.walletClient.writeContract({ address: this.contract, abi: lumenTabAbi, functionName: "redeem", args: [tabId, best.cumulative, best.signature] });
      const rcpt = await this.publicClient.waitForTransactionReceipt({ hash });
      this.log(`[settler] redeemed tab ${tabId}: +${fmtUsdc(owed)} USDC  tx ${hash} (${rcpt.status})`);
      out.push({ tabId, amount: owed, hash, status: rcpt.status });
    }
    return out;
  }
  /** Cooperative close: redeem the best voucher and refund the remainder to the payer in one tx. */
  async closeTab(tabId) {
    tabId = BigInt(tabId);
    const best = this.store.get(tabId);
    const tab = await readTab(this.publicClient, tabId, this.contract);
    const useVoucher = best && best.cumulative > tab.paid;
    const hash = await this.walletClient.writeContract({ address: this.contract, abi: lumenTabAbi, functionName: "closeByProvider", args: [tabId, useVoucher ? best.cumulative : 0n, useVoucher ? best.signature : "0x"] });
    const rcpt = await this.publicClient.waitForTransactionReceipt({ hash });
    this.log(`[settler] closed tab ${tabId} tx ${hash} (${rcpt.status})`);
    return { hash, status: rcpt.status };
  }
}

// ---------------------------------------------------------------- payer on-chain helpers

/** approve (if needed) + open. Returns { tabId, hashes }. */
export async function openTab({ walletClient, publicClient = defaultPublicClient(), provider, signer, amount, closeDelay = 3600, providerAgentId = 0n, contract = ARC_MAINNET.lumenTab, usdcAddress = ARC_MAINNET.usdc }) {
  const owner = walletClient.account.address;
  const hashes = [];
  const allowance = await publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: "allowance", args: [owner, contract] });
  if (allowance < BigInt(amount)) {
    const h = await walletClient.writeContract({ address: usdcAddress, abi: erc20Abi, functionName: "approve", args: [contract, BigInt(amount)] });
    await publicClient.waitForTransactionReceipt({ hash: h });
    hashes.push({ step: "approve", hash: h });
  }
  const h = await walletClient.writeContract({ address: contract, abi: lumenTabAbi, functionName: "open", args: [provider, signer ?? owner, BigInt(amount), BigInt(closeDelay), BigInt(providerAgentId)] });
  const rcpt = await publicClient.waitForTransactionReceipt({ hash: h });
  hashes.push({ step: "open", hash: h });
  let tabId;
  for (const l of rcpt.logs) {
    if (!isAddressEqual(l.address, contract)) continue;
    try { const ev = decodeEventLog({ abi: lumenTabAbi, data: l.data, topics: l.topics }); if (ev.eventName === "TabOpened") tabId = ev.args.tabId; } catch {}
  }
  return { tabId, hashes, status: rcpt.status };
}
