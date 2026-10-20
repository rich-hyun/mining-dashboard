#!/usr/bin/env bash
# Verus 풀노드(verusd) 설치 — Ubuntu 22.04/24.04, root 또는 sudo 로 실행
# 사용법:
#   VERUS_URL="<GitHub 릴리스의 Verus-CLI-Linux-...-x86_64.tgz 주소>" sudo -E bash deploy/install-verusd.sh
#   릴리스 페이지: https://github.com/VerusCoin/VerusCoin/releases (최신 Linux x86_64 CLI 파일 링크 복사)
set -euo pipefail

: "${VERUS_URL:?VERUS_URL 에 Verus CLI 리눅스 tgz 다운로드 주소를 넣으세요}"
VERUS_USER=${VERUS_USER:-verus}
INSTALL_DIR=/opt/verus

echo "== 1. 시스템 패키지"
apt-get update -y
apt-get install -y curl wget tar libgomp1 ufw jq

echo "== 2. 전용 사용자 ${VERUS_USER}"
id "$VERUS_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$VERUS_USER"
HOME_DIR=$(getent passwd "$VERUS_USER" | cut -d: -f6)

echo "== 3. Verus CLI 내려받기"
mkdir -p "$INSTALL_DIR" /tmp/verus-dl
curl -fL "$VERUS_URL" -o /tmp/verus-dl/verus.tgz
tar -xzf /tmp/verus-dl/verus.tgz -C /tmp/verus-dl
# 압축 구조가 버전마다 달라서 verusd 위치를 찾아 그 폴더를 통째로 복사
SRC=$(dirname "$(find /tmp/verus-dl -type f -name verusd | head -1)")
cp -a "$SRC"/. "$INSTALL_DIR"/
chown -R "$VERUS_USER":"$VERUS_USER" "$INSTALL_DIR"
ln -sf "$INSTALL_DIR/verus" /usr/local/bin/verus

echo "== 4. zk 파라미터 (fetch-params)"
sudo -u "$VERUS_USER" bash -c "cd $INSTALL_DIR && ./fetch-params"

echo "== 5. 설정 파일"
CONF_DIR="$HOME_DIR/.komodo/VRSC"
mkdir -p "$CONF_DIR"
if [ ! -f "$CONF_DIR/VRSC.conf" ]; then
  RPC_PASS=$(openssl rand -hex 24)
  cat > "$CONF_DIR/VRSC.conf" <<EOF
server=1
daemon=0
txindex=1
rpcuser=verusrpc
rpcpassword=${RPC_PASS}
rpcport=27486
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
# 채굴 결과(코인베이스)는 지갑 주소로 들어가며 브리지가 자동 래핑
gen=0
EOF
  echo ">> RPC 비밀번호: ${RPC_PASS}  (bridge/.env 의 VERUS_RPC_PASS 에 넣으세요)"
fi
chown -R "$VERUS_USER":"$VERUS_USER" "$HOME_DIR/.komodo"
chmod 600 "$CONF_DIR/VRSC.conf"

echo "== 6. 부트스트랩 (동기화 시간 단축, 선택)"
if [ -x "$INSTALL_DIR/fetch-bootstrap" ]; then
  echo "   부트스트랩은 수십 GB입니다. 받으려면: sudo -u $VERUS_USER $INSTALL_DIR/fetch-bootstrap"
fi

echo "== 7. systemd 등록"
cat > /etc/systemd/system/verusd.service <<EOF
[Unit]
Description=Verus daemon (VRSC)
After=network-online.target
Wants=network-online.target

[Service]
User=${VERUS_USER}
Group=${VERUS_USER}
Type=simple
ExecStart=${INSTALL_DIR}/verusd -datadir=${CONF_DIR}
ExecStop=${INSTALL_DIR}/verus -datadir=${CONF_DIR} stop
Restart=always
RestartSec=15
TimeoutStopSec=300
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now verusd

echo "== 8. 방화벽: P2P(27485)만 열고 RPC(27486)는 닫음"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 27485/tcp
ufw deny 27486/tcp
ufw --force enable

echo
echo "완료. 동기화 확인:  sudo -u $VERUS_USER verus -datadir=$CONF_DIR getblockchaininfo | jq '.blocks, .headers'"
