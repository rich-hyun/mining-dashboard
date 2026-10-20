# Mustree Wrap — Verus(VRSC) 채굴·래핑 → VYD 체인 mVRSC

```
 [Verus 메인넷]                          [브리지 서버]                         [VYD 체인 7603]
  솔로 채굴 코인베이스 ─┐
  풀 채굴 지급금 ───────┼─▶ verusd 지갑 ─▶ 입금 감시(10확인) ─▶ mintWrapped ─▶ mVRSC 발행
  사용자 입금 ──────────┘     (준비금)                                          │
                                ▲                                                ▼
         VRSC 송금 ◀── sendtoaddress ◀── UnwrapRequested 감시(6확인) ◀── 사용자 unwrap(소각)
```

- **1:1 담보**: 브리지 Verus 지갑 잔고 ≥ mVRSC 유통량. 대시보드에 준비금 증명 표시
- **중복 발행 불가**: 컨트랙트가 `depositId = keccak(txid, vout)`를 기록
- **이중 송금 방지**: 송금 직전 상태를 DB에 먼저 기록, 서버가 중간에 죽으면 `관리자 확인`으로 넘김

## 폴더

| 경로 | 내용 |
|---|---|
| `contracts/` | `MustreeWrappedVRSC.sol` (ERC20, 8자리, 발행·소각·완료기록·일시정지), 배포·권한 스크립트, 테스트 |
| `bridge/` | Node.js 브리지 서버 + REST API (verusd RPC, ethers v6, SQLite) |
| `web/` | 정적 웹: 대시보드 · 채굴 · 래핑 · 언래핑 · 내역 · 관리자 |
| `deploy/` | verusd 설치 스크립트, nginx 설정 |
| `docker-compose.yml` | 브리지 컨테이너 |
| `.github/workflows/deploy.yml` | main 푸시 시 서버 자동 배포 |

---

## 서버에 바로 올리기 (로컬 작업 없이)

권장 서버: Ubuntu 22.04/24.04, **4코어 이상 · RAM 8GB · SSD 150GB 이상** (Verus 풀노드 + 채굴).
VYD 노드(vyd.mustree.kr)와 같은 서버도 되지만, 채굴이 CPU를 다 쓰므로 **별도 서버를 권장**합니다.

### 0) DNS
`wrap.mustree.kr` A 레코드 → 새 서버 IP

### 1) 서버 접속 후 기본 설치
```bash
ssh ubuntu@<서버IP>
sudo apt update && sudo apt install -y git nginx certbot python3-certbot-nginx docker.io docker-compose-v2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo git clone https://github.com/rich-hyun/mustree-wrap.git /opt/mustree-wrap   # 저장소를 먼저 만들어 푸시
sudo chown -R $USER /opt/mustree-wrap && cd /opt/mustree-wrap
```

