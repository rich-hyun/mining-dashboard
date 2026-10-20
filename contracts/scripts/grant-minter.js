const hre = require("hardhat");

async function main() {
  const { TOKEN_ADDRESS, MINTER_ADDRESS } = process.env;
  if (!TOKEN_ADDRESS || !MINTER_ADDRESS) throw new Error("TOKEN_ADDRESS, MINTER_ADDRESS 를 .env에 넣으세요");

  const token = await hre.ethers.getContractAt("MustreeWrappedVRSC", TOKEN_ADDRESS);
  const role = await token.MINTER_ROLE();
  const tx = await token.grantRole(role, MINTER_ADDRESS);
  await tx.wait();
  console.log(`MINTER_ROLE 부여 완료 → ${MINTER_ADDRESS} (tx ${tx.hash})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
