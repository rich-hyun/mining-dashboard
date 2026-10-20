import express from "express";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { ethers } from "ethers";
import { db, now, kv } from "./db.js";
import { config } from "./config.js";
import { verusApi } from "./verus.js";
import { getStats, publicConfig } from "./stats.js";
import { fromSats } from "./amount.js";
import { log } from "./log.js";

export const SIGN_PREFIX = "Mustree 래핑 입금 주소 요청";
export const signMessage = (evm, issuedAt) => `${SIGN_PREFIX}\n지갑: ${evm.toLowerCase()}\n시각: ${issuedAt}`;

const fmtDep = (d) => ({
  id: d.id,
  txid: d.txid,
  amount: fromSats(d.amount_sats),
  category: d.category,
  confirmations: d.confirmations,
  status: d.status,
  mintTx: d.mint_tx,
  error: d.error,
  createdAt: d.created_at,
});
const fmtRed = (r) => ({
  nonce: r.nonce,
  amount: fromSats(r.amount_sats),
  verusAddress: r.verus_address,
  requestTx: r.request_tx,
  status: r.status,
  verusTxid: r.verus_txid,
  markTx: r.mark_tx,
  error: r.error,
  createdAt: r.created_at,
});

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    log.error(req.method, req.path, e.message);
    res.status(500).json({ error: e.message });
  });