### 2) Verus 풀노드
[Verus 릴리스 페이지](https://github.com/VerusCoin/VerusCoin/releases)에서 최신 **Linux x86_64 CLI** tgz 링크를 복사해서:
```bash
VERUS_URL="https://github.com/VerusCoin/VerusCoin/releases/download/<버전>/<파일명>.tgz" \
  sudo -E bash deploy/install-verusd.sh
# 출력된 RPC 비밀번호 메모
# 동기화 단축(선택): sudo -u verus /opt/verus/fetch-bootstrap
sudo -u verus verus getblockchaininfo | jq '.blocks, .headers'   # 두 값이 같아질 때까지 대기
```

### 3) 컨트랙트 배포 (서버에서)
```bash
cd /opt/mustree-wrap/contracts
cp .env.example .env && nano .env        # DEPLOYER_KEY = 기존 관리자 계정 0x675f…e812 키
npm install
npx hardhat test                          # 테스트 통과 확인
npm run deploy:vyd                        # 출력된 토큰 주소·배포 블록 메모
```
브리지 전용 지갑을 새로 만들고(관리자 키와 분리), 발행 권한을 줍니다:
```bash
node -e "const w=require('ethers').Wallet.createRandom();console.log(w.address, w.privateKey)"
# .env 에 TOKEN_ADDRESS, MINTER_ADDRESS(위 주소) 입력 후
npm run grant:vyd
```
> 브리지 지갑에는 가스용 **VYD를 소량 보내 두세요** (Clique 체인이면 관리자 계정에서 전송).
> 끝나면 `contracts/.env`의 DEPLOYER_KEY는 서버에서 지우는 것을 권장합니다.

### 4) 브리지 서버
```bash
cd /opt/mustree-wrap/bridge
cp .env.example .env && nano .env
#  VERUS_RPC_PASS  = 2)에서 메모한 값
#  TOKEN_ADDRESS / TOKEN_DEPLOY_BLOCK = 3)의 출력
#  MINTER_KEY      = 브리지 전용 지갑 개인키
#  ADMIN_TOKEN     = openssl rand -hex 32
chmod 600 .env
cd .. && sudo docker compose up -d --build
sudo docker compose logs -f bridge        # "Verus 노드 연결", "채굴 지급 주소" 로그 확인
curl http://127.0.0.1:8787/api/stats
```

### 5) 웹 + HTTPS
```bash
sudo mkdir -p /var/www/mustree-wrap && sudo rsync -a --delete web/ /var/www/mustree-wrap/
sudo cp deploy/nginx-wrap.conf /etc/nginx/sites-available/wrap.mustree.kr
sudo ln -sf /etc/nginx/sites-available/wrap.mustree.kr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d wrap.mustree.kr
```
→ https://wrap.mustree.kr 접속

### 6) 이후 자동 배포 (GitHub Actions)
저장소 Settings → Secrets and variables → Actions
- Variables: `SSH_HOST`, `SSH_USER`, `APP_DIR=/opt/mustree-wrap`
- Secrets: `SSH_KEY` (서버 `~/.ssh/authorized_keys`에 등록한 배포용 키의 개인키)

이제 `main`에 푸시하면 웹 반영 + 브리지 재빌드가 자동으로 됩니다. (`.env`와 DB는 서버에만 있고 덮어쓰지 않음)

---

## 채굴 운영

- **솔로 채굴**: 관리자 페이지 → 스레드 수 입력 → 채굴 시작 (`setgenerate true N`). 코인베이스는 100블록 성숙 후 `MINING_REWARD_EVM`으로 자동 래핑.
  솔로로 블록을 찾을 확률은 해시레이트 비율에 비례하므로, 소규모 CPU면 수일~수주에 한 번일 수 있습니다.
- **풀 채굴(권장)**: 채굴 페이지에 표시되는 "풀 채굴 지급 주소"를 풀(예: Luckpool)의 지갑 주소로 쓰면, 지급금이 들어올 때마다 자동 래핑됩니다. 채굴기는 서버나 별도 PC에서 hellminer/ccminer 등으로 돌리면 됩니다.

## 확인할 점

1. **VYD 노드 시계**: 배포 기록상 노드 시계가 40~50초 늦습니다. 브리지는 블록 번호 기준이라 동작엔 문제없지만 `timedatectl set-ntp true` 먼저 적용하세요.
2. **VYD 단일 노드**: 노드가 멈추면 발행·언래핑도 멈춥니다(자금 손실은 없음, 재가동 시 이어서 처리). 2번째 노드를 권장합니다.
3. **처음엔 소액으로**: 1 VRSC 입금 → 발행 확인 → 1 mVRSC 언래핑 → 수령 확인 순서로 실사용 테스트 후 공개하세요.
4. **키 관리**: `MINTER_KEY`와 verusd 지갑(`wallet.dat`)이 핫월렛입니다. `wallet.dat`은 정기 백업하고(`verus backupwallet`), 준비금이 커지면 대부분을 콜드월렛으로 옮기고 브리지 지갑엔 운영분만 두세요.
5. **법적 검토**: 다른 가상자산을 담보로 토큰을 발행·교환해 주는 서비스는 가상자산사업자 신고 대상이 될 수 있습니다. 외부 사용자에게 공개하기 전에 확인하세요.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/config` | 체인 ID, 토큰 주소, 최소 입금 등 |
| GET | `/api/stats` | 준비금 증명, 블록, 채굴 상태 (20초 캐시) |
| POST | `/api/deposit-address` | `{evmAddress, issuedAt, signature}` → 전용 Verus 입금 주소 |
| GET | `/api/account/:evm` | 입금 주소, 입금·언래핑 내역 |
| GET | `/api/validate-address/:addr` | Verus 주소 검증 |
| GET | `/api/mining` | 채굴 현황, 찾은 블록, 풀 지급금 |
| * | `/api/admin/*` | `Authorization: Bearer <ADMIN_TOKEN>` — 채굴 제어, 수동 처리 |
