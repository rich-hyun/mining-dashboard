import { config } from "./config.js";

let rpcId = 0;
const auth = "Basic " + Buffer.from(`${config.verus.user}:${config.verus.pass}`).toString("base64");

/** verusd JSON-RPC 호출 */
export async function verus(method, params = []) {
  const res = await fetch(config.verus.url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify({ jsonrpc: "1.0", id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Verus RPC ${method} 응답 오류 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (body.error) throw new Error(`Verus RPC ${method}: ${body.error.message || JSON.stringify(body.error)}`);
  return body.result;
}

export const verusApi = {
  info: () => verus("getinfo"),
  blockchainInfo: () => verus("getblockchaininfo"),
  miningInfo: () => verus("getmininginfo"),
  newAddress: () => verus("getnewaddress"),
  validateAddress: (a) => verus("validateaddress", [a]),
  balance: (minConf) => verus("getbalance", ["*", minConf]),
  /** 최근 거래 목록 (오래된 것 → 최신 순) */
  listTransactions: (count = 500, skip = 0) => verus("listtransactions", ["*", count, skip, true]),
  send: (address, amountStr) => verus("sendtoaddress", [address, Number(amountStr)]),
  /** 채굴 켜기/끄기 — threads 0 이면 끔 */
  setGenerate: (on, threads) => verus("setgenerate", on ? [true, threads] : [false]),
};
