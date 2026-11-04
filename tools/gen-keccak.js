#!/usr/bin/env node
// web/js/keccak.js 생성기. keccak-f[1600] 한 라운드를 32비트 반쪽 레인 변수로 펼쳐 쓴 코드를 만든다.
// 브라우저 Worker와 tools/bench.js가 이 파일 하나를 함께 쓰므로, 측정값과 실제 채굴 속도가 같은 코드에서 나온다.
// 사용: node tools/gen-keccak.js  →  web/js/keccak.js 덮어씀
const fs = require("fs");
const path = require("path");

const RC = [
  "0000000000000001", "0000000000008082", "800000000000808a", "8000000080008000",
  "000000000000808b", "0000000080000001", "8000000080008081", "8000000000008009",
  "000000000000008a", "0000000000000088", "0000000080008009", "000000008000000a",
  "000000008000808b", "800000000000008b", "8000000000008089", "8000000000008003",
  "8000000000008002", "8000000000000080", "000000000000800a", "800000008000000a",
  "8000000080008081", "8000000000008080", "0000000080000001", "8000000080008008",
];
// ROT[x][y]
const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const lane = (x, y) => x + 5 * y;
const lo = (i) => `a${2 * i}`;
const hi = (i) => `a${2 * i + 1}`;

function rot(dstLo, dstHi, srcLo, srcHi, n) {
  if (n === 0) return `${dstLo}=${srcLo};${dstHi}=${srcHi};`;
  if (n === 32) return `${dstLo}=${srcHi};${dstHi}=${srcLo};`;
  if (n < 32) {
    return `${dstLo}=(${srcLo}<<${n})|(${srcHi}>>>${32 - n});${dstHi}=(${srcHi}<<${n})|(${srcLo}>>>${32 - n});`;
  }
  const m = n - 32;
  return `${dstLo}=(${srcHi}<<${m})|(${srcLo}>>>${32 - m});${dstHi}=(${srcLo}<<${m})|(${srcHi}>>>${32 - m});`;
}

function roundBody() {
  const out = [];
  // theta
  for (let x = 0; x < 5; x++) {
    const ls = [0, 1, 2, 3, 4].map((y) => lane(x, y));
    out.push(`c${2 * x}=${ls.map(lo).join("^")};c${2 * x + 1}=${ls.map(hi).join("^")};`);
  }
  for (let x = 0; x < 5; x++) {
    const p = (x + 4) % 5, n = (x + 1) % 5;
    out.push(
      `h=c${2 * p}^((c${2 * n}<<1)|(c${2 * n + 1}>>>31));l=c${2 * p + 1}^((c${2 * n + 1}<<1)|(c${2 * n}>>>31));`
    );
    for (let y = 0; y < 5; y++) out.push(`${lo(lane(x, y))}^=h;${hi(lane(x, y))}^=l;`);
  }
  // rho + pi : B[y, 2x+3y] = rot(A[x,y])
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      const j = lane(y, (2 * x + 3 * y) % 5);
      out.push(rot(`b${2 * j}`, `b${2 * j + 1}`, lo(lane(x, y)), hi(lane(x, y)), ROT[x][y]));
    }
  }
  // chi
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const i = lane(x, y), i1 = lane((x + 1) % 5, y), i2 = lane((x + 2) % 5, y);
      out.push(`${lo(i)}=b${2 * i}^(~b${2 * i1}&b${2 * i2});${hi(i)}=b${2 * i + 1}^(~b${2 * i1 + 1}&b${2 * i2 + 1});`);
    }
  }
  // iota
  out.push(`a0^=RC_LO[r];a1^=RC_HI[r];`);
  return out.join("\n      ");
}

