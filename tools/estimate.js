#!/usr/bin/env node
// 측정 CSV(results/bench.csv) → "장치 수 × 평균 해시레이트 → 하루 제출 건수 → 하루 지급 MST" 추정표.
//
// 사용: node tools/estimate.js [--in results/bench.csv] [--reward 1] [--daily-cap 50] [--epoch-cap 500]
//         [--interval 60] [--shares-per-epoch 30] [--min-share-interval 60] [--pool 10000]
//         [--initial-hps 1000000] [--hours 24] [--devices 1,5,10,20,50,100]
//
// 두 가지 상황을 함께 보여 준다.
//  A. 배포 직후(난이도 고정): 초기 난이도 = initial-hps × interval. 실제 해시레이트가 예상과 다르면 share 수가 달라진다.
//  B. 난이도 조절 후(정상 상태): 네트워크 전체 share 수는 목표 간격으로 수렴하므로 장치 수와 무관하게
//     하루 (86400 / interval) × (가동시간/24) 건이 되고, 장치 수가 늘면 장치당 몫이 줄어든다.
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    a[argv[i].slice(2)] = next === undefined || next.startsWith("--") ? true : (i++, next);
  }
  return a;
}

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/).map((line) => {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const a = parseArgs(process.argv.slice(2));
const num = (k, d) => Number(a[k] ?? d);
const P = {
  reward: num("reward", 1),
  dailyCap: num("daily-cap", 50),
  epochCap: num("epoch-cap", 500),
  interval: num("interval", 60),
  sharesPerEpoch: num("shares-per-epoch", 30),
  minShareInterval: num("min-share-interval", 60),
  pool: num("pool", 10000),
  initialHps: num("initial-hps", 1_000_000),
  hours: num("hours", 24),
};
const deviceCounts = String(a.devices ?? "1,5,10,20,50,100").split(",").map(Number);
const input = path.resolve(a.in ?? path.join("results", "bench.csv"));
const outDir = path.dirname(input);

// 장치별 최고 측정값(가장 빠른 스레드 설정)을 그 장치의 해시레이트로 본다.
const rows = parseCsv(fs.readFileSync(input, "utf8"));
const best = new Map();
for (const r of rows) {
  const hps = Number(r.hashes_per_sec);
  const prev = best.get(r.device);
  if (!prev || hps > prev.hps) best.set(r.device, { device: r.device, cpu: r.cpu_model, threads: Number(r.threads), hps, watts: r.watts });
}
const devices = [...best.values()];
if (!devices.length) throw new Error(`측정값이 없습니다: ${input}`);
const avgHps = devices.reduce((s, d) => s + d.hps, 0) / devices.length;

const DAY = 86400;
const activeFrac = Math.min(1, P.hours / 24);
const initialDifficulty = P.initialHps * P.interval;
// 정상 상태: 가동 시간 동안 목표 간격마다 1건
const steadyNetShares = (DAY / P.interval) * activeFrac;
// 에폭 상한: 에폭당 최대 지급 = min(share 수 × 보상, epochCap)
const epochsPerDay = steadyNetShares / P.sharesPerEpoch;
const epochLimitedDaily = epochsPerDay * Math.min(P.sharesPerEpoch * P.reward, P.epochCap);
const perWalletShareLimit = (DAY / Math.max(1, P.minShareInterval)) * activeFrac;

const table = deviceCounts.map((n) => {
  const netHps = n * avgHps;
  // A. 초기 난이도 고정
  const fixedNetShares = (netHps * DAY * activeFrac) / initialDifficulty;
  const fixedPerDevice = Math.min(fixedNetShares / n, perWalletShareLimit);
  const fixedPayout = Math.min(n * Math.min(fixedPerDevice * P.reward, P.dailyCap), (fixedNetShares / P.sharesPerEpoch) * P.epochCap);
  // B. 정상 상태
  const perDeviceShares = Math.min(steadyNetShares / n, perWalletShareLimit);
  const perDeviceMst = Math.min(perDeviceShares * P.reward, P.dailyCap);
  const payout = Math.min(n * perDeviceMst, epochLimitedDaily);
  const binding = n * perDeviceMst <= epochLimitedDaily
    ? (perDeviceShares * P.reward > P.dailyCap ? "일일 상한" : "목표 간격")
    : "에폭 상한";
  return {
    devices: n,
    avg_device_hps: Math.round(avgHps),
    network_hps: Math.round(netHps),
    fixed_shares_per_day: Math.round(fixedNetShares),
    fixed_mst_per_day: +fixedPayout.toFixed(2),
    steady_difficulty_hashes_per_share: Math.round(netHps * P.interval),
    steady_shares_per_day: Math.round(steadyNetShares),
    shares_per_device_per_day: +perDeviceShares.toFixed(1),
    mst_per_device_per_day: +perDeviceMst.toFixed(2),
    mst_per_day_total: +payout.toFixed(2),
    binding_limit: binding,
    pool_days: payout > 0 ? +(P.pool / payout).toFixed(1) : "",
  };
});

const csvPath = path.join(outDir, "allocation-estimate.csv");
const header = Object.keys(table[0]);
fs.writeFileSync(csvPath, [header.join(","), ...table.map((r) => header.map((h) => r[h]).join(","))].join("\n") + "\n");

const f = (n) => Number(n).toLocaleString("en-US");
const md = `# MST 채굴 배분 추정표

생성: ${new Date().toISOString()} · 입력: \`${path.relative(process.cwd(), input)}\`

## 측정 장치 (장치별 최고값)

| 장치 | CPU | 스레드 | H/s | 소비전력(W) |
|---|---|---:|---:|---:|
${devices.map((d) => `| ${d.device} | ${d.cpu} | ${d.threads} | ${f(Math.round(d.hps))} | ${d.watts || "-"} |`).join("\n")}

평균 장치 해시레이트: **${f(Math.round(avgHps))} H/s**

## 적용 파라미터

| 항목 | 값 |
|---|---|
| share 1건당 보상 | ${P.reward} MST |
| 지갑별 일일 상한 | ${P.dailyCap} MST |
| 에폭별 총량 상한 | ${P.epochCap} MST (에폭당 ${P.sharesPerEpoch} share) |
| 목표 제출 간격 | ${P.interval}초 |
| 지갑별 최소 제출 간격 | ${P.minShareInterval}초 |
| 하루 가동 시간 | ${P.hours}시간 |
| 초기 난이도 기준 해시레이트 | ${f(P.initialHps)} H/s (share당 ${f(initialDifficulty)} 해시) |
| 보상 풀 | ${f(P.pool)} MST |

## 추정표

| 장치 수 | 네트워크 H/s | A. 초기 난이도 고정: share/일 | A. MST/일 | B. 조절 후 share/일 | 장치당 share/일 | 장치당 MST/일 | **B. 총 MST/일** | 제한 요인 | 풀 소진(일) |
|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
${table.map((r) => `| ${r.devices} | ${f(r.network_hps)} | ${f(r.fixed_shares_per_day)} | ${f(r.fixed_mst_per_day)} | ${f(r.steady_shares_per_day)} | ${r.shares_per_device_per_day} | ${r.mst_per_device_per_day} | **${f(r.mst_per_day_total)}** | ${r.binding_limit} | ${r.pool_days} |`).join("\n")}

## 읽는 법

- **A (배포 직후)**: 난이도가 아직 조절되지 않은 상태. 실제 해시레이트가 초기 기준보다 크면 share가 많이 나오지만, 일일 상한과 에폭 상한에서 잘린다.
- **B (조절 후)**: 난이도가 해시레이트에 맞춰지면 네트워크 전체 share 수는 목표 간격으로 수렴한다(하루 최대 ${f(Math.round(steadyNetShares))}건). 그래서 **하루 총 지급량은 해시레이트가 아니라 파라미터(목표 간격 × 보상 × 상한)로 정해지고**, 해시레이트는 난이도와 장치 간 몫 배분에만 영향을 준다.
- 장치당 지급량은 장치 해시레이트가 같다는 가정의 평균이다. 실제로는 해시레이트에 비례해 나뉜다.
- 하루 총량 상한을 바꾸려면 \`rewardPerShare\`, \`targetInterval\`, \`dailyCapPerWallet\`을 조정한다.
`;
const mdPath = path.join(outDir, "allocation-estimate.md");
fs.writeFileSync(mdPath, md);
console.log(md);
console.log(`→ ${path.relative(process.cwd(), csvPath)}, ${path.relative(process.cwd(), mdPath)}`);
