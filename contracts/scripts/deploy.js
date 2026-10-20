const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const name = process.env.TOKEN_NAME || "Mustree Wrapped VRSC";
  const symbol = process.env.TOKEN_SYMBOL || "mVRSC";
  const minRedeem = hre.ethers.parseUnits(process.env.MIN_REDEEM || "1", 8);

  console.log("배포 계정:", deployer.address);
  const Token = await hre.ethers.getContractFactory("MustreeWrappedVRSC");
  const token = await Token.deploy(name, symbol, deployer.address, minRedeem);
  const receipt = await token.deploymentTransaction().wait();

  console.log("토큰 주소:", await token.getAddress());
  console.log("배포 블록:", receipt.blockNumber);
  console.log("배포 트랜잭션:", receipt.hash);
  console.log("\n다음 단계: 브리지 서버 지갑 주소로 MINTER_ROLE 부여 (npm run grant:vyd)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
