require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

// .env(커밋 제외)에 적은 값을 환경변수로 읽는다. 이미 설정된 환경변수가 우선한다.
try {
  for (const line of require("fs").readFileSync(require("path").join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const { MST_RPC_URL = "https://block.mustree.kr" } = process.env;
const rawKey = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
const DEPLOYER_PRIVATE_KEY = /^(0x)?[0-9a-fA-F]{64}$/.test(rawKey) ? (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) : null;

module.exports = {
  solidity: {
    version: "0.8.24",
    // PUSH0 미사용: 체인 하드포크 설정과 무관하게 배포되도록 london으로 고정한다.
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "london" },
  },
  networks: {
    mustsem: {
      url: MST_RPC_URL,
      chainId: 7601,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
