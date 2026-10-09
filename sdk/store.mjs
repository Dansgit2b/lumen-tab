// Voucher stores: keep only the highest accepted voucher per tab (that is all the provider needs).
import fs from "node:fs";

export class MemoryStore {
  constructor() { this.m = new Map(); }
  get(tabId) { return this.m.get(BigInt(tabId)); }
  entries() { return [...this.m.entries()]; }
  /** Atomic compare-and-set: succeeds only if the stored high-water mark is still `expectedBase` (or lower). */
  accept(tabId, cumulative, signature, expectedBase) {
    tabId = BigInt(tabId);
    const cur = this.m.get(tabId);
    if (cur && cur.cumulative > expectedBase) return false;
    this.m.set(tabId, { cumulative: BigInt(cumulative), signature, at: Date.now(), prev: cur ?? null });
    this.persist?.();
    return true;
  }
  /** Undo the last accept for a tab (used when the paid request failed, so the payer is not charged). */
  rollback(tabId, cumulative) {
    tabId = BigInt(tabId);
    const cur = this.m.get(tabId);
    if (!cur || cur.cumulative !== BigInt(cumulative)) return false;
    if (cur.prev) this.m.set(tabId, cur.prev); else this.m.delete(tabId);
    this.persist?.();
    return true;
  }
}

export class JsonFileStore extends MemoryStore {
  constructor(path) {
    super();
    this.path = path;
    if (fs.existsSync(path)) {
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path, "utf8"))))
        this.m.set(BigInt(k), { ...v, cumulative: BigInt(v.cumulative) });
    }
  }
  persist() {
    const o = Object.fromEntries([...this.m].map(([k, v]) => [k.toString(), { cumulative: v.cumulative.toString(), signature: v.signature, at: v.at }]));
    fs.writeFileSync(this.path + ".tmp", JSON.stringify(o, null, 2));
    fs.renameSync(this.path + ".tmp", this.path);
  }
}
