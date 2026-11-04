// 네트워크·컨트랙트 설정. 배포 주소는 scripts/deploy.js가 deployment.js에 기록한다.
import { DEPLOYMENT } from "./deployment.js";

const query = new URLSearchParams(location.search);
// RPC·체인·컨트랙트 재지정은 로컬 시험(localhost)에서만 허용한다. 공개 페이지에서 링크로 다른 RPC나 컨트랙트를 끼워 넣지 못하게 하기 위함.
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const local = (k) => (isLocal ? query.get(k) : null);

export const CONFIG = {
  chainId: Number(local("chainId") || 7601),
  chainName: "Mustsem",
  rpcUrl: local("rpc") || "https://block.mustree.kr",
  // 블록 탐색기 주소가 정해지면 넣는다(예: "https://explorer.example/"). 비어 있으면 링크를 표시하지 않는다.
  explorerUrl: "",
  symbol: "MST",
  decimals: 18,

  // 로컬 시험: ?rpc=http://127.0.0.1:8545&chainId=31337&contract=0x…&from=0
  contractAddress: local("contract") || DEPLOYMENT.address,
  deployBlock: Number(local("from") || DEPLOYMENT.deployBlock || 0),

  // 화면 쪽 제출 최소 간격(초). 컨트랙트 minShareInterval과 비교해 더 긴 값을 쓴다.
  minSubmitIntervalSec: 60,
  // 이벤트 조회 시 한 번에 읽는 블록 수 (RPC 제한 대응)
  logChunk: 50_000,
  // 체인 상태 새로고침 주기(ms)
  refreshMs: 15_000,
};
