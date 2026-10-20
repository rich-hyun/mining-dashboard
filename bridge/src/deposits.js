// Verus 입금·채굴 보상 감시 → 확인 수 충족 시 VYD에서 래핑 토큰 발행
import { db, now } from "./db.js";
import { config } from "./config.js";
import { verusApi } from "./verus.js";
import { token, depositIdOf, TX_OPTS, resetNonce } from "./evm.js";
import { toSats } from "./amount.js";
import { log } from "./log.js";

const minDepositSats = toSats(config.verus.minDeposit);

const findAddr = db.prepare("SELECT evm_address FROM deposit_addresses WHERE verus_address=?");
const getDep = db.prepare("SELECT * FROM deposits WHERE id=?");
const insDep = db.prepare(`INSERT INTO deposits
  (id, txid, vout, verus_address, evm_address, amount_sats, category, confirmations, status, deposit_id, created_at, updated_at)
  VALUES (@id,@txid,@vout,@verus_address,@evm_address,@amount_sats,@category,@confirmations,'pending',@deposit_id,@t,@t)`);
const updConf = db.prepare("UPDATE deposits SET confirmations=?, updated_at=? WHERE id=? AND status IN ('pending','failed')");
const setStatus = db.prepare("UPDATE deposits SET status=?, mint_tx=COALESCE(?, mint_tx), error=?, updated_at=? WHERE id=?");

/** Verus 지갑의 최근 거래를 읽어 우리 입금 주소로 들어온 것을 DB에 반영 */
export async function scanDeposits() {
  const txs = await verusApi.listTransactions(1000, 0);
  for (const tx of txs) {
    // receive: 사용자 입금·풀 채굴 지급금 / generate: 솔로 채굴 코인베이스(성숙 완료분만)
    if (tx.category !== "receive" && tx.category !== "generate") continue;
    if (!(tx.amount > 0) || !tx.address) continue;

    let evm;
    if (tx.category === "generate") {
      if (!config.miningRewardEvm) continue;
      evm = config.miningRewardEvm.toLowerCase();
    } else {
      const row = findAddr.get(tx.address);
      if (!row) continue; // 우리가 발급하지 않은 주소 (예: 준비금 보충용)
      evm = row.evm_address;
    }

    const vout = Number(tx.vout ?? 0);
    const id = `${tx.txid}:${vout}`;
    const conf = Number(tx.confirmations ?? 0);
    const existing = getDep.get(id);
    if (!existing) {
      insDep.run({
        id,
        txid: tx.txid,
        vout,
        verus_address: tx.address,
        evm_address: evm,
        amount_sats: toSats(tx.amount).toString(),
        category: tx.category,
        confirmations: conf,
        deposit_id: depositIdOf(tx.txid, vout),
        t: now(),
      });
      log.info(`입금 감지 ${id} ${tx.amount} VRSC → ${evm} (${tx.category}, 확인 ${conf})`);
    } else {
      updConf.run(conf, now(), id);
    }
  }
}

/** 재시작 시 'minting' 상태로 남은 건 정리 (컨트랙트 중복 방지 덕분에 안전) */
export async function recoverMinting() {
  const rows = db.prepare("SELECT * FROM deposits WHERE status='minting'").all();
  for (const d of rows) {
    const done = await token.processedDeposits(d.deposit_id);
    setStatus.run(done ? "minted" : "pending", null, done ? null : "재시작 후 재시도", now(), d.id);
  }
}

/** 확인 수를 채운 입금을 순서대로 발행 */
export async function mintReadyDeposits() {
  const rows = db
    .prepare("SELECT * FROM deposits WHERE status IN ('pending','failed') AND confirmations >= ? ORDER BY created_at LIMIT 20")
    .all(config.verus.minConf);

  for (const d of rows) {
    if (BigInt(d.amount_sats) < minDepositSats) {
      setStatus.run("too_small", null, `최소 입금 ${config.verus.minDeposit} VRSC 미만`, now(), d.id);
      continue;
    }
    try {
      setStatus.run("minting", null, null, now(), d.id);
      if (await token.processedDeposits(d.deposit_id)) {
        setStatus.run("minted", null, null, now(), d.id);
        continue;
      }
      const tx = await token.mintWrapped(d.evm_address, BigInt(d.amount_sats), d.deposit_id, d.txid, TX_OPTS);
      log.info(`발행 전송 ${d.id} → ${tx.hash}`);
      const rc = await tx.wait(1, 120_000);
      if (rc.status !== 1) throw new Error("발행 트랜잭션 실패(revert)");
      setStatus.run("minted", tx.hash, null, now(), d.id);
      log.info(`발행 완료 ${d.id}`);
    } catch (e) {
      resetNonce();
      log.error(`발행 실패 ${d.id}: ${e.shortMessage || e.message}`);
      setStatus.run("failed", null, String(e.shortMessage || e.message).slice(0, 500), now(), d.id);
    }
  }
}
