import { ethers } from "ethers";
import { config } from "./config.js";

export const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function minRedeem() view returns (uint256)",
  "function paused() view returns (bool)",
  "function MINTER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function processedDeposits(bytes32) view returns (bool)",
  "function redeemed(uint256) view returns (bool)",
  "function redeemNonce() view returns (uint256)",
  "function mintWrapped(address to, uint256 amount, bytes32 depositId, string verusTxid)",
  "function unwrap(uint256 amount, string verusAddress) returns (uint256)",
  "function markRedeemed(uint256 nonce, string verusTxid)",
  "event Wrapped(bytes32 indexed depositId, address indexed to, uint256 amount, string verusTxid)",
  "event UnwrapRequested(uint256 indexed nonce, address indexed from, uint256 amount, string verusAddress)",
  "event RedeemCompleted(uint256 indexed nonce, string verusTxid)",
];

const network = new ethers.Network("VYD", config.vyd.chainId);
export const provider = new ethers.JsonRpcProvider(config.vyd.rpc, network, { staticNetwork: network });
export const minter = new ethers.Wallet(config.vyd.minterKey, provider);
// 트랜잭션 nonce를 로컬에서 이어 붙여 연속 전송 시 "nonce already used" 방지
const signer = new ethers.NonceManager(minter);
export const token = new ethers.Contract(config.vyd.token, TOKEN_ABI, signer);
/** 전송 실패 후 다음 전송 전에 노드 기준으로 nonce 재동기화 */
export const resetNonce = () => signer.reset();

/** 입금 1건을 컨트랙트 depositId 로 변환 (verus txid + vout) */
export const depositIdOf = (txid, vout) => ethers.solidityPackedKeccak256(["string", "uint32"], [txid, vout]);

/**
 * VYD 단일 노드는 시계가 늦을 수 있고 가스 추정이 불안정할 수 있어
 * 가스 한도를 넉넉히 직접 지정한다. 트랜잭션은 워커 한 곳에서만 순차 전송한다.
 */
export const TX_OPTS = { gasLimit: 300_000n };
