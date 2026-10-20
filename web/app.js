/* Mustree Wrap 프론트엔드 — 읽기는 브리지 API(/api), 쓰기는 MetaMask로 VYD 컨트랙트 직접 호출 */
(() => {
  "use strict";

  const TOKEN_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function minRedeem() view returns (uint256)",
    "function paused() view returns (bool)",
    "function unwrap(uint256 amount, string verusAddress) returns (uint256)",
  ];
  const SIGN_PREFIX = "Mustree 래핑 입금 주소 요청";

  const state = { cfg: null, account: null, provider: null, signer: null };
  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");

  // ── 유틸 ────────────────────────────────
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const short = (s, n = 6) => (s && s.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-n)}` : s || "-");
  const fmtNum = (v, d = 4) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("ko-KR", { maximumFractionDigits: d }) : esc(v);
  };
  const fmtHash = (h) => {
    if (h === null || h === undefined) return "-";
    const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s"];
    let n = Number(h), i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return `${n.toFixed(2)} ${units[i]}`;
  };
  const fmtTime = (t) => (t ? new Date(t).toLocaleString("ko-KR") : "-");

  function toast(msg, bad = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "show" + (bad ? " bad" : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = ""), 4200);
  }

  async function api(path, opts = {}) {
    const res = await fetch("/api" + path, {
      ...opts,
      headers: { "content-type": "application/json", ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }

  const STATUS = {
    pending: ["확인 대기", "warn"],
    minting: ["발행 중", "warn"],
    minted: ["발행 완료", "ok"],
    too_small: ["최소 금액 미만", "bad"],
    failed: ["발행 재시도 중", "bad"],
    queued: ["송금 대기", "warn"],
    sending: ["송금 중", "warn"],
    sent: ["송금 완료·기록 중", "warn"],
    done: ["완료", "ok"],
    manual_review: ["관리자 확인 중", "bad"],
  };
  const pill = (s) => {
    const [label, cls] = STATUS[s] || [s, ""];
    return `<span class="pill ${cls}">${esc(label)}</span>`;
  };

  // ── 지갑 ────────────────────────────────
  async function ensureChain() {
    const cfg = state.cfg;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: cfg.chainIdHex }] });
    } catch (e) {
      if (e.code !== 4902) throw e;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: cfg.chainIdHex,
          chainName: "VYD",
          nativeCurrency: { name: "VYD", symbol: "VYD", decimals: 18 },
          rpcUrls: [cfg.rpc],
        }],
      });
    }
  }

  async function connect() {
    if (!window.ethereum) return toast("MetaMask가 필요합니다", true);
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      await ensureChain();
      state.provider = new ethers.BrowserProvider(window.ethereum);
      state.signer = await state.provider.getSigner();
      state.account = (await state.signer.getAddress()).toLowerCase();
      renderConnect();
      route();
    } catch (e) {
      toast(e.shortMessage || e.message, true);
    }
  }

  function renderConnect() {
    const b = $("#connectBtn");
    b.textContent = state.account ? short(state.account, 4) : "지갑 연결";
    b.className = state.account ? "btn small ghost" : "btn small";
  }

  async function addTokenToWallet() {
    try {
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: state.cfg.token, symbol: "mVRSC", decimals: 8 } },
      });
    } catch (e) {
      toast(e.message, true);
    }
  }

  const needWallet = (title) => `
    <h1>${esc(title)}</h1>
    <div class="card empty">
      <p>MetaMask 지갑을 연결하면 VYD 네트워크가 자동으로 추가됩니다.</p>
      <button class="btn" data-act="connect">지갑 연결</button>
    </div>`;

  // ── 페이지: 대시보드 ─────────────────────
  async function pageDashboard() {
    const s = await api("/stats");
    const p = s.proof;
    const pct = p?.ratio == null ? 100 : Math.min(100, p.ratio);
    view.innerHTML = `
      <h1>대시보드</h1>
      <p class="lead">Verus에서 채굴·입금된 VRSC가 브리지 지갑에 보관되고, 같은 양의 mVRSC가 VYD 체인에서 발행됩니다.</p>

      <div class="card">
        <h2>준비금 증명</h2>
        <div class="proof">
          <div class="stat"><div class="label">보관 중인 VRSC</div><div class="value">${fmtNum(p?.reserve, 8)}</div></div>
          <div class="stat"><div class="label">발행·지급 예정 부채</div><div class="value">${fmtNum(p?.liabilities, 8)}</div></div>
          <div style="flex:1;min-width:220px">
            <div class="bar ${p && !p.healthy ? "bad" : ""}"><i style="width:${pct}%"></i></div>
            <div class="hint ${p?.healthy ? "ok" : "bad"}">
              ${p ? (p.ratio == null ? "발행량 0 — 정상" : `담보율 ${p.ratio}% ${p.healthy ? "· 정상" : "· 부족"}`) : "노드 연결 대기"}
            </div>
          </div>
        </div>
      </div>

      <div class="grid">
        <div class="card stat"><div class="label">mVRSC 유통량</div><div class="value">${fmtNum(s.vyd?.supply, 8)}</div>
          <div class="sub">${s.vyd?.paused ? "⚠ 일시정지됨" : "정상 운영"}</div></div>
        <div class="card stat"><div class="label">VYD 블록</div><div class="value">${fmtNum(s.vyd?.block, 0)}</div>
          <div class="sub">${s.vyd ? fmtTime(s.vyd.blockTime * 1000) : "-"}</div></div>
        <div class="card stat"><div class="label">Verus 블록</div><div class="value">${fmtNum(s.verus?.blocks, 0)}</div>
          <div class="sub">동기화 ${s.verus?.syncProgress != null ? (s.verus.syncProgress * 100).toFixed(2) + "%" : "-"}</div></div>
        <div class="card stat"><div class="label">채굴</div><div class="value">${s.mining?.generate ? "가동 중" : "정지"}</div>
          <div class="sub">${fmtHash(s.mining?.localHashps)} · 찾은 블록 ${s.counts?.blocksMined ?? 0}</div></div>
      </div>

      <div class="grid">
        <div class="card stat"><div class="label">발행 완료 입금</div><div class="value">${s.counts?.minted ?? 0}</div></div>
        <div class="card stat"><div class="label">확인 대기 입금</div><div class="value">${s.counts?.pendingDeposits ?? 0}</div></div>
        <div class="card stat"><div class="label">완료된 언래핑</div><div class="value">${s.counts?.redeemed ?? 0}</div></div>
        <div class="card stat"><div class="label">처리 중 언래핑</div><div class="value">${s.counts?.openRedemptions ?? 0}</div></div>
      </div>

      ${s.errors?.length ? `<div class="notice">${s.errors.map(esc).join("<br>")}</div>` : ""}
      <p class="hint">갱신: ${fmtTime(s.updatedAt)}</p>`;
  }

  // ── 페이지: 채굴 ────────────────────────
  async function pageMining() {
    const m = await api("/mining");
    const rows = (list) =>
      list.length
        ? `<div class="scroll"><table><tr><th>시각</th><th>Verus txid</th><th>수량</th><th>확인</th><th>상태</th></tr>
          ${list.map((d) => `<tr><td>${fmtTime(d.createdAt)}</td><td class="mono">${esc(short(d.txid, 8))}</td>
            <td class="mono">${fmtNum(d.amount, 8)}</td><td>${d.confirmations}</td><td>${pill(d.status)}</td></tr>`).join("")}
          </table></div>`
        : `<div class="empty">아직 없습니다</div>`;

    view.innerHTML = `
      <h1>채굴</h1>
      <p class="lead">VerusHash(CPU) 채굴로 얻은 VRSC는 자동으로 mVRSC로 래핑되어 운영 지갑
        <span class="mono">${esc(short(m.rewardEvm, 6))}</span>에 발행됩니다.</p>

      <div class="grid">
        <div class="card stat"><div class="label">상태</div><div class="value">${m.generate ? "가동 중" : "정지"}</div>
          <div class="sub">스레드 ${m.threads ?? "-"}</div></div>
        <div class="card stat"><div class="label">내 해시레이트</div><div class="value">${fmtHash(m.localHashps)}</div></div>
        <div class="card stat"><div class="label">네트워크 해시레이트</div><div class="value">${fmtHash(m.networkHashps)}</div></div>
        <div class="card stat"><div class="label">난이도</div><div class="value">${fmtNum(m.difficulty, 2)}</div></div>
      </div>

      <div class="card">
        <h2>풀 채굴 지급 주소</h2>
        <p class="hint" style="margin-top:0">외부 채굴기(hellminer, ccminer 등)를 풀에 붙일 때 이 주소를 지급 주소로 쓰면, 풀 지급금이 들어오는 즉시 자동 래핑됩니다.</p>
        <div class="addr">${esc(m.miningAddress || "노드 연결 후 생성됩니다")}</div>
      </div>

      <div class="card"><h2>솔로 채굴로 찾은 블록</h2>${rows(m.blocks)}
        <p class="hint">코인베이스는 100블록(약 100분) 성숙 후 발행됩니다.</p></div>
      <div class="card"><h2>풀 지급금</h2>${rows(m.payouts)}</div>`;
  }

  // ── 페이지: 래핑 ────────────────────────
  async function pageWrap() {
    if (!state.account) return (view.innerHTML = needWallet("래핑 (VRSC → mVRSC)"));
    const acc = await api(`/account/${state.account}`);
    const cfg = state.cfg;

    view.innerHTML = `
      <h1>래핑 <span class="hint">VRSC → mVRSC</span></h1>
      <p class="lead">아래 Verus 주소로 VRSC를 보내면 ${cfg.verusMinConf}회 확인(약 ${cfg.verusMinConf}분) 후
        연결된 지갑으로 같은 양의 mVRSC가 발행됩니다.</p>

      <div class="card">
        ${acc.depositAddress ? `
          <div class="deposit">
            <div id="qr"></div>
            <div>
              <label style="margin-top:0">내 전용 Verus 입금 주소</label>
              <div class="addr">${esc(acc.depositAddress)}</div>
              <div class="row" style="margin-top:12px">
                <button class="btn small ghost" data-act="copy" data-v="${esc(acc.depositAddress)}">주소 복사</button>
                <button class="btn small ghost" data-act="watch">지갑에 mVRSC 추가</button>
              </div>
              <ul class="steps" style="margin-top:18px">
                <li>최소 입금 <b>${esc(cfg.minDeposit)} VRSC</b> — 미만은 발행되지 않습니다</li>
                <li>이 주소는 <b>${esc(short(state.account, 6))}</b> 지갑에 영구히 연결됩니다</li>
                <li>Verus 지갑·거래소에서 VRSC 메인넷으로만 보내세요 (PBaaS 다른 통화 X)</li>
              </ul>
            </div>
          </div>` : `
          <div class="empty">
            <p>지갑 서명으로 소유를 확인한 뒤 전용 입금 주소를 발급합니다. (가스비 없음)</p>
            <button class="btn" data-act="issue">입금 주소 발급</button>
          </div>`}
      </div>

      <div class="card"><h2>입금 현황</h2>${depositTable(acc.deposits)}</div>`;

    if (acc.depositAddress && window.QRCode) {
      new QRCode($("#qr"), { text: acc.depositAddress, width: 160, height: 160 });
    }
  }

  const depositTable = (list) =>
    list.length
      ? `<div class="scroll"><table><tr><th>시각</th><th>Verus txid</th><th>수량</th><th>확인</th><th>상태</th><th>발행 tx</th></tr>
        ${list.map((d) => `<tr><td>${fmtTime(d.createdAt)}</td><td class="mono">${esc(short(d.txid, 8))}</td>
          <td class="mono">${fmtNum(d.amount, 8)}</td><td>${d.confirmations}/${state.cfg.verusMinConf}</td>
          <td>${pill(d.status)}${d.error ? `<div class="hint bad">${esc(d.error)}</div>` : ""}</td>
          <td class="mono">${esc(short(d.mintTx, 6))}</td></tr>`).join("")}</table></div>`
      : `<div class="empty">입금 내역이 없습니다</div>`;

  async function issueAddress() {
    try {
      const issuedAt = Date.now();
      const msg = `${SIGN_PREFIX}\n지갑: ${state.account}\n시각: ${issuedAt}`;
      const signature = await state.signer.signMessage(msg);
      await api("/deposit-address", { method: "POST", body: JSON.stringify({ evmAddress: state.account, issuedAt, signature }) });
      toast("입금 주소가 발급되었습니다");
      route();
    } catch (e) {
      toast(e.shortMessage || e.message, true);
    }
  }

  // ── 페이지: 언래핑 ──────────────────────
  async function pageUnwrap() {
    if (!state.account) return (view.innerHTML = needWallet("언래핑 (mVRSC → VRSC)"));
    const token = new ethers.Contract(state.cfg.token, TOKEN_ABI, state.provider);
    const [bal, min, paused] = await Promise.all([token.balanceOf(state.account), token.minRedeem(), token.paused()]);
    const balStr = ethers.formatUnits(bal, 8);
    const minStr = ethers.formatUnits(min, 8);

    view.innerHTML = `
      <h1>언래핑 <span class="hint">mVRSC → VRSC</span></h1>
      <p class="lead">mVRSC를 소각하면 브리지가 입력한 Verus 주소로 VRSC를 보냅니다.
        Verus 송금 수수료 ${esc(state.cfg.redeemFee)} VRSC가 차감됩니다.</p>
      ${paused ? `<div class="notice">현재 브리지가 일시정지 상태입니다.</div>` : ""}
      <div class="card">
        <div class="grid" style="margin:0">
          <div class="stat"><div class="label">내 mVRSC</div><div class="value">${fmtNum(balStr, 8)}</div></div>
          <div class="stat"><div class="label">최소 언래핑</div><div class="value">${fmtNum(minStr, 8)}</div></div>
        </div>
        <label for="uAmt">수량 (mVRSC)</label>
        <div class="row">
          <input id="uAmt" inputmode="decimal" placeholder="0.0" />
          <button class="btn ghost small" data-act="max" data-v="${esc(balStr)}">최대</button>
        </div>
        <label for="uAddr">받을 Verus 주소 (R… 또는 VerusID@)</label>
        <input id="uAddr" placeholder="RXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" autocomplete="off" />
        <div id="addrHint" class="hint"></div>
        <div id="recv" class="hint"></div>
        <div style="margin-top:18px"><button class="btn" id="unwrapBtn" ${paused ? "disabled" : ""}>소각하고 VRSC 받기</button></div>
      </div>`;

    const amt = $("#uAmt"), addr = $("#uAddr"), hint = $("#addrHint"), recv = $("#recv");
    let addrOk = false, t;
    amt.addEventListener("input", () => {
      const v = Number(amt.value), fee = Number(state.cfg.redeemFee);
      recv.textContent = v > fee ? `받는 수량 ≈ ${(v - fee).toFixed(8).replace(/\.?0+$/, "")} VRSC` : "";
    });
    addr.addEventListener("input", () => {
      addrOk = false;
      clearTimeout(t);
      const v = addr.value.trim();
      if (!v) return (hint.textContent = "");
      hint.className = "hint";
      hint.textContent = "확인 중…";
      t = setTimeout(async () => {
        try {
          const r = await api(`/validate-address/${encodeURIComponent(v)}`);
          addrOk = r.valid;
          hint.className = "hint " + (r.valid ? "ok" : "bad");
          hint.textContent = r.valid ? (r.isMine ? "유효 — ⚠ 브리지 지갑 주소입니다 (재래핑됨)" : "유효한 Verus 주소") : "유효하지 않은 주소";
        } catch (e) {
          hint.className = "hint bad";
          hint.textContent = e.message;
        }
      }, 400);
    });

    $("#unwrapBtn").addEventListener("click", async () => {
      let amount;
      try { amount = ethers.parseUnits(amt.value.trim() || "0", 8); } catch { return toast("수량 형식 오류", true); }
      if (amount <= 0n) return toast("수량을 입력하세요", true);
      if (amount < min) return toast(`최소 ${minStr} mVRSC 이상`, true);
      if (amount > bal) return toast("잔액 부족", true);
      if (!addrOk) return toast("Verus 주소를 확인하세요", true);
      if (!confirm(`${amt.value} mVRSC를 소각하고\n${addr.value.trim()}\n로 VRSC를 받습니다. 주소가 틀리면 되돌릴 수 없습니다.`)) return;

      const btn = $("#unwrapBtn");
      btn.disabled = true;
      btn.textContent = "지갑 승인 대기…";
      try {
        const c = new ethers.Contract(state.cfg.token, TOKEN_ABI, state.signer);
        const tx = await c.unwrap(amount, addr.value.trim(), { gasLimit: 200000n });
        btn.textContent = "블록 확인 중…";
        await tx.wait();
        toast("소각 완료 — 약 1분 내 VRSC 송금이 시작됩니다");
        location.hash = "#/history";
      } catch (e) {
        toast(e.shortMessage || e.message, true);
        btn.disabled = false;
        btn.textContent = "소각하고 VRSC 받기";
      }
    });
  }

  // ── 페이지: 내역 ────────────────────────
  async function pageHistory() {
    if (!state.account) return (view.innerHTML = needWallet("내역"));
    const acc = await api(`/account/${state.account}`);
    view.innerHTML = `
      <h1>내역</h1>
      <p class="lead mono">${esc(state.account)}</p>
      <div class="card"><h2>래핑 (입금)</h2>${depositTable(acc.deposits)}</div>
      <div class="card"><h2>언래핑 (출금)</h2>${
        acc.redemptions.length
          ? `<div class="scroll"><table><tr><th>#</th><th>시각</th><th>수량</th><th>받는 주소</th><th>상태</th><th>Verus txid</th></tr>
            ${acc.redemptions.map((r) => `<tr><td>${r.nonce}</td><td>${fmtTime(r.createdAt)}</td>
              <td class="mono">${fmtNum(r.amount, 8)}</td><td class="mono">${esc(short(r.verusAddress, 6))}</td>
              <td>${pill(r.status)}</td><td class="mono">${esc(short(r.verusTxid, 8))}</td></tr>`).join("")}</table></div>`
          : `<div class="empty">언래핑 내역이 없습니다</div>`
      }</div>`;
  }

  // ── 페이지: 관리자 ──────────────────────
  const adminToken = {
    get: () => { try { return sessionStorage.getItem("mw_admin") || ""; } catch { return ""; } },
    set: (v) => { try { sessionStorage.setItem("mw_admin", v); } catch {} },
  };
  const adminApi = (path, opts = {}) =>
    api("/admin" + path, { ...opts, headers: { authorization: `Bearer ${adminToken.get()}` } });

  async function pageAdmin() {
    if (!adminToken.get()) {
      view.innerHTML = `
        <h1>관리자</h1>
        <div class="card"><label for="tok" style="margin-top:0">관리자 토큰 (.env의 ADMIN_TOKEN)</label>
          <div class="row"><input id="tok" type="password" /><button class="btn" data-act="login">들어가기</button></div></div>`;
      return;
    }
    let o;
    try {
      o = await adminApi("/overview");
    } catch (e) {
      adminToken.set("");
      toast(e.message, true);
      return pageAdmin();
    }
    const m = o.stats.mining || {};
    view.innerHTML = `
      <h1>관리자</h1>
      <p class="lead">발급된 입금 주소 ${o.addressCount}개 · 갱신 ${fmtTime(o.stats.updatedAt)}</p>

      <div class="card">
        <h2>솔로 채굴 제어 (verusd setgenerate)</h2>
        <div class="row">
          <div><label>현재</label><div class="mono">${m.generate ? `가동 중 · ${m.threads} 스레드 · ${fmtHash(m.localHashps)}` : "정지"}</div></div>
          <div><label for="thr">스레드 수</label><input id="thr" type="number" min="1" max="64" value="${m.threads > 0 ? m.threads : 2}" /></div>
          <button class="btn" data-act="mine-on">채굴 시작</button>
          <button class="btn ghost" data-act="mine-off">정지</button>
        </div>
        <p class="hint">서버 CPU 코어 수보다 1~2개 적게 두세요. 브리지·노드가 같이 돌고 있습니다.</p>
      </div>

      <div class="card"><h2>확인이 필요한 언래핑</h2>${
        o.attentionRedemptions.length
          ? `<div class="scroll"><table><tr><th>#</th><th>지갑</th><th>수량</th><th>받는 주소</th><th>상태</th><th>사유</th><th>조치</th></tr>
            ${o.attentionRedemptions.map((r) => `<tr><td>${r.nonce}</td><td class="mono">${esc(short(r.evmAddress, 4))}</td>
              <td class="mono">${fmtNum(r.amount, 8)}</td><td class="mono">${esc(short(r.verusAddress, 6))}</td>
              <td>${pill(r.status)}</td><td>${esc(r.error || "")}</td>
              <td>${r.status === "manual_review" ? `
                <button class="btn small ghost" data-act="r-retry" data-v="${r.nonce}">미송금 → 재송금</button>
                <button class="btn small ghost" data-act="r-resolve" data-v="${r.nonce}">송금됨 → txid 입력</button>` : ""}</td></tr>`).join("")}
            </table></div>`
          : `<div class="empty">없음</div>`
      }</div>

      <div class="card"><h2>확인이 필요한 입금</h2>${
        o.attentionDeposits.length
          ? `<div class="scroll"><table><tr><th>입금</th><th>지갑</th><th>수량</th><th>상태</th><th>사유</th><th></th></tr>
            ${o.attentionDeposits.map((d) => `<tr><td class="mono">${esc(short(d.id, 8))}</td><td class="mono">${esc(short(d.evmAddress, 4))}</td>
              <td class="mono">${fmtNum(d.amount, 8)}</td><td>${pill(d.status)}</td><td>${esc(d.error || "")}</td>
              <td><button class="btn small ghost" data-act="d-retry" data-v="${esc(d.id)}">재시도</button></td></tr>`).join("")}
            </table></div>`
          : `<div class="empty">없음</div>`
      }</div>
      <button class="btn ghost small" data-act="logout">로그아웃</button>`;
  }

  // ── 라우터 ──────────────────────────────
  const routes = {
    "/": pageDashboard,
    "/mining": pageMining,
    "/wrap": pageWrap,
    "/unwrap": pageUnwrap,
    "/history": pageHistory,
    "/admin": pageAdmin,
  };
  let refreshTimer;
  async function route() {
    const path = location.hash.replace(/^#/, "") || "/";
    const fn = routes[path] || pageDashboard;
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + path));
    try {
      await fn();
    } catch (e) {
      view.innerHTML = `<div class="card empty">불러오지 못했습니다: ${esc(e.message)}</div>`;
    }
    clearTimeout(refreshTimer);
    // 입력 화면이 아닌 곳은 30초마다 자동 갱신
    if (["/", "/mining", "/wrap", "/history"].includes(path)) refreshTimer = setTimeout(route, 30_000);
  }

  // ── 이벤트 ──────────────────────────────
  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const v = el.dataset.v;
    switch (el.dataset.act) {
      case "connect": return connect();
      case "issue": return issueAddress();
      case "watch": return addTokenToWallet();
      case "copy":
        await navigator.clipboard.writeText(v);
        return toast("복사했습니다");
      case "max": $("#uAmt").value = v; $("#uAmt").dispatchEvent(new Event("input")); return;
      case "login": adminToken.set($("#tok").value.trim()); return route();
      case "logout": adminToken.set(""); return route();
      case "mine-on":
      case "mine-off":
        try {
          await adminApi("/mining", { method: "POST", body: JSON.stringify({ on: el.dataset.act === "mine-on", threads: Number($("#thr").value) }) });
          toast(el.dataset.act === "mine-on" ? "채굴을 시작했습니다" : "채굴을 정지했습니다");
          setTimeout(route, 1500);
        } catch (e) { toast(e.message, true); }
        return;
      case "r-retry":
        if (!confirm(`#${v}: Verus 지갑에서 실제로 송금되지 않은 것을 확인했습니까? 다시 송금합니다.`)) return;
        await adminApi(`/redemptions/${v}/retry`, { method: "POST" }).then(() => route(), (e) => toast(e.message, true));
        return;
      case "r-resolve": {
        const txid = prompt(`#${v}: 이미 보낸 Verus 송금 txid를 입력하세요`);
        if (!txid) return;
        await adminApi(`/redemptions/${v}/resolve`, { method: "POST", body: JSON.stringify({ verusTxid: txid }) }).then(() => route(), (e) => toast(e.message, true));
        return;
      }
      case "d-retry":
        await adminApi(`/deposits/${encodeURIComponent(v)}/retry`, { method: "POST" }).then(() => route(), (e) => toast(e.message, true));
        return;
    }
  });
  $("#connectBtn").addEventListener("click", connect);
  window.addEventListener("hashchange", route);

  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", () => (state.account ? connect() : null));
    window.ethereum.on?.("chainChanged", () => location.reload());
  }

  // ── 시작 ────────────────────────────────
  (async () => {
    try {
      state.cfg = await api("/config");
    } catch (e) {
      view.innerHTML = `<div class="card empty">브리지 서버에 연결할 수 없습니다: ${esc(e.message)}</div>`;
      return;
    }
    // 이미 연결 허용된 지갑이면 조용히 복원
    if (window.ethereum) {
      const accs = await window.ethereum.request({ method: "eth_accounts" }).catch(() => []);
      if (accs.length) {
        const cid = await window.ethereum.request({ method: "eth_chainId" }).catch(() => null);
        if (cid?.toLowerCase() === state.cfg.chainIdHex) {
          state.provider = new ethers.BrowserProvider(window.ethereum);
          state.signer = await state.provider.getSigner();
          state.account = accs[0].toLowerCase();
          renderConnect();
        }
      }
    }
    route();
  })();
})();
