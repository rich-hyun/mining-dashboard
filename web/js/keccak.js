// 자동 생성 파일 — 직접 고치지 말고 tools/gen-keccak.js를 수정한 뒤 다시 생성할 것.
// keccak256 (Ethereum, 패딩 0x01) 단일 블록 전용 구현. 채굴 입력은 84바이트라 블록 하나(136바이트)에 들어간다.

const RC_LO = new Int32Array([0x00000001,0x00008082,0x0000808a,0x80008000,0x0000808b,0x80000001,0x80008081,0x00008009,0x0000008a,0x00000088,0x80008009,0x8000000a,0x8000808b,0x0000008b,0x00008089,0x00008003,0x00008002,0x00000080,0x0000800a,0x8000000a,0x80008081,0x00008080,0x80000001,0x80008008]);
const RC_HI = new Int32Array([0x00000000,0x00000000,0x80000000,0x80000000,0x00000000,0x00000000,0x80000000,0x80000000,0x00000000,0x00000000,0x00000000,0x00000000,0x00000000,0x80000000,0x80000000,0x80000000,0x80000000,0x80000000,0x00000000,0x80000000,0x80000000,0x80000000,0x00000000,0x80000000]);

const bswap = (v) => ((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | (v >>> 24);

/** state(Int32Array 50)에 keccak-f[1600]을 제자리 적용한다. */
export function keccakF(s) {
  let a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32,a33,a34,a35,a36,a37,a38,a39,a40,a41,a42,a43,a44,a45,a46,a47,a48,a49;
  let b0,b1,b2,b3,b4,b5,b6,b7,b8,b9,b10,b11,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49;
  let c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,h,l;
  a0=s[0];a1=s[1];a2=s[2];a3=s[3];a4=s[4];a5=s[5];a6=s[6];a7=s[7];a8=s[8];a9=s[9];a10=s[10];a11=s[11];a12=s[12];a13=s[13];a14=s[14];a15=s[15];a16=s[16];a17=s[17];a18=s[18];a19=s[19];a20=s[20];a21=s[21];a22=s[22];a23=s[23];a24=s[24];a25=s[25];a26=s[26];a27=s[27];a28=s[28];a29=s[29];a30=s[30];a31=s[31];a32=s[32];a33=s[33];a34=s[34];a35=s[35];a36=s[36];a37=s[37];a38=s[38];a39=s[39];a40=s[40];a41=s[41];a42=s[42];a43=s[43];a44=s[44];a45=s[45];a46=s[46];a47=s[47];a48=s[48];a49=s[49];
  for (let r = 0; r < 24; r++) {
      c0=a0^a10^a20^a30^a40;c1=a1^a11^a21^a31^a41;
      c2=a2^a12^a22^a32^a42;c3=a3^a13^a23^a33^a43;
      c4=a4^a14^a24^a34^a44;c5=a5^a15^a25^a35^a45;
      c6=a6^a16^a26^a36^a46;c7=a7^a17^a27^a37^a47;
      c8=a8^a18^a28^a38^a48;c9=a9^a19^a29^a39^a49;
      h=c8^((c2<<1)|(c3>>>31));l=c9^((c3<<1)|(c2>>>31));
      a0^=h;a1^=l;
      a10^=h;a11^=l;
      a20^=h;a21^=l;
      a30^=h;a31^=l;
      a40^=h;a41^=l;
      h=c0^((c4<<1)|(c5>>>31));l=c1^((c5<<1)|(c4>>>31));
      a2^=h;a3^=l;
      a12^=h;a13^=l;
      a22^=h;a23^=l;
      a32^=h;a33^=l;
      a42^=h;a43^=l;
      h=c2^((c6<<1)|(c7>>>31));l=c3^((c7<<1)|(c6>>>31));
      a4^=h;a5^=l;
      a14^=h;a15^=l;
      a24^=h;a25^=l;
      a34^=h;a35^=l;
      a44^=h;a45^=l;
      h=c4^((c8<<1)|(c9>>>31));l=c5^((c9<<1)|(c8>>>31));
      a6^=h;a7^=l;
      a16^=h;a17^=l;
      a26^=h;a27^=l;
      a36^=h;a37^=l;
      a46^=h;a47^=l;
      h=c6^((c0<<1)|(c1>>>31));l=c7^((c1<<1)|(c0>>>31));
      a8^=h;a9^=l;
      a18^=h;a19^=l;
      a28^=h;a29^=l;
      a38^=h;a39^=l;
      a48^=h;a49^=l;
      b0=a0;b1=a1;
      b32=(a11<<4)|(a10>>>28);b33=(a10<<4)|(a11>>>28);
      b14=(a20<<3)|(a21>>>29);b15=(a21<<3)|(a20>>>29);
      b46=(a31<<9)|(a30>>>23);b47=(a30<<9)|(a31>>>23);
      b28=(a40<<18)|(a41>>>14);b29=(a41<<18)|(a40>>>14);
      b20=(a2<<1)|(a3>>>31);b21=(a3<<1)|(a2>>>31);
      b2=(a13<<12)|(a12>>>20);b3=(a12<<12)|(a13>>>20);
      b34=(a22<<10)|(a23>>>22);b35=(a23<<10)|(a22>>>22);
      b16=(a33<<13)|(a32>>>19);b17=(a32<<13)|(a33>>>19);
      b48=(a42<<2)|(a43>>>30);b49=(a43<<2)|(a42>>>30);
      b40=(a5<<30)|(a4>>>2);b41=(a4<<30)|(a5>>>2);
      b22=(a14<<6)|(a15>>>26);b23=(a15<<6)|(a14>>>26);
      b4=(a25<<11)|(a24>>>21);b5=(a24<<11)|(a25>>>21);
      b36=(a34<<15)|(a35>>>17);b37=(a35<<15)|(a34>>>17);
      b18=(a45<<29)|(a44>>>3);b19=(a44<<29)|(a45>>>3);
      b10=(a6<<28)|(a7>>>4);b11=(a7<<28)|(a6>>>4);
      b42=(a17<<23)|(a16>>>9);b43=(a16<<23)|(a17>>>9);
      b24=(a26<<25)|(a27>>>7);b25=(a27<<25)|(a26>>>7);
      b6=(a36<<21)|(a37>>>11);b7=(a37<<21)|(a36>>>11);
      b38=(a47<<24)|(a46>>>8);b39=(a46<<24)|(a47>>>8);
      b30=(a8<<27)|(a9>>>5);b31=(a9<<27)|(a8>>>5);
      b12=(a18<<20)|(a19>>>12);b13=(a19<<20)|(a18>>>12);
      b44=(a29<<7)|(a28>>>25);b45=(a28<<7)|(a29>>>25);
      b26=(a38<<8)|(a39>>>24);b27=(a39<<8)|(a38>>>24);
      b8=(a48<<14)|(a49>>>18);b9=(a49<<14)|(a48>>>18);
      a0=b0^(~b2&b4);a1=b1^(~b3&b5);
      a2=b2^(~b4&b6);a3=b3^(~b5&b7);
      a4=b4^(~b6&b8);a5=b5^(~b7&b9);
      a6=b6^(~b8&b0);a7=b7^(~b9&b1);
      a8=b8^(~b0&b2);a9=b9^(~b1&b3);
      a10=b10^(~b12&b14);a11=b11^(~b13&b15);
      a12=b12^(~b14&b16);a13=b13^(~b15&b17);
      a14=b14^(~b16&b18);a15=b15^(~b17&b19);
      a16=b16^(~b18&b10);a17=b17^(~b19&b11);
      a18=b18^(~b10&b12);a19=b19^(~b11&b13);
      a20=b20^(~b22&b24);a21=b21^(~b23&b25);
      a22=b22^(~b24&b26);a23=b23^(~b25&b27);
      a24=b24^(~b26&b28);a25=b25^(~b27&b29);
      a26=b26^(~b28&b20);a27=b27^(~b29&b21);
      a28=b28^(~b20&b22);a29=b29^(~b21&b23);
      a30=b30^(~b32&b34);a31=b31^(~b33&b35);
      a32=b32^(~b34&b36);a33=b33^(~b35&b37);
      a34=b34^(~b36&b38);a35=b35^(~b37&b39);
      a36=b36^(~b38&b30);a37=b37^(~b39&b31);
      a38=b38^(~b30&b32);a39=b39^(~b31&b33);
      a40=b40^(~b42&b44);a41=b41^(~b43&b45);
      a42=b42^(~b44&b46);a43=b43^(~b45&b47);
      a44=b44^(~b46&b48);a45=b45^(~b47&b49);
      a46=b46^(~b48&b40);a47=b47^(~b49&b41);
      a48=b48^(~b40&b42);a49=b49^(~b41&b43);
      a0^=RC_LO[r];a1^=RC_HI[r];
  }
  s[0]=a0;s[1]=a1;s[2]=a2;s[3]=a3;s[4]=a4;s[5]=a5;s[6]=a6;s[7]=a7;s[8]=a8;s[9]=a9;s[10]=a10;s[11]=a11;s[12]=a12;s[13]=a13;s[14]=a14;s[15]=a15;s[16]=a16;s[17]=a17;s[18]=a18;s[19]=a19;s[20]=a20;s[21]=a21;s[22]=a22;s[23]=a23;s[24]=a24;s[25]=a25;s[26]=a26;s[27]=a27;s[28]=a28;s[29]=a29;s[30]=a30;s[31]=a31;s[32]=a32;s[33]=a33;s[34]=a34;s[35]=a35;s[36]=a36;s[37]=a37;s[38]=a38;s[39]=a39;s[40]=a40;s[41]=a41;s[42]=a42;s[43]=a43;s[44]=a44;s[45]=a45;s[46]=a46;s[47]=a47;s[48]=a48;s[49]=a49;
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
  let a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15,a16,a17,a18,a19,a20,a21,a22,a23,a24,a25,a26,a27,a28,a29,a30,a31,a32,a33,a34,a35,a36,a37,a38,a39,a40,a41,a42,a43,a44,a45,a46,a47,a48,a49;
  let b0,b1,b2,b3,b4,b5,b6,b7,b8,b9,b10,b11,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49;
  let c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,h,l;
  const t0 = t[0] >>> 0;
  const hiWord = bswap(hiCounter | 0);
  for (let k = 0; k < count; k++) {
    const ctr = (start + k) >>> 0;
    a0=blk[0];a1=blk[1];a2=blk[2];a3=blk[3];a4=blk[4];a5=blk[5];a6=blk[6];a7=blk[7];a8=blk[8];a9=blk[9];a10=blk[10];a11=blk[11];a12=blk[12];a13=blk[13];a14=blk[14];a15=blk[15];a16=blk[16];a17=blk[17];a18=blk[18];a19=hiWord;a20=bswap(ctr);a21=blk[21];a22=blk[22];a23=blk[23];a24=blk[24];a25=blk[25];a26=blk[26];a27=blk[27];a28=blk[28];a29=blk[29];a30=blk[30];a31=blk[31];a32=blk[32];a33=blk[33];a34=0;a35=0;a36=0;a37=0;a38=0;a39=0;a40=0;a41=0;a42=0;a43=0;a44=0;a45=0;a46=0;a47=0;a48=0;a49=0;
    for (let r = 0; r < 24; r++) {
      c0=a0^a10^a20^a30^a40;c1=a1^a11^a21^a31^a41;
      c2=a2^a12^a22^a32^a42;c3=a3^a13^a23^a33^a43;
      c4=a4^a14^a24^a34^a44;c5=a5^a15^a25^a35^a45;
      c6=a6^a16^a26^a36^a46;c7=a7^a17^a27^a37^a47;
      c8=a8^a18^a28^a38^a48;c9=a9^a19^a29^a39^a49;
      h=c8^((c2<<1)|(c3>>>31));l=c9^((c3<<1)|(c2>>>31));
      a0^=h;a1^=l;
      a10^=h;a11^=l;
      a20^=h;a21^=l;
      a30^=h;a31^=l;
      a40^=h;a41^=l;
      h=c0^((c4<<1)|(c5>>>31));l=c1^((c5<<1)|(c4>>>31));
      a2^=h;a3^=l;
      a12^=h;a13^=l;
      a22^=h;a23^=l;
      a32^=h;a33^=l;
      a42^=h;a43^=l;
      h=c2^((c6<<1)|(c7>>>31));l=c3^((c7<<1)|(c6>>>31));
      a4^=h;a5^=l;
      a14^=h;a15^=l;
      a24^=h;a25^=l;
      a34^=h;a35^=l;
      a44^=h;a45^=l;
      h=c4^((c8<<1)|(c9>>>31));l=c5^((c9<<1)|(c8>>>31));
      a6^=h;a7^=l;
      a16^=h;a17^=l;
      a26^=h;a27^=l;
      a36^=h;a37^=l;
      a46^=h;a47^=l;
      h=c6^((c0<<1)|(c1>>>31));l=c7^((c1<<1)|(c0>>>31));
      a8^=h;a9^=l;
      a18^=h;a19^=l;
      a28^=h;a29^=l;
      a38^=h;a39^=l;
      a48^=h;a49^=l;
      b0=a0;b1=a1;
      b32=(a11<<4)|(a10>>>28);b33=(a10<<4)|(a11>>>28);
      b14=(a20<<3)|(a21>>>29);b15=(a21<<3)|(a20>>>29);
      b46=(a31<<9)|(a30>>>23);b47=(a30<<9)|(a31>>>23);
      b28=(a40<<18)|(a41>>>14);b29=(a41<<18)|(a40>>>14);
      b20=(a2<<1)|(a3>>>31);b21=(a3<<1)|(a2>>>31);
      b2=(a13<<12)|(a12>>>20);b3=(a12<<12)|(a13>>>20);
      b34=(a22<<10)|(a23>>>22);b35=(a23<<10)|(a22>>>22);
      b16=(a33<<13)|(a32>>>19);b17=(a32<<13)|(a33>>>19);
      b48=(a42<<2)|(a43>>>30);b49=(a43<<2)|(a42>>>30);
      b40=(a5<<30)|(a4>>>2);b41=(a4<<30)|(a5>>>2);
      b22=(a14<<6)|(a15>>>26);b23=(a15<<6)|(a14>>>26);
      b4=(a25<<11)|(a24>>>21);b5=(a24<<11)|(a25>>>21);
      b36=(a34<<15)|(a35>>>17);b37=(a35<<15)|(a34>>>17);
      b18=(a45<<29)|(a44>>>3);b19=(a44<<29)|(a45>>>3);
      b10=(a6<<28)|(a7>>>4);b11=(a7<<28)|(a6>>>4);
      b42=(a17<<23)|(a16>>>9);b43=(a16<<23)|(a17>>>9);
      b24=(a26<<25)|(a27>>>7);b25=(a27<<25)|(a26>>>7);
      b6=(a36<<21)|(a37>>>11);b7=(a37<<21)|(a36>>>11);
      b38=(a47<<24)|(a46>>>8);b39=(a46<<24)|(a47>>>8);
      b30=(a8<<27)|(a9>>>5);b31=(a9<<27)|(a8>>>5);
      b12=(a18<<20)|(a19>>>12);b13=(a19<<20)|(a18>>>12);
      b44=(a29<<7)|(a28>>>25);b45=(a28<<7)|(a29>>>25);
      b26=(a38<<8)|(a39>>>24);b27=(a39<<8)|(a38>>>24);
      b8=(a48<<14)|(a49>>>18);b9=(a49<<14)|(a48>>>18);
      a0=b0^(~b2&b4);a1=b1^(~b3&b5);
      a2=b2^(~b4&b6);a3=b3^(~b5&b7);
      a4=b4^(~b6&b8);a5=b5^(~b7&b9);
      a6=b6^(~b8&b0);a7=b7^(~b9&b1);
      a8=b8^(~b0&b2);a9=b9^(~b1&b3);
      a10=b10^(~b12&b14);a11=b11^(~b13&b15);
      a12=b12^(~b14&b16);a13=b13^(~b15&b17);
      a14=b14^(~b16&b18);a15=b15^(~b17&b19);
      a16=b16^(~b18&b10);a17=b17^(~b19&b11);
      a18=b18^(~b10&b12);a19=b19^(~b11&b13);
      a20=b20^(~b22&b24);a21=b21^(~b23&b25);
      a22=b22^(~b24&b26);a23=b23^(~b25&b27);
      a24=b24^(~b26&b28);a25=b25^(~b27&b29);
      a26=b26^(~b28&b20);a27=b27^(~b29&b21);
      a28=b28^(~b20&b22);a29=b29^(~b21&b23);
      a30=b30^(~b32&b34);a31=b31^(~b33&b35);
      a32=b32^(~b34&b36);a33=b33^(~b35&b37);
      a34=b34^(~b36&b38);a35=b35^(~b37&b39);
      a36=b36^(~b38&b30);a37=b37^(~b39&b31);
      a38=b38^(~b30&b32);a39=b39^(~b31&b33);
      a40=b40^(~b42&b44);a41=b41^(~b43&b45);
      a42=b42^(~b44&b46);a43=b43^(~b45&b47);
      a44=b44^(~b46&b48);a45=b45^(~b47&b49);
      a46=b46^(~b48&b40);a47=b47^(~b49&b41);
      a48=b48^(~b40&b42);a49=b49^(~b41&b43);
      a0^=RC_LO[r];a1^=RC_HI[r];
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