function adminOnly(req, res, next) {
  const got = Buffer.from((req.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(config.adminToken);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return res.status(401).json({ error: "관리자 토큰 오류" });
  next();
}

export function createApi() {
  const app = express();
  app.set("trust proxy", 1); // nginx 뒤에서 실행
  app.use(express.json({ limit: "20kb" }));
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

  app.get("/api/health", (_q, res) => res.json({ ok: true }));
  app.get("/api/config", (_q, res) => res.json(publicConfig()));
  app.get("/api/stats", (_q, res) => res.json(getStats()));

  // 입금 주소 발급: 지갑 서명으로 주소 소유를 증명해야 함
  app.post(
    "/api/deposit-address",
    rateLimit({ windowMs: 60_000, limit: 10 }),
    wrap(async (req, res) => {
      const { evmAddress, issuedAt, signature } = req.body || {};
      if (!ethers.isAddress(evmAddress)) return res.status(400).json({ error: "지갑 주소 형식 오류" });
      const t = Number(issuedAt);
      if (!t || Math.abs(Date.now() - t) > 10 * 60_000) return res.status(400).json({ error: "서명 시각이 만료되었습니다. 다시 시도하세요" });
      let signer;
      try {
        signer = ethers.verifyMessage(signMessage(evmAddress, t), signature);
      } catch {
        return res.status(400).json({ error: "서명 형식 오류" });
      }
      if (signer.toLowerCase() !== evmAddress.toLowerCase()) return res.status(401).json({ error: "서명이 지갑 주소와 다릅니다" });

      const evm = evmAddress.toLowerCase();
      const found = db.prepare("SELECT verus_address FROM deposit_addresses WHERE evm_address=? AND kind='user'").get(evm);
      if (found) return res.json({ depositAddress: found.verus_address, created: false });

      const addr = await verusApi.newAddress();
      db.prepare("INSERT INTO deposit_addresses(verus_address, evm_address, kind, created_at) VALUES (?,?, 'user', ?)").run(
        addr,
        evm,
        now()
      );
      log.info(`입금 주소 발급 ${evm} → ${addr}`);
      res.json({ depositAddress: addr, created: true });
    })
  );

  app.get(
    "/api/account/:evm",
    wrap(async (req, res) => {
      if (!ethers.isAddress(req.params.evm)) return res.status(400).json({ error: "지갑 주소 형식 오류" });
      const evm = req.params.evm.toLowerCase();
      const a = db.prepare("SELECT verus_address FROM deposit_addresses WHERE evm_address=? AND kind='user'").get(evm);
      res.json({
        depositAddress: a?.verus_address || null,
        deposits: db.prepare("SELECT * FROM deposits WHERE evm_address=? ORDER BY created_at DESC LIMIT 200").all(evm).map(fmtDep),
        redemptions: db.prepare("SELECT * FROM redemptions WHERE evm_address=? ORDER BY nonce DESC LIMIT 200").all(evm).map(fmtRed),
      });
    })
  );

  app.get(
    "/api/validate-address/:addr",
    rateLimit({ windowMs: 60_000, limit: 30 }),
    wrap(async (req, res) => {
      const addr = String(req.params.addr).trim();
      if (!/^[A-Za-z0-9@._-]{2,100}$/.test(addr)) return res.json({ valid: false });
      const v = await verusApi.validateAddress(addr);
      res.json({ valid: !!v?.isvalid, isMine: !!v?.ismine });
    })
  );

  app.get(
    "/api/mining",
    wrap(async (_q, res) => {
      const blocks = db
        .prepare("SELECT * FROM deposits WHERE category='generate' ORDER BY created_at DESC LIMIT 50")
        .all()
        .map(fmtDep);
      const payouts = db
        .prepare(
          "SELECT d.* FROM deposits d JOIN deposit_addresses a ON a.verus_address=d.verus_address WHERE a.kind='mining' ORDER BY d.created_at DESC LIMIT 50"
        )
        .all()
        .map(fmtDep);
      res.json({ ...getStats().mining, rewardEvm: config.miningRewardEvm, blocks, payouts });
    })
  );

  // ── 관리자 ──────────────────────────────
  const admin = express.Router();
  admin.use(adminOnly);

  admin.get(
    "/overview",
    wrap(async (_q, res) => {
      res.json({
        stats: getStats(),
        attentionDeposits: db
          .prepare("SELECT * FROM deposits WHERE status IN ('failed','too_small','minting') ORDER BY created_at DESC LIMIT 100")
          .all()
          .map((d) => ({ ...fmtDep(d), evmAddress: d.evm_address })),
        attentionRedemptions: db
          .prepare("SELECT * FROM redemptions WHERE status IN ('manual_review','sent','queued','sending') ORDER BY nonce")
          .all()
          .map((r) => ({ ...fmtRed(r), evmAddress: r.evm_address })),
        addressCount: db.prepare("SELECT COUNT(*) c FROM deposit_addresses").get().c,
      });
    })
  );

  admin.post(
    "/mining",
    wrap(async (req, res) => {
      const on = !!req.body?.on;
      const threads = Math.max(1, Math.min(64, Number(req.body?.threads) || 1));
      await verusApi.setGenerate(on, threads);
      log.info(`채굴 ${on ? `시작 (스레드 ${threads})` : "중지"}`);
      res.json({ ok: true, info: await verusApi.miningInfo() });
    })
  );

  // 확인 결과 송금되지 않았음 → 다시 송금 대기열로
  admin.post(
    "/redemptions/:nonce/retry",
    wrap(async (req, res) => {
      const r = db
        .prepare("UPDATE redemptions SET status='queued', error=NULL, updated_at=? WHERE nonce=? AND status='manual_review'")
        .run(now(), Number(req.params.nonce));
      res.json({ ok: r.changes === 1 });
    })
  );

  // 이미 송금됨(또는 수동 처리함) → txid 입력해 완료 처리
  admin.post(
    "/redemptions/:nonce/resolve",
    wrap(async (req, res) => {
      const txid = String(req.body?.verusTxid || "").trim();
      if (!txid) return res.status(400).json({ error: "verusTxid 필요" });
      const r = db
        .prepare("UPDATE redemptions SET status='sent', verus_txid=?, error=NULL, updated_at=? WHERE nonce=? AND status='manual_review'")
        .run(txid, now(), Number(req.params.nonce));
      res.json({ ok: r.changes === 1 });
    })
  );

  admin.post(
    "/deposits/:id/retry",
    wrap(async (req, res) => {
      const r = db
        .prepare("UPDATE deposits SET status='pending', error=NULL, updated_at=? WHERE id=? AND status IN ('failed','too_small')")
        .run(now(), req.params.id);
      res.json({ ok: r.changes === 1 });
    })
  );

  admin.get("/mining-address", (_q, res) => res.json({ address: kv.get("mining_address") }));

  app.use("/api/admin", admin);
  app.use("/api", (_q, res) => res.status(404).json({ error: "없는 API" }));
  return app;
}
