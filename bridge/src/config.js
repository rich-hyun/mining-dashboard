import "dotenv/config";

function req(name) {
  const v = process.env[name];
  if (!v || v === "0x..." || v === "change-me") throw new Error(`환경변수 ${name} 가 필요합니다 (.env 확인)`);
  return v;
}
const num = (name, d) => (process.env[name] !== undefined ? Number(process.env[name]) : d);

export const config = {
  port: num("PORT", 8787),
  adminToken: req("ADMIN_TOKEN"),
  dbPath: process.env.DB_PATH || "./data/bridge.db",

  verus: {
    url: process.env.VERUS_RPC_URL || "http://127.0.0.1:27486",
    user: req("VERUS_RPC_USER"),
    pass: req("VERUS_RPC_PASS"),
    minConf: num("VERUS_MIN_CONF", 10),
    minDeposit: process.env.MIN_DEPOSIT || "0.1",
    redeemFee: process.env.REDEEM_FEE || "0.0001",
  },

  vyd: {
    rpc: process.env.VYD_RPC || "https://vyd.mustree.kr",
    chainId: num("VYD_CHAIN_ID", 7603),
    token: req("TOKEN_ADDRESS"),
    deployBlock: num("TOKEN_DEPLOY_BLOCK", 0),
    minterKey: req("MINTER_KEY"),
    confirmations: num("VYD_CONFIRMATIONS", 6),
  },

  miningRewardEvm: process.env.MINING_REWARD_EVM || "",
  pollMs: num("POLL_INTERVAL_MS", 20000),
};
