// 브라우저 Worker·bench.js가 쓰는 web/js/keccak.js가 컨트랙트(ethers)와 같은 해시를 내는지 확인한다.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");
const { pathToFileURL } = require("url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "web", "js", "keccak.js")).href);
const ref = (c, m, n) => ethers.solidityPackedKeccak256(["bytes32", "address", "uint256"], [c, m, n]);

describe("web/js/keccak.js", () => {
  it("hashShare가 ethers solidityPackedKeccak256과 일치한다 (무작위 200건)", async () => {
    const k = await load();
    for (let i = 0; i < 200; i++) {
      const c = ethers.hexlify(ethers.randomBytes(32));
      const m = ethers.Wallet.createRandom().address;
      const n = ethers.toBeHex(BigInt(ethers.hexlify(ethers.randomBytes(32))), 32);
      expect(k.hashShare(c, m, n)).to.equal(ref(c, m, n));
    }
  });

  it("searchShares가 찾은 nonce는 목표값을 만족하고 컨트랙트 검증과 같은 digest를 낸다", async () => {
    const k = await load();
    const c = ethers.hexlify(ethers.randomBytes(32));
    const m = ethers.Wallet.createRandom().address;
    const prefix = ethers.randomBytes(24);
    const target = ethers.MaxUint256 >> 12n; // 약 4096번에 1번
    const blk = k.buildBlock(c, m, prefix);
    const lo = k.searchShares(blk, 7, 0, 1_000_000, k.targetWords(ethers.toBeHex(target)));
    expect(lo).to.be.greaterThan(-1);
    const nonce = k.composeNonce(prefix, 7, lo);
    const digest = ref(c, m, nonce);
    expect(BigInt(digest) <= target).to.equal(true);
    // 직전 카운터들은 목표값을 넘어야 한다(첫 통과값을 돌려줬는지).
    for (let i = Math.max(0, lo - 50); i < lo; i++) {
      expect(BigInt(ref(c, m, k.composeNonce(prefix, 7, i))) > target).to.equal(true);
    }
  });
});
