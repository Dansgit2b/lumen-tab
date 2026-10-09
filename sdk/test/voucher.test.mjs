// Off-chain SDK tests. The digest check compares against the deployed contract's
// voucherDigest() on Arc mainnet when ONLINE=1, otherwise it checks local consistency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { hashTypedData, recoverTypedDataAddress } from "viem";
import { voucherTypedData, signVoucher, encodeVoucher, decodeVoucher, MemoryStore, ARC_MAINNET, defaultPublicClient, lumenTabAbi } from "../index.mjs";

const acct = privateKeyToAccount(generatePrivateKey());

test("voucher round-trips through header encoding and recovers the signer", async () => {
  const sig = await signVoucher(acct, { tabId: 7n, cumulative: 12345n });
  const v = decodeVoucher(encodeVoucher({ tabId: 7n, cumulative: 12345n, signature: sig }));
  assert.equal(v.tabId, 7n); assert.equal(v.cumulative, 12345n);
  const who = await recoverTypedDataAddress({ ...voucherTypedData(v), signature: v.signature });
  assert.equal(who, acct.address);
});

test("decodeVoucher rejects junk", () => {
  assert.throws(() => decodeVoucher(Buffer.from('{"s":"x"}').toString("base64url")));
  assert.throws(() => decodeVoucher(Buffer.from('{"s":"lumen-tab-v1","t":"-1","c":"1","sig":"0x00"}').toString("base64url")));
});

test("store compare-and-set prevents double acceptance of the same base", () => {
  const s = new MemoryStore();
  assert.equal(s.accept(1n, 10n, "0x01", 0n), true);
  assert.equal(s.accept(1n, 10n, "0x02", 0n), false); // concurrent request built on the same base
  assert.equal(s.accept(1n, 20n, "0x03", 10n), true);
  assert.equal(s.get(1n).cumulative, 20n);
});

test("EIP-712 digest matches the deployed contract", { skip: process.env.ONLINE !== "1" }, async () => {
  const pc = defaultPublicClient();
  const onchain = await pc.readContract({ address: ARC_MAINNET.lumenTab, abi: lumenTabAbi, functionName: "voucherDigest", args: [3n, 999n] });
  assert.equal(onchain, hashTypedData(voucherTypedData({ tabId: 3n, cumulative: 999n })));
});

test("rollback restores the previous high-water mark", () => {
  const s = new MemoryStore();
  s.accept(1n, 10n, "0x01", 0n);
  s.accept(1n, 20n, "0x02", 10n);
  assert.equal(s.rollback(1n, 20n), true);
  assert.equal(s.get(1n).cumulative, 10n);
  assert.equal(s.accept(1n, 20n, "0x03", 10n), true); // same cumulative re-signed after a failed call
});
