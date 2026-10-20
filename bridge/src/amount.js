// VRSC와 mVRSC 모두 소수점 8자리. 금액은 내부적으로 sats(BigInt)로만 다룬다.
const DEC = 8n;
const BASE = 10n ** DEC;

/** "12.345" 또는 12.345 → 1234500000n */
export function toSats(v) {
  const s = typeof v === "number" ? v.toFixed(8) : String(v).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`잘못된 금액: ${v}`);
  const [i, f = ""] = s.split(".");
  return BigInt(i) * BASE + BigInt((f + "00000000").slice(0, 8));
}

/** 1234500000n → "12.345" */
export function fromSats(sats) {
  const b = BigInt(sats);
  const neg = b < 0n;
  const a = neg ? -b : b;
  const i = a / BASE;
  const f = (a % BASE).toString().padStart(8, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + i.toString() + (f ? "." + f : "");
}
