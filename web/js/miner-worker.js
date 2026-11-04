// 채굴 Worker. 메인 화면이 시작 버튼으로 만들고, 정지·탭 종료 시 terminate()로 즉시 없앤다.
// 이 Worker는 스스로 시작하거나 다시 살아나지 않는다.
import { buildBlock, searchShares, targetWords, composeNonce } from "./keccak.js";

const SLICE_MS = 50; // 한 번에 계산하는 시간 목표
const REPORT_MS = 500;

let job = null; // { challenge, miner, blk, t }
let cpuCap = 100;
let running = false;
const prefix = crypto.getRandomValues(new Uint8Array(24)); // Worker마다 다른 nonce 공간
let hi = 0;
let lo = 0;

// setTimeout(0)은 4ms 이상 지연되므로, 쉬지 않을 때는 MessageChannel로 이벤트 루프만 한 번 돌린다.
const channel = new MessageChannel();
const yieldNow = () => new Promise((r) => { channel.port1.onmessage = () => r(); channel.port2.postMessage(0); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "job") {
    job = { challenge: m.challenge, miner: m.miner, blk: buildBlock(m.challenge, m.miner, prefix), t: targetWords(m.target) };
    hi = 0;
    lo = 0;
    if (!running) loop();
  } else if (m.type === "cpu") {
    cpuCap = Math.min(100, Math.max(10, m.cpuCap));
  }
};

async function loop() {
  running = true;
  let chunk = 4096;
  let unreported = 0;
  let lastReport = performance.now();
  while (running) {
    const j = job;
    // lo 카운터가 2^32를 넘지 않게 자른다.
    const count = Math.min(chunk, 0x100000000 - lo);
    const t0 = performance.now();
    const found = searchShares(j.blk, hi, lo, count, j.t);
    const dt = performance.now() - t0;

    if (found >= 0) {
      unreported += found - lo + 1;
      self.postMessage({ type: "found", nonce: composeNonce(prefix, hi, found), challenge: j.challenge });
      lo = found + 1;
    } else {
      unreported += count;
      lo += count;
    }
    if (lo >= 0x100000000) { hi++; lo = 0; }

    // 한 조각이 SLICE_MS 안팎이 되도록 크기를 맞춘다.
    if (dt > 0) chunk = Math.max(1024, Math.min(1 << 20, Math.round((chunk * SLICE_MS) / dt)));

    const now = performance.now();
    if (now - lastReport >= REPORT_MS) {
      self.postMessage({ type: "progress", hashes: unreported, ms: now - lastReport });
      unreported = 0;
      lastReport = now;
    }
    // CPU 사용률 상한: 계산한 시간에 비례해 쉰다 (예: 50% → 계산 50ms, 휴식 50ms).
    if (cpuCap < 100) await sleep((dt * (100 - cpuCap)) / cpuCap);
    else await yieldNow();
  }
}
