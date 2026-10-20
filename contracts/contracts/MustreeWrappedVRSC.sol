// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title MustreeWrappedVRSC (머스트리 래핑 코인)
/// @notice 브리지 지갑에 보관된 Verus(VRSC)를 1:1 담보로 VYD 체인에서 발행하는 토큰.
///         - 래핑: 브리지 서버(MINTER_ROLE)가 Verus 입금/채굴분 확인 후 mintWrapped
///         - 언래핑: 사용자가 unwrap으로 소각 → 서버가 이벤트를 보고 VRSC 송금 → markRedeemed
/// @dev VRSC와 같은 소수점 8자리. 같은 입금을 두 번 발행하지 못하도록 depositId를 기록한다.
contract MustreeWrappedVRSC is ERC20, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    mapping(bytes32 => bool) public processedDeposits;
    mapping(uint256 => bool) public redeemed;
    uint256 public redeemNonce;
    uint256 public minRedeem;

    event Wrapped(bytes32 indexed depositId, address indexed to, uint256 amount, string verusTxid);
    event UnwrapRequested(uint256 indexed nonce, address indexed from, uint256 amount, string verusAddress);
    event RedeemCompleted(uint256 indexed nonce, string verusTxid);
    event MinRedeemUpdated(uint256 minRedeem);

    error DepositAlreadyProcessed(bytes32 depositId);
    error AmountBelowMinimum(uint256 amount, uint256 minimum);
    error InvalidVerusAddress();
    error AlreadyRedeemed(uint256 nonce);
    error UnknownNonce(uint256 nonce);

    constructor(string memory name_, string memory symbol_, address admin, uint256 minRedeem_)
        ERC20(name_, symbol_)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        minRedeem = minRedeem_;
    }

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    /// @notice Verus 입금(또는 채굴 보상) 확인 후 래핑 토큰 발행
    function mintWrapped(address to, uint256 amount, bytes32 depositId, string calldata verusTxid)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
    {
        if (processedDeposits[depositId]) revert DepositAlreadyProcessed(depositId);
        processedDeposits[depositId] = true;
        _mint(to, amount);
        emit Wrapped(depositId, to, amount, verusTxid);
    }

    /// @notice 토큰을 소각하고 지정한 Verus 주소로 VRSC 반환을 요청
    function unwrap(uint256 amount, string calldata verusAddress) external whenNotPaused returns (uint256 nonce) {
        if (amount == 0 || amount < minRedeem) revert AmountBelowMinimum(amount, minRedeem);
        uint256 len = bytes(verusAddress).length;
        if (len < 2 || len > 100) revert InvalidVerusAddress();
        _burn(msg.sender, amount);
        nonce = ++redeemNonce;
        emit UnwrapRequested(nonce, msg.sender, amount, verusAddress);
    }

    /// @notice 브리지 서버가 VRSC 송금을 마친 뒤 기록
    function markRedeemed(uint256 nonce, string calldata verusTxid) external onlyRole(MINTER_ROLE) {
        if (nonce == 0 || nonce > redeemNonce) revert UnknownNonce(nonce);
        if (redeemed[nonce]) revert AlreadyRedeemed(nonce);
        redeemed[nonce] = true;
        emit RedeemCompleted(nonce, verusTxid);
    }

    function setMinRedeem(uint256 v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minRedeem = v;
        emit MinRedeemUpdated(v);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
