// 대시보드용 상태를 주기적으로 모아 캐시 (요청마다 노드를 두드리지 않도록)
import { db, kv } from "./db.js";
import { config } from "./config.js";
import { verusApi } from "./verus.js";
import { provider, token } from "./evm.js";
import { fromSats, toSats } from "./amount.js";
import { log } from "./log.js";

let cache = { updatedAt: 0 };
export const getStats = () => cache;

const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k] !== undefined) return o[k];
  return null;
};

export async function refreshStats() {
  const out = { updatedAt: Date.now(), errors: [] };

  try {
    const [chain, mining, bal] = await Promise.all([
      verusApi.blockchainInfo(),
      verusApi.miningInfo(),
      verusApi.balance(1),
    ]);
    out.verus = {
      blocks: chain.blocks,
      headers: chain.headers,
      syncProgress: pick(chain, "verificationprogress"),
      reserve: fromSats(toSats(bal)),
    };
    out.mining = {
      generate: !!pick(mining, "generate"),
      threads: pick(mining, "genproclimit"),
      localHashps: pick(mining, "localhashps", "localsolps"),
      networkHashps: pick(mining, "networkhashps", "networksolps"),
      difficulty: pick(mining, "difficulty"),
      miningAddress: kv.get("mining_address"),
    };
  } catch (e) {
    out.errors.push(`Verus: ${e.message}`);
  }

  try {
    const [block, supply, paused] = await Promise.all([
      provider.getBlock("latest"),
      token.totalSupply(),
      token.paused(),
    ]);
    out.vyd = {
      block: block.number,
      blockTime: block.timestamp,
      supply: fromSats(supply),
      paused,
    };
  } catch (e) {
    out.errors.push(`VYD: ${e.shortMessage || e.message}`);
  }

  // 준비금 증명: Verus 보유량 ≥ 유통량 + 송금 대기분 이어야 정상
  if (out.verus && out.vyd) {
    const pendingOut = db
      .prepare("SELECT amount_sats FROM redemptions WHERE status IN ('queued','sending','manual_review')")
      .all()
      .reduce((s, r) => s + BigInt(r.amount_sats), 0n);
    const reserve = toSats(out.verus.reserve);
    const liabilities = toSats(out.vyd.supply) + pendingOut;
    out.proof = {
      reserve: out.verus.reserve,
      liabilities: fromSats(liabilities),
      pendingRedemptions: fromSats(pendingOut),
      ratio: liabilities === 0n ? null : Number((reserve * 10000n) / liabilities) / 100,
      healthy: reserve >= liabilities,
    };
  }

  out.counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM deposits WHERE status='minted') AS minted,
        (SELECT COUNT(*) FROM deposits WHERE status IN ('pending','minting','failed')) AS pendingDeposits,
        (SELECT COUNT(*) FROM redemptions WHERE status='done') AS redeemed,
        (SELECT COUNT(*) FROM redemptions WHERE status!='done') AS openRedemptions,
        (SELECT COUNT(*) FROM deposits WHERE category='generate') AS blocksMined`
    )
    .get();

  if (out.errors.length) log.warn("상태 수집 오류:", out.errors.join(" | "));
  cache = out;
  return out;
}

export function publicConfig() {
  return {
    chainId: config.vyd.chainId,
    chainIdHex: "0x" + config.vyd.chainId.toString(16),
    rpc: config.vyd.rpc,
    token: config.vyd.token,
    decimals: 8,
    verusMinConf: config.verus.minConf,
    minDeposit: config.verus.minDeposit,
    redeemFee: config.verus.redeemFee,
  };
}
