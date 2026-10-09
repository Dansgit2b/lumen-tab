import { createWalletClient, http, parseGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc, ARC_MAINNET } from "../sdk/index.mjs";

export function accountFromEnv(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(`set ${name} (hex private key) in the environment`);
  return privateKeyToAccount(raw.startsWith("0x") ? raw : `0x${raw}`);
}

// Arc: USDC is the gas token; base fee floor is 20 gwei (in 18-dp native units).
export function walletFor(account, rpc = process.env.ARC_RPC ?? ARC_MAINNET.rpc) {
  return createWalletClient({
    account, chain: { ...arc, fees: { estimateFeesPerGas: async () => ({ maxFeePerGas: parseGwei("40"), maxPriorityFeePerGas: parseGwei("1") }) } },
    transport: http(rpc),
  });
}

export const tx = (h) => `${ARC_MAINNET.explorer}/tx/${h}`;