const A = [...Array(50).keys()];
const decl = (p) => A.map((i) => `${p}${i}`).join(",");
const rcLo = RC.map((h) => "0x" + h.slice(8)).join(",");
const rcHi = RC.map((h) => "0x" + h.slice(0, 8)).join(",");
const round = roundBody();
const body = `// 자동 생성 파일 — 직접 고치지 말고 tools/gen-keccak.js를 수정한 뒤 다시 생성할 것.
// keccak256 (Ethereum, 패딩 0x01) 단일 블록 전용 구현. 채굴 입력은 84바이트라 블록 하나(136바이트)에 들어간다.

const RC_LO = new Int32Array([${rcLo}]);
const RC_HI = new Int32Array([${rcHi}]);

const bswap = (v) => ((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | (v >>> 24);

/** state(Int32Array 50)에 keccak-f[1600]을 제자리 적용한다. */
export function keccakF(s) {
  let ${decl("a")};
  let ${decl("b")};
  let c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,h,l;
  ${A.map((i) => `a${i}=s[${i}];`).join("")}
  for (let r = 0; r < 24; r++) {
      ${round}
  }
  ${A.map((i) => `s[${i}]=a${i};`).join("")}
}

/**
 * share 탐색 루프.
 * 입력 블록 = challenge(32) ‖ miner(20) ‖ nonce(32) ‖ 패딩. nonce의 마지막 8바이트가 [hiCounter, loCounter] (big-endian).
 * @param {Int32Array} blk   패딩까지 넣은 34워드(17레인) 입력 블록. 워드 19·20은 무시하고 카운터로 채운다.
 * @param {number} hiCounter nonce 76..79 바이트
 * @param {number} start     loCounter 시작값 (nonce 80..83 바이트)
 * @param {number} count     시도할 해시 수
 * @param {Uint32Array} t    목표값 8워드 (big-endian 순서)
 * @returns {number} 목표값 이하인 loCounter, 없으면 -1
 */
export function searchShares(blk, hiCounter, start, count, t) {
  let ${decl("a")};
  let ${decl("b")};
  let c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,h,l;
  const t0 = t[0] >>> 0;
  const hiWord = bswap(hiCounter | 0);
  for (let k = 0; k < count; k++) {
    const ctr = (start + k) >>> 0;
    ${A.map((i) => (i === 19 ? "a19=hiWord;" : i === 20 ? "a20=bswap(ctr);" : i < 34 ? `a${i}=blk[${i}];` : `a${i}=0;`)).join("")}
    for (let r = 0; r < 24; r++) {
      ${round}
    }
    const d0 = bswap(a0) >>> 0;
    if (d0 > t0) continue;
    if (d0 < t0) return ctr;
    const d = [d0, bswap(a1) >>> 0, bswap(a2) >>> 0, bswap(a3) >>> 0, bswap(a4) >>> 0, bswap(a5) >>> 0, bswap(a6) >>> 0, bswap(a7) >>> 0];
    let ok = true;
    for (let i = 1; i < 8; i++) {
      if (d[i] < (t[i] >>> 0)) break;
      if (d[i] > (t[i] >>> 0)) { ok = false; break; }
    }
    if (ok) return ctr;
  }
  return -1;
}
`;

const helpers = `
// ───────── 헬퍼 (생성 코드와 함께 내보냄) ─────────

const hexToBytes = (hex) => {
  const h = hex.replace(/^0x/, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
};
const bytesToHex = (b) => "0x" + Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");

/**
 * 채굴 입력 블록을 만든다.
 * @param {string} challenge 0x… 32바이트
 * @param {string} miner     0x… 20바이트 주소
 * @param {Uint8Array} prefix nonce 앞 24바이트 (Worker마다 무작위로 달리 준다)
 */
export function buildBlock(challenge, miner, prefix) {
  const msg = new Uint8Array(136);
  msg.set(hexToBytes(challenge), 0);
  msg.set(hexToBytes(miner), 32);
  msg.set(prefix.subarray(0, 24), 52);
  msg[84] ^= 0x01;
  msg[135] ^= 0x80;
  const blk = new Int32Array(34);
  for (let i = 0; i < 34; i++) {
    blk[i] = msg[i * 4] | (msg[i * 4 + 1] << 8) | (msg[i * 4 + 2] << 16) | (msg[i * 4 + 3] << 24);
  }
  return blk;
}

/** 0x… uint256 목표값 → big-endian 8워드 */
export function targetWords(targetHex) {
  const h = BigInt(targetHex).toString(16).padStart(64, "0");
  const t = new Uint32Array(8);
  for (let i = 0; i < 8; i++) t[i] = parseInt(h.substr(i * 8, 8), 16);
  return t;
}

/** prefix(24바이트) + hi + lo → nonce 0x… (uint256) */
export function composeNonce(prefix, hiCounter, loCounter) {
  const b = new Uint8Array(32);
  b.set(prefix.subarray(0, 24), 0);
  new DataView(b.buffer).setUint32(24, hiCounter >>> 0);
  new DataView(b.buffer).setUint32(28, loCounter >>> 0);
  return bytesToHex(b);
}

/** keccak256(challenge ‖ miner ‖ nonce) — 컨트랙트 hashShare와 같은 값. 검증·테스트용. */
export function hashShare(challenge, miner, nonceHex) {
  const nonce = hexToBytes(BigInt(nonceHex).toString(16).padStart(64, "0"));
  const blk = buildBlock(challenge, miner, nonce);
  const s = new Int32Array(50);
  s.set(blk);
  // buildBlock은 nonce 앞 24바이트만 넣으므로 나머지 8바이트(워드 19·20)를 채운다.
  const dv = new DataView(nonce.buffer);
  s[19] = bswapWord(dv.getUint32(24));
  s[20] = bswapWord(dv.getUint32(28));
  keccakF(s);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = s[i] & 0xff;
    out[i * 4 + 1] = (s[i] >>> 8) & 0xff;
    out[i * 4 + 2] = (s[i] >>> 16) & 0xff;
    out[i * 4 + 3] = (s[i] >>> 24) & 0xff;
  }
  return bytesToHex(out);
}

const bswapWord = (v) => ((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | (v >>> 24);
`;

const outPath = path.join(__dirname, "..", "web", "js", "keccak.js");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body + helpers);
console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
