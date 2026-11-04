// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice 채굴 보상을 채굴자 명의로 예치받는 스테이킹 컨트랙트가 구현해야 하는 인터페이스.
/// @dev 현재 Mustsem 스테이킹(0x8Fb0…7D07)은 stake(uint256)로 호출자 본인 명의 wMST만 받으므로
///      이 인터페이스를 구현하지 않는다. 구현체가 배포되기 전까지 자동 예치는 꺼 둔다(stakingEnabled=false).
interface IMSTStaking {
    /// @param beneficiary 예치 명의자(채굴자). msg.value 만큼의 네이티브 MST를 예치한다.
    function stakeFor(address beneficiary) external payable;
}
