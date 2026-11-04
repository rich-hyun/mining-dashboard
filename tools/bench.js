#!/usr/bin/env node
// MST 채굴 해시레이트 벤치마크 (CPU).
// 대시보드 Worker와 같은 web/js/keccak.js로 N초 동안 해시를 돌려 H/s를 재고 CSV에 한 줄 추가한다.
//
// 사용 예:
//   node tools/bench.js --device "사무실 노트북-01" --seconds 30 --threads 4 --watts 45
//   node tools/bench.js --device gpu-srv-01 --gpu "RTX 4090 (미사용, CPU 측정)" --threads 32 --sweep
//
// 옵션:
//   --device   장치명 (필수)             --seconds  측정 시간, 기본 20
//   --threads  스레드 수, 기본 논리코어 수  --sweep    1,2,4…최대까지 스레드 수를 바꿔 가며 반복 측정
//   --watts    측정 중 소비전력(W, 전력계 값 직접 입력, 비워도 됨)
//   --gpu      GPU 이름 기록용(이 도구는 CPU만 쓴다)
//   --out      CSV 경로, 기본 results/bench.csv
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

const KECCAK_URL = pathToFileURL(path.join(__dirname, "..", "web", "js", "keccak.js")).href;
const CHUNK = 20_000;

if (!isMainThread) {
  // ── 측정 스레드 ──
  (async () => {
    const k = await import(KECCAK_URL);
    const { seconds, index } = workerData;
    const prefix = crypto.randomBytes(24);
    const blk = k.buildBlock("0x" + crypto.randomBytes(32).toString("hex"), "0x" + crypto.randomBytes(20).toString("hex"), prefix);
    const impossible = new Uint32Array(8); // 목표값 0: 실제로 통과하지 않으므로 순수 해시 속도만 잰다
    // 워밍업 (JIT 최적화) 후 측정
    k.searchShares(blk, index, 0, CHUNK * 5, impossible);
    let hashes = 0;
    let ctr = 0;
    const t0 = process.hrtime.bigint();
    const end = t0 + BigInt(Math.round(seconds * 1e9));
    let now = t0;
    while (now < end) {
      k.searchShares(blk, index, ctr, CHUNK, impossible);
      ctr += CHUNK;
      hashes += CHUNK;
      now = process.hrtime.bigint();
    }
    parentPort.postMessage({ hashes, ns: Number(now - t0) });
  })();
  return;
}

// ── 메인 ──
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    a[key] = next === undefined || next.startsWith("--") ? true : (i++, next);
  }
  return a;
}

function runOnce(threads, seconds) {
  return Promise.all(
    Array.from({ length: threads }, (_, index) =>
      new Promise((resolve, reject) => {
        const w = new Worker(__filename, { workerData: { seconds, index } });
        w.once("message", resolve);
        w.once("error", reject);
      })
    )
  ).then((rs) => {
    const hashes = rs.reduce((s, r) => s + r.hashes, 0);
    const secs = Math.max(...rs.map((r) => r.ns)) / 1e9;
    return { hashes, secs, hps: hashes / secs };
  });
}

const CSV_HEADER = [
  "measured_at", "device", "cpu_model", "logical_cores", "gpu", "threads", "seconds",
  "total_hashes", "hashes_per_sec", "hps_per_thread", "watts", "hashes_per_joule", "platform", "runtime",
];
const csvCell = (v) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.device || args.help) {
    console.log("사용: node tools/bench.js --device <장치명> [--seconds 20] [--threads N | --sweep] [--watts W] [--gpu 이름] [--out results/bench.csv]");
    process.exit(args.help ? 0 : 1);
  }
  const cores = os.cpus().length;
  const seconds = Number(args.seconds || 20);
  const watts = args.watts ? Number(args.watts) : "";
  const out = path.resolve(args.out || path.join("results", "bench.csv"));
  const threadList = args.sweep
    ? [...new Set([1, 2, 4, 8, 16, 32, 64, 128].filter((n) => n < cores).concat(cores))]
    : [Number(args.threads || cores)];

  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!fs.existsSync(out)) fs.writeFileSync(out, CSV_HEADER.join(",") + "\n");

  console.log(`장치: ${args.device} | CPU: ${os.cpus()[0].model.trim()} (${cores} 논리코어) | ${seconds}초씩 측정`);
  for (const threads of threadList) {
    const r = await runOnce(threads, seconds);
    const row = {
      measured_at: new Date().toISOString(),
      device: args.device,
      cpu_model: os.cpus()[0].model.trim(),
      logical_cores: cores,
      gpu: args.gpu || "",
      threads,
      seconds: r.secs.toFixed(2),
      total_hashes: r.hashes,
      hashes_per_sec: Math.round(r.hps),
      hps_per_thread: Math.round(r.hps / threads),
      watts,
      hashes_per_joule: watts ? Math.round(r.hps / watts) : "",
      platform: `${os.platform()}-${os.arch()}`,
      runtime: `node-${process.version}`,
    };
    fs.appendFileSync(out, CSV_HEADER.map((h) => csvCell(row[h])).join(",") + "\n");
    console.log(`  threads=${String(threads).padStart(3)}  ${(r.hps / 1e6).toFixed(3)} MH/s  (${Math.round(r.hps / threads).toLocaleString()} H/s/thread)`);
  }
  console.log(`→ ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
