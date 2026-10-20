import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS deposit_addresses (
  verus_address TEXT PRIMARY KEY,
  evm_address   TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'user',      -- user | mining
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_addr_evm_user ON deposit_addresses(evm_address, kind) WHERE kind='user';

CREATE TABLE IF NOT EXISTS deposits (
  id            TEXT PRIMARY KEY,                   -- txid:vout
  txid          TEXT NOT NULL,
  vout          INTEGER NOT NULL,
  verus_address TEXT NOT NULL,
  evm_address   TEXT NOT NULL,
  amount_sats   TEXT NOT NULL,
  category      TEXT NOT NULL,                      -- receive | generate
  confirmations INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,                      -- pending | minting | minted | too_small | failed
  deposit_id    TEXT NOT NULL,                      -- 컨트랙트 depositId (bytes32)
  mint_tx       TEXT,
  error         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_dep_evm ON deposits(evm_address);
CREATE INDEX IF NOT EXISTS ix_dep_status ON deposits(status);

CREATE TABLE IF NOT EXISTS redemptions (
  nonce         INTEGER PRIMARY KEY,
  evm_address   TEXT NOT NULL,
  amount_sats   TEXT NOT NULL,
  verus_address TEXT NOT NULL,
  request_tx    TEXT NOT NULL,
  request_block INTEGER NOT NULL,
  status        TEXT NOT NULL,                      -- queued | sending | sent | done | manual_review
  verus_txid    TEXT,
  mark_tx       TEXT,
  error         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_red_evm ON redemptions(evm_address);
CREATE INDEX IF NOT EXISTS ix_red_status ON redemptions(status);

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

export const now = () => Date.now();

export const kv = {
  get(key, d = null) {
    const r = db.prepare("SELECT value FROM kv WHERE key=?").get(key);
    return r ? r.value : d;
  },
  set(key, value) {
    db.prepare("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(
      key,
      String(value)
    );
  },
};
