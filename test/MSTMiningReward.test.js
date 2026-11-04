const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const MST = (n) => ethers.parseEther(String(n));
const MAX_TARGET = ethers.MaxUint256 / 4n;
const EASY_TARGET = MAX_TARGET / 16n; // 해시 64개 중 1개꼴로 통과
const Reason = { PoolDepleted: 0, DailyCap: 1, EpochCap: 2 };

const BASE_PARAMS = {
  rewardPerShare: MST(1),
  dailyCapPerWallet: MST(3),
  epochCap: MST(100),
  targetInterval: 60,
  sharesPerEpoch: 100,
  minShareInterval: 0,
};

function shareHash(challenge, miner, nonce) {
  return ethers.solidityPackedKeccak256(["bytes32", "address", "uint256"], [challenge, miner, nonce]);
}

async function findNonce(mining, miner, start = 0n) {
  const [challenge, target] = await Promise.all([mining.challenge(), mining.miningTarget()]);
  for (let nonce = start; ; nonce++) {
    const digest = shareHash(challenge, miner.address, nonce);
    if (BigInt(digest) <= target && !(await mining.usedDigest(digest))) return { nonce, challenge, digest };
  }
}

async function mine(mining, miner) {
  const { nonce, challenge, digest } = await findNonce(mining, miner);
  const tx = await mining.connect(miner).submitShare(nonce, challenge);
  return { tx, nonce, challenge, digest };
}

async function deploy({ params = {}, fund = MST(50), staking = ethers.ZeroAddress } = {}) {
  const [admin, alice, bob, outsider] = await ethers.getSigners();
  const Mining = await ethers.getContractFactory("MSTMiningReward");
  const mining = await Mining.deploy(
    admin.address,
    staking,
    { ...BASE_PARAMS, ...params },
    EASY_TARGET,
    1n,
    MAX_TARGET
  );
  if (fund > 0n) await mining.fundPool({ value: fund });
  await mining.registerDevice(alice.address, "laptop-01");
  await mining.registerDevice(bob.address, "gpu-01");
  return { mining, admin, alice, bob, outsider };
}

