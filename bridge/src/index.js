import { config } from "./config.js";
import { db, kv, now } from "./db.js";
import { verusApi } from "./verus.js";
import { minter, token } from "./evm.js";
import { createApi } from "./api.js";
import { refreshStats } from "./stats.js";
import { scanDeposits, mintReadyDeposits, recoverMinting } from "./deposits.js";
import { scanUnwraps, processRedemptions, recoverSending } from "./redemptions.js";
import { log } from "./log.js";

/** 풀 채굴 지급금을 받을 Verus 주소를 한 번 만들어 MINING_REWARD_EVM 에 묶어 둔다 */
async function ensureMiningAddress() {
  if (!config.miningRewardEvm) return;
  let addr = kv.get("mining_address");
  if (!addr) {
    addr = await verusApi.newAddress();
    kv.set("mining_address", addr);
  }
  db.prepare(
    "INSERT INTO deposit_addresses(verus_address, evm_address, kind, created_at) VALUES (?,?, 'mining', ?) ON CONFLICT(verus_address) DO NOTHING"
  ).run(addr, config.miningRewardEvm.toLowerCase(), now());
  log.info(`채굴 지급 주소: ${addr} → ${config.miningRewardEvm}`);
}

async function preflight() {
  log.info(`브리지 지갑 ${minter.address}, 토큰 ${config.vyd.token}`);
  const ok = await token.hasRole(await token.MINTER_ROLE(), minter.address);
  if (!ok) log.warn("⚠ 브리지 지갑에 MINTER_ROLE이 없습니다 — contracts/scripts/grant-minter.js 실행 필요");
  const info = await verusApi.info();
  log.info(`Verus 노드 연결: 블록 ${info.blocks}, 버전 ${info.version}`);
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      log.error(`${name}: ${e.shortMessage || e.message}`);
    }
  };
  // VYD 트랜잭션은 이 루프 안에서만 순차 전송 → nonce 충돌 없음
  await step("입금 스캔", scanDeposits);
  await step("발행", mintReadyDeposits);
  await step("언래핑 스캔", scanUnwraps);
  await step("언래핑 처리", processRedemptions);
  await step("상태 수집", refreshStats);
  running = false;
}

async function main() {
  // 기본은 127.0.0.1 — 외부 공개는 nginx가 담당
  const host = process.env.HOST || "127.0.0.1";
  createApi().listen(config.port, host, () => log.info(`API 서버 ${host}:${config.port}`));

  // 노드가 아직 안 떠 있어도 API는 살아 있게 하고, 초기화는 재시도
  for (let i = 1; ; i++) {
    try {
      await preflight();
      await ensureMiningAddress();
      await recoverMinting();
      recoverSending();
      break;
    } catch (e) {
      log.warn(`초기화 재시도 ${i}: ${e.message}`);
      await new Promise((r) => setTimeout(r, Math.min(60_000, 5_000 * i)));
    }
  }

  await tick();
  setInterval(tick, config.pollMs);
}

process.on("SIGTERM", () => {
  log.info("종료");
  db.close();
  process.exit(0);
});

main().catch((e) => {
  log.error(e);
  process.exit(1);
});
