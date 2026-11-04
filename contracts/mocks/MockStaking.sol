// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IMSTStaking} from "../interfaces/IMSTStaking.sol";

/// @notice 테스트 전용 스테이킹 목업. 명의자별 예치액만 기록한다.
contract MockStaking is IMSTStaking {
    mapping(address => uint256) public staked;

    event StakedFor(address indexed beneficiary, uint256 amount);

    function stakeFor(address beneficiary) external payable {
        staked[beneficiary] += msg.value;
        emit StakedFor(beneficiary, msg.value);
    }
}
