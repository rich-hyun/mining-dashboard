require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { VYD_RPC = "https://vyd.mustree.kr", DEPLOYER_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // 기존 DataProvenanceRegistry와 같은 컴파일 설정 (VYD 체인은 london 기준)
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "london" },
  },
  networks: {
    vyd: {
      url: VYD_RPC,
      chainId: 7603,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
};