describe("MSTMiningReward", () => {
  describe("정상 제출", () => {
    it("유효한 share를 승인하고 풀에서 보상을 지급한다", async () => {
      const { mining, alice } = await deploy();
      const { nonce, challenge, digest } = await findNonce(mining, alice);
      expect(await mining.hashShare(challenge, alice.address, nonce)).to.equal(digest);

      const tx = mining.connect(alice).submitShare(nonce, challenge);
      await expect(tx).to.emit(mining, "ShareAccepted").withArgs(alice.address, nonce, digest, MST(1));
      await expect(tx).to.changeEtherBalances([alice, mining], [MST(1), -MST(1)]);

      expect(await mining.acceptedShares(alice.address)).to.equal(1n);
      expect(await mining.rewardedToWallet(alice.address)).to.equal(MST(1));
      expect(await mining.totalRewarded()).to.equal(MST(1));
    });

    it("풀 충전 시 PoolFunded 이벤트를 남긴다 (fundPool·직접 송금 모두)", async () => {
      const { mining, admin } = await deploy({ fund: 0n });
      await expect(mining.fundPool({ value: MST(5) }))
        .to.emit(mining, "PoolFunded")
        .withArgs(admin.address, MST(5), MST(5));
      await expect(admin.sendTransaction({ to: await mining.getAddress(), value: MST(2) }))
        .to.emit(mining, "PoolFunded")
        .withArgs(admin.address, MST(2), MST(7));
    });

    it("목표값을 넘는 digest는 거부한다", async () => {
      const { mining, alice } = await deploy();
      await mining.setTarget(1n);
      const challenge = await mining.challenge();
      await expect(mining.connect(alice).submitShare(0, challenge)).to.be.revertedWithCustomError(
        mining,
        "DigestAboveTarget"
      );
    });

    it("지난 challenge로 만든 제출은 거부한다", async () => {
      const { mining, alice } = await deploy();
      const { nonce, challenge } = await findNonce(mining, alice);
      await time.increase(2 * 100 * 60);
      await mining.advanceEpoch();
      await expect(mining.connect(alice).submitShare(nonce, challenge)).to.be.revertedWithCustomError(
        mining,
        "StaleChallenge"
      );
    });

    it("다른 지갑이 찾은 nonce를 가로채 제출해도 digest가 달라 통하지 않는다", async () => {
      const { mining, alice, bob } = await deploy();
      await mining.setTarget(MAX_TARGET / 1024n);
      const { nonce, challenge } = await findNonce(mining, alice);
      const target = await mining.miningTarget();
      const bobDigest = shareHash(challenge, bob.address, nonce);
      // 우연히 bob 쪽도 통과하는 nonce면 이 검증은 의미가 없으므로 전제를 확인한다.
      expect(BigInt(bobDigest) > target).to.equal(true);
      await expect(mining.connect(bob).submitShare(nonce, challenge)).to.be.revertedWithCustomError(
        mining,
        "DigestAboveTarget"
      );
    });
  });

  describe("중복 nonce", () => {
    it("같은 에폭에서 같은 nonce를 다시 내면 거부한다", async () => {
      const { mining, alice } = await deploy();
      const { nonce, challenge } = await mine(mining, alice);
      await expect(mining.connect(alice).submitShare(nonce, challenge))
        .to.be.revertedWithCustomError(mining, "DuplicateShare")
        .withArgs(shareHash(challenge, alice.address, nonce));
    });

    it("지갑별 최소 제출 간격보다 빨리 내면 거부한다", async () => {
      const { mining, alice } = await deploy({ params: { minShareInterval: 30 } });
      await mine(mining, alice);
      const { nonce, challenge } = await findNonce(mining, alice, 10_000n);
      await expect(mining.connect(alice).submitShare(nonce, challenge)).to.be.revertedWithCustomError(
        mining,
        "TooSoon"
      );
      await time.increase(30);
      await expect(mining.connect(alice).submitShare(nonce, challenge)).to.emit(mining, "ShareAccepted");
    });
  });

  describe("미등록 주소", () => {
    it("등록되지 않은 지갑의 제출은 거부한다", async () => {
      const { mining, outsider } = await deploy();
      const { nonce, challenge } = await findNonce(mining, outsider);
      await expect(mining.connect(outsider).submitShare(nonce, challenge))
        .to.be.revertedWithCustomError(mining, "NotRegistered")
        .withArgs(outsider.address);
    });

    it("등록 해제된 지갑은 더 이상 제출할 수 없다", async () => {
      const { mining, alice, admin } = await deploy();
      await expect(mining.unregisterDevice(alice.address))
        .to.emit(mining, "DeviceUnregistered")
        .withArgs(alice.address, admin.address);
      const { nonce, challenge } = await findNonce(mining, alice);
      await expect(mining.connect(alice).submitShare(nonce, challenge)).to.be.revertedWithCustomError(
        mining,
        "NotRegistered"
      );
      expect(await mining.registeredCount()).to.equal(1n);
    });

    it("참여 신청은 기록만 남기고, REGISTRAR_ROLE만 등록할 수 있다", async () => {
      const { mining, outsider, admin } = await deploy();
      await expect(mining.connect(outsider).requestRegistration("home-pc"))
        .to.emit(mining, "RegistrationRequested")
        .withArgs(outsider.address, "home-pc");
      expect(await mining.isRegistered(outsider.address)).to.equal(false);

      await expect(mining.connect(outsider).registerDevice(outsider.address, "self"))
        .to.be.revertedWithCustomError(mining, "AccessControlUnauthorizedAccount");
      await expect(mining.registerDevice(outsider.address, "home-pc"))
        .to.emit(mining, "DeviceRegistered")
        .withArgs(outsider.address, "home-pc", admin.address);
      await expect(mining.registerDevice(outsider.address, "again")).to.be.revertedWithCustomError(
        mining,
        "AlreadyRegistered"
      );
    });
  });

  describe("상한 초과", () => {
    it("지갑별 일일 상한을 넘으면 share는 승인하되 보상은 주지 않는다", async () => {
      const { mining, alice } = await deploy(); // 1건당 1 MST, 하루 3 MST
      for (let i = 0; i < 3; i++) await mine(mining, alice);
      expect(await mining.rewardedToWallet(alice.address)).to.equal(MST(3));

      const [preview, limited, reason] = await mining.previewReward(alice.address);
      expect([preview, limited, Number(reason)]).to.deep.equal([0n, true, Reason.DailyCap]);

      const { tx, nonce, digest } = await mine(mining, alice);
      await expect(tx).to.emit(mining, "ShareAccepted").withArgs(alice.address, nonce, digest, 0n);
      await expect(tx).to.emit(mining, "RewardWithheld").withArgs(alice.address, Reason.DailyCap, MST(1));
      await expect(tx).to.changeEtherBalance(alice, 0n);
      expect(await mining.acceptedShares(alice.address)).to.equal(4n);
    });

    it("다음 날(UTC)이 되면 일일 상한이 초기화된다", async () => {
      const { mining, alice } = await deploy();
      for (let i = 0; i < 3; i++) await mine(mining, alice);
      await time.increase(24 * 60 * 60);
      await mining.advanceEpoch(); // 하루 동안 비어 있던 에폭을 넘긴다
      const { tx } = await mine(mining, alice);
      await expect(tx).to.changeEtherBalance(alice, MST(1));
    });

    it("상한에 일부만 남았으면 남은 만큼만 지급한다", async () => {
      const { mining, alice } = await deploy({ params: { dailyCapPerWallet: MST("2.5") } });
      await mine(mining, alice);
      await mine(mining, alice);
      const { tx } = await mine(mining, alice);
      await expect(tx).to.changeEtherBalance(alice, MST("0.5"));
      await expect(tx).to.emit(mining, "RewardWithheld").withArgs(alice.address, Reason.DailyCap, MST("0.5"));
    });

    it("에폭별 총량 상한을 넘으면 어떤 지갑에도 더 지급하지 않는다", async () => {
      const { mining, alice, bob } = await deploy({ params: { epochCap: MST(2) } });
      await mine(mining, alice);
      await mine(mining, bob);
      const { tx } = await mine(mining, bob);
      await expect(tx).to.emit(mining, "RewardWithheld").withArgs(bob.address, Reason.EpochCap, MST(1));
      await expect(tx).to.changeEtherBalance(bob, 0n);
      expect(await mining.epochPaid()).to.equal(MST(2));
    });
  });

  describe("풀 고갈", () => {
    it("잔액이 1건 보상보다 적으면 지급을 멈추고 PoolDepleted 사유를 남긴다", async () => {
      const { mining, alice } = await deploy({ fund: MST("1.5") });
      await mine(mining, alice);
      const { tx } = await mine(mining, alice);
      await expect(tx).to.emit(mining, "RewardWithheld").withArgs(alice.address, Reason.PoolDepleted, MST(1));
      await expect(tx).to.changeEtherBalances([alice, mining], [0n, 0n]);
      expect(await mining.poolBalance()).to.equal(MST("0.5"));

      // 충전하면 다시 지급된다.
      await mining.fundPool({ value: MST(10) });
      await expect((await mine(mining, alice)).tx).to.changeEtherBalance(alice, MST(1));
    });

    it("관리자만 풀을 회수할 수 있다", async () => {
      const { mining, admin, alice } = await deploy({ fund: MST(10) });
      await expect(mining.connect(alice).withdrawPool(alice.address, MST(1))).to.be.revertedWithCustomError(
        mining,
        "AccessControlUnauthorizedAccount"
      );
      await expect(mining.withdrawPool(admin.address, MST(4)))
        .to.emit(mining, "PoolWithdrawn")
        .withArgs(admin.address, MST(4), MST(6));
    });
  });

  describe("난이도 조절", () => {
    const params = { sharesPerEpoch: 4, targetInterval: 60, dailyCapPerWallet: MST(1000) };

    it("목표보다 빨리 채워지면 target을 낮춘다(최대 1/4)", async () => {
      const { mining, alice } = await deploy({ params });
      const before = await mining.miningTarget();
      for (let i = 0; i < 3; i++) await mine(mining, alice);
      const { tx } = await mine(mining, alice); // 4번째 share에서 에폭 종료
      await expect(tx).to.emit(mining, "DifficultyAdjusted");
      expect(await mining.epoch()).to.equal(1n);
      expect(await mining.miningTarget()).to.equal(before / 4n);
    });

    it("목표 간격대로 채워지면 target을 거의 유지하고, 느리면 올린다", async () => {
      const { mining, alice } = await deploy({ params });
      const before = await mining.miningTarget();
      for (let i = 0; i < 4; i++) {
        await time.increase(60 - 1); // 트랜잭션 블록이 1초 더한다
        await mine(mining, alice);
      }
      const onTarget = await mining.miningTarget();
      expect(onTarget).to.be.closeTo(before, before / 50n);

      for (let i = 0; i < 4; i++) {
        await time.increase(120 - 1);
        await mine(mining, alice);
      }
      const slower = await mining.miningTarget();
      expect(slower).to.be.closeTo(onTarget * 2n, onTarget / 25n);
    });

    it("새 에폭은 새 challenge를 쓴다", async () => {
      const { mining, alice } = await deploy({ params });
      const first = await mining.challenge();
      for (let i = 0; i < 4; i++) await mine(mining, alice);
      const second = await mining.challenge();
      expect(second).to.not.equal(first);
      await expect(mining.connect(alice).submitShare(0, first)).to.be.revertedWithCustomError(mining, "StaleChallenge");
    });

    it("제출이 없으면 만료 후 advanceEpoch로 4배 쉬워지고, maxTarget을 넘지 않는다", async () => {
      const { mining, outsider } = await deploy({ params });
      const expiresAt = await mining.epochExpiresAt();
      await expect(mining.connect(outsider).advanceEpoch()).to.be.revertedWithCustomError(mining, "EpochNotExpired");

      await time.increaseTo(expiresAt);
      const before = await mining.miningTarget();
      await expect(mining.connect(outsider).advanceEpoch())
        .to.emit(mining, "DifficultyAdjusted")
        .withArgs(0n, before, before * 4n, (v) => v > 0n, 0n);

      for (let i = 0; i < 2; i++) {
        await time.increase(4 * 2 * 60 * 10);
        await mining.advanceEpoch();
      }
      expect(await mining.miningTarget()).to.equal(MAX_TARGET);
    });

    it("관리자가 지정한 범위(minTarget) 아래로는 내려가지 않는다", async () => {
      const { mining, alice } = await deploy({ params });
      await mining.setTargetBounds(EASY_TARGET / 2n, MAX_TARGET);
      for (let i = 0; i < 4; i++) await mine(mining, alice);
      expect(await mining.miningTarget()).to.equal(EASY_TARGET / 2n);
    });
  });

  describe("보상 방식과 권한", () => {
    it("스테이킹이 꺼져 있으면 자동 예치를 고를 수 없다", async () => {
      const { mining, alice } = await deploy();
      await expect(mining.connect(alice).setRewardMode(1)).to.be.revertedWithCustomError(mining, "StakingUnavailable");
      await expect(mining.setStakingEnabled(true)).to.be.revertedWithCustomError(mining, "StakingUnavailable");
    });

    it("스테이킹을 켜면 보상이 채굴자 명의로 예치된다(목업)", async () => {
      const staking = await (await ethers.getContractFactory("MockStaking")).deploy();
      const { mining, alice } = await deploy({ staking: await staking.getAddress() });
      await mining.setStakingEnabled(true);
      await mining.connect(alice).setRewardMode(1);

      const { tx } = await mine(mining, alice);
      await expect(tx).to.emit(staking, "StakedFor").withArgs(alice.address, MST(1));
      await expect(tx).to.changeEtherBalance(alice, 0n);
      expect(await staking.staked(alice.address)).to.equal(MST(1));
      expect(await mining.rewardedToStaking(alice.address)).to.equal(MST(1));

      // 운영 중 스테이킹을 끄면 지갑으로 보낸다.
      await mining.setStakingEnabled(false);
      await expect((await mine(mining, alice)).tx).to.changeEtherBalance(alice, MST(1));
    });

    it("파라미터 변경은 PARAMS_ROLE만, 일시정지 중에는 제출 불가", async () => {
      const { mining, alice } = await deploy();
      await expect(mining.connect(alice).setParams(BASE_PARAMS)).to.be.revertedWithCustomError(
        mining,
        "AccessControlUnauthorizedAccount"
      );
      await expect(mining.setParams({ ...BASE_PARAMS, targetInterval: 0 })).to.be.revertedWithCustomError(
        mining,
        "InvalidParams"
      );
      await expect(mining.setParams({ ...BASE_PARAMS, rewardPerShare: MST(2) })).to.emit(mining, "ParamsUpdated");

      await mining.pause();
      const { nonce, challenge } = await findNonce(mining, alice);
      await expect(mining.connect(alice).submitShare(nonce, challenge)).to.be.revertedWithCustomError(
        mining,
        "EnforcedPause"
      );
    });
  });
});
