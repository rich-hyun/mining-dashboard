// VYD 언래핑(소각) 이벤트 감시 → Verus로 VRSC 송금 → 컨트랙트에 완료 기록
import { db, kv, now } from "./db.js";
import { config } from "./config.js";
import { verusApi } from "./verus.js";
import { provider, token, TX_OPTS, resetNonce } from "./evm.js";
import { toSats, fromSats } from "./amount.js";
import { log } from "./log.js";

const feeSats = toSats(config.verus.redeemFee);
const CHUNK = 2000;

const ins = db.prepare(`INSERT OR IGNORE INTO redemptions
  (nonce, evm_address, amount_sats, verus_address, request_tx, request_block, status, created_at, updated_at)
  VALUES (?,?,?,?,?,?,'queued',?,?)`);
const upd = db.prepare(
  "UPDATE redemptions SET status=?, verus_txid=COALESCE(?, verus_txid), mark_tx=COALESCE(?, mark_tx), error=?, updated_at=? WHERE nonce=?"
);

/** UnwrapRequested 이벤트를 확정 블록까지 읽어 큐에 넣음 */
export async function scanUnwraps() {
  const head = (await provider.getBlockNumber()) - config.vyd.confirmations;
  let from = Number(kv.get("unwrap_scan_from", config.vyd.deployBlock));
  if (head < from) return;

  const filter = token.filters.UnwrapRequested();
  while (from <= head) {
    const to = Math.min(from + CHUNK - 1, head);
    const logs = await token.queryFilter(filter, from, to);
    for (const ev of logs) {
      const { nonce, from: who, amount, verusAddress } = ev.args;
      const r = ins.run(
        Number(nonce),
        who.toLowerCase(),
        amount.toString(),
        verusAddress,
        ev.transactionHash,
        ev.blockNumber,
        now(),
        now()
      );
      if (r.changes) log.info(`언래핑 요청 #${nonce} ${fromSats(amount)} → ${verusAddress}`);
    }
    from = to + 1;
    kv.set("unwrap_scan_from", from);
  }
}

/** 재시작 시: 송금 도중 멈춘 건은 이중 송금 위험이 있어 사람이 확인하도록 돌림 */
export function recoverSending() {
  const r = db
    .prepare("UPDATE redemptions SET status='manual_review', error='송금 중 서버 중단 — Verus 지갑에서 송금 여부 확인 필요', updated_at=? WHERE status='sending'")
    .run(now());
  if (r.changes) log.warn(`확인 필요 언래핑 ${r.changes}건`);
}

export async function processRedemptions() {
  // 1) 송금은 끝났는데 완료 기록을 못 한 건
  for (const r of db.prepare("SELECT * FROM redemptions WHERE status='sent' ORDER BY nonce").all()) {
    await markDone(r);
  }

  // 2) 대기 건 송금
  const queued = db.prepare("SELECT * FROM redemptions WHERE status='queued' ORDER BY nonce LIMIT 20").all();
  for (const r of queued) {
    if (await token.redeemed(r.nonce)) {
      upd.run("done", null, null, null, now(), r.nonce);
      continue;
    }
    const v = await verusApi.validateAddress(r.verus_address);
    if (!v?.isvalid) {
      upd.run("manual_review", null, null, "유효하지 않은 Verus 주소 — 관리자 환불 필요", now(), r.nonce);
      continue;
    }
    const payout = BigInt(r.amount_sats) - feeSats;
    if (payout <= 0n) {
      upd.run("manual_review", null, null, "수수료보다 작은 금액", now(), r.nonce);
      continue;
    }
    const available = toSats(await verusApi.balance(1));
    if (available < payout) {
      upd.run("queued", null, null, `준비금 부족 (보유 ${fromSats(available)} VRSC)`, now(), r.nonce);
      log.warn(`준비금 부족으로 언래핑 #${r.nonce} 대기`);
      break; // 순서 보장
    }

    // 송금 직전 상태를 먼저 기록 → 송금 중 서버가 죽어도 재송금하지 않음
    upd.run("sending", null, null, null, now(), r.nonce);
    let txid;
    try {
      txid = await verusApi.send(r.verus_address, fromSats(payout));
    } catch (e) {
      // RPC가 명확히 거부한 경우만 다시 대기로 돌림
      upd.run("queued", null, null, `송금 실패: ${e.message}`.slice(0, 500), now(), r.nonce);
      log.error(`언래핑 #${r.nonce} 송금 실패: ${e.message}`);
      break;
    }
    upd.run("sent", txid, null, null, now(), r.nonce);
    log.info(`언래핑 #${r.nonce} 송금 완료 ${txid}`);
    await markDone({ ...r, verus_txid: txid });
  }
}

async function markDone(r) {
  try {
    if (await token.redeemed(r.nonce)) {
      upd.run("done", null, null, null, now(), r.nonce);
      return;
    }
    const tx = await token.markRedeemed(r.nonce, r.verus_txid, TX_OPTS);
    const rc = await tx.wait(1, 120_000);
    if (rc.status !== 1) throw new Error("markRedeemed revert");
    upd.run("done", null, tx.hash, null, now(), r.nonce);
  } catch (e) {
    resetNonce();
    upd.run("sent", null, null, `완료 기록 실패(재시도): ${e.shortMessage || e.message}`.slice(0, 500), now(), r.nonce);
  }
}
