// MSTMiningReward 배포 스크립트.
// 사용: npx hardhat run scripts/deploy.js --network mustsem
// 환경변수는 README의 "환경변수" 절 참고. 배포 결과는 deployments/mustsem.json과 web/js/deployment.js에 기록한다.
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const MAX_TARGET = ethers.MaxUint256 / 4n;

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY가 설정되지 않았습니다.");

  const admin = env("ADMIN_ADDRESS", deployer.address);
  const staking = env("STAKING_ADDRESS", ethers.ZeroAddress);
  const params = {
    rewardPerShare: ethers.parseEther(env("REWARD_PER_SHARE", "1")),
    dailyCapPerWallet: ethers.parseEther(env("DAILY_CAP_PER_WALLET", "50")),
    epochCap: ethers.parseEther(env("EPOCH_CAP", "500")),
    targetInterval: Number(env("TARGET_INTERVAL_SEC", "60")),
    sharesPerEpoch: Number(env("SHARES_PER_EPOCH", "30")),
    minShareInterval: Number(env("MIN_SHARE_INTERVAL_SEC", "60")),
  };
  // 예상 네트워크 해시레이트(H/s) × 목표 간격 = share 하나에 필요한 평균 해시 수
  const expectedHps = BigInt(env("INITIAL_NETWORK_HPS", "1000000"));
  const initialTarget = ethers.MaxUint256 / (expectedHps * BigInt(params.targetInterval));
  const minTarget = BigInt(env("MIN_TARGET", "1"));
  const fund = ethers.parseEther(env("INITIAL_FUND", "0"));

  console.log(`network=${network.name} chainId=${network.config.chainId} deployer=${deployer.address}`);
  console.log({ admin, staking, params, initialTarget: initialTarget.toString() });

  const Mining = await ethers.getContractFactory("MSTMiningReward");
  const mining = await Mining.deploy(admin, staking, params, initialTarget, minTarget, MAX_TARGET);
  const receipt = await mining.deploymentTransaction().wait();
  const address = await mining.getAddress();
  console.log(`MSTMiningReward → ${address} (block ${receipt.blockNumber})`);

  if (fund > 0n) {
    const tx = await mining.fundPool({ value: fund });
    await tx.wait();
    console.log(`풀 충전 ${ethers.formatEther(fund)} MST (tx ${tx.hash})`);
  }

  const record = {
    network: network.name,
    chainId: network.config.chainId,
    contract: "MSTMiningReward",
    address,
    deployBlock: receipt.blockNumber,
    deployTx: receipt.hash,
    admin,
    staking,
    params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.toString()])),
    initialTarget: initialTarget.toString(),
    deployedAt: new Date().toISOString(),
  };
  const root = path.join(__dirname, "..");
  fs.mkdirSync(path.join(root, "deployments"), { recursive: true });
  fs.writeFileSync(path.join(root, "deployments", `${network.name}.json`), JSON.stringify(record, null, 2) + "\n");
  // 로컬 시험 배포가 공개 페이지 설정을 덮어쓰지 않게 한다.
  if (["hardhat", "localhost"].includes(network.name)) {
    console.log(`deployments/${network.name}.json 기록. 웹 설정은 그대로 둡니다(?contract=${address}&from=${receipt.blockNumber}).`);
    return;
  }
  fs.writeFileSync(
    path.join(root, "web", "js", "deployment.js"),
    `// scripts/deploy.js가 배포 후 덮어쓴다.\nexport const DEPLOYMENT = ${JSON.stringify({ address, deployBlock: receipt.blockNumber }, null, 2)};\n`
  );
  console.log("deployments/ 와 web/js/deployment.js 를 갱신했습니다.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
