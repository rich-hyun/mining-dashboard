const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MustreeWrappedVRSC", () => {
  let token, admin, minter, user;
  const ONE = 10n ** 8n;

  beforeEach(async () => {
    [admin, minter, user] = await ethers.getSigners();
    const F = await ethers.getContractFactory("MustreeWrappedVRSC");
    token = await F.deploy("Mustree Wrapped VRSC", "mVRSC", admin.address, ONE);
    await token.grantRole(await token.MINTER_ROLE(), minter.address);
  });

  it("소수점 8자리", async () => {
    expect(await token.decimals()).to.equal(8);
  });

  it("민터만 발행하고, 같은 입금은 두 번 발행되지 않음", async () => {
    const id = ethers.id("txid:0");
    await expect(token.connect(user).mintWrapped(user.address, ONE, id, "tx")).to.be.reverted;
    await expect(token.connect(minter).mintWrapped(user.address, 5n * ONE, id, "tx"))
      .to.emit(token, "Wrapped")
      .withArgs(id, user.address, 5n * ONE, "tx");
    await expect(token.connect(minter).mintWrapped(user.address, ONE, id, "tx")).to.be.revertedWithCustomError(
      token,
      "DepositAlreadyProcessed"
    );
    expect(await token.balanceOf(user.address)).to.equal(5n * ONE);
  });

  it("언래핑: 소각 + 이벤트 + 완료 표시", async () => {
    await token.connect(minter).mintWrapped(user.address, 5n * ONE, ethers.id("a"), "tx");
    await expect(token.connect(user).unwrap(2n * ONE, "RVerusAddr"))
      .to.emit(token, "UnwrapRequested")
      .withArgs(1, user.address, 2n * ONE, "RVerusAddr");
    expect(await token.totalSupply()).to.equal(3n * ONE);

    await expect(token.connect(user).unwrap(ONE / 2n, "R")).to.be.revertedWithCustomError(token, "AmountBelowMinimum");

    await token.connect(minter).markRedeemed(1, "vtx");
    await expect(token.connect(minter).markRedeemed(1, "vtx")).to.be.revertedWithCustomError(token, "AlreadyRedeemed");
    await expect(token.connect(minter).markRedeemed(9, "vtx")).to.be.revertedWithCustomError(token, "UnknownNonce");
  });

  it("일시정지 시 발행·언래핑 불가", async () => {
    await token.pause();
    await expect(token.connect(minter).mintWrapped(user.address, ONE, ethers.id("b"), "tx")).to.be.reverted;
  });
});
