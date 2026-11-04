// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {QModuleBase} from "./QModuleBase.sol";

/// @title QStakeModule
/// @notice Holder staking as a marketplace module: QStakeVault's logic on QModuleBase. Stake the launch token, earn
/// what the launch pays this module (less its builder's share, if any) in the token and its pair currency, streamed
/// over DURATION so staking for one block around a payout earns almost nothing. Funds that stream while nobody is
/// staked are kept and streamed again once someone is. Staked tokens are never counted as income. No lockup, no owner.
/// The same function names and selectors as QStakeVault, so one Staking panel drives both.
contract QStakeModule is QModuleBase {
    uint256 public constant DURATION = 1 days;
    uint256 private constant E18 = 1e18;
    uint256 private constant E36 = 1e36;

    struct Stream {
        uint256 rate; // reward per second, scaled by 1e18
        uint64 finish;
        uint64 last;
        uint256 acc; // reward per staked unit, scaled by 1e36
        uint256 booked; // the module's share of income received so far and not yet paid out
        uint256 idle; // streamed while nobody was staked; streamed again on the next sync
    }

    uint256 public totalStaked;
    mapping(address => uint256) public staked;
    Stream[2] internal _streams;
    mapping(address => uint256[2]) internal _debt;
    mapping(address => uint256[2]) internal _owed;

    event Staked(address indexed who, uint256 amount);
    event Unstaked(address indexed who, uint256 amount);
    event Claimed(address indexed who, uint256 tokenAmount, uint256 quoteAmount);
    event Streamed(address indexed currency, uint256 amount, uint256 rate, uint64 finish);

    constructor(address token_, address quote_, address builder_, uint16 builderBps_)
        QModuleBase(token_, quote_, builder_, builderBps_)
    {}

    function kind() external pure override returns (string memory) {
        return "stake";
    }

    /// @notice Stakes `amount` of the token (the amount that actually arrives counts).
    function stake(uint256 amount) external guarded {
        require(amount != 0, "QStake: amount");
        _update(msg.sender);
        uint256 got = _pull(token, msg.sender, amount);
        require(got != 0, "QStake: amount");
        staked[msg.sender] += got;
        totalStaked += got;
        emit Staked(msg.sender, got);
    }

    /// @notice Unstakes `amount`; rewards earned so far stay claimable.
    function unstake(uint256 amount) public guarded {
        _update(msg.sender);
        require(amount != 0 && amount <= staked[msg.sender], "QStake: amount");
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        _send(token, msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Pays out everything earned so far, in the token and the quote.
    function claim() public guarded returns (uint256 tokenAmount, uint256 quoteAmount) {
        _update(msg.sender);
        tokenAmount = _payOut(0, msg.sender);
        quoteAmount = _payOut(1, msg.sender);
        emit Claimed(msg.sender, tokenAmount, quoteAmount);
    }

    /// @notice Unstakes everything and claims.
    function exit() external {
        uint256 s = staked[msg.sender];
        if (s != 0) unstake(s);
        claim();
    }

    /// @notice Starts streaming anything that has arrived since the last interaction. Anyone can call it.
    function sync() external guarded {
        _syncAll();
    }

    /// @notice What `who` could claim now (from streams already started; call `sync` to start new arrivals).
    function earned(address who) external view returns (uint256 tokenAmount, uint256 quoteAmount) {
        return (_earnedView(who, 0), _earnedView(who, 1));
    }

    /// @notice A currency's stream: reward per second (1e18-scaled), when it ends, and what it still holds.
    function stream(uint256 i) external view returns (uint256 rate, uint64 finish, uint256 booked, uint256 idle) {
        Stream storage s = _streams[i];
        return (s.rate, s.finish, s.booked, s.idle);
    }

    function _reserved(uint256 i) internal view override returns (uint256) {
        return (i == 0 ? totalStaked : 0) + _streams[i].booked;
    }

    function _syncAll() internal override {
        _sync(0);
        _sync(1);
    }

    function _update(address who) private {
        for (uint256 i; i < 2; ++i) {
            _sync(i);
            uint256 acc = _streams[i].acc;
            _owed[who][i] += staked[who] * (acc - _debt[who][i]) / E36;
            _debt[who][i] = acc;
        }
    }

    /// Moves the stream to now, counts new income (the builder's cut comes off first), then streams it plus
    /// anything that streamed while nobody was staked.
    function _sync(uint256 i) private {
        Stream storage s = _streams[i];
        _accrue(s);
        _intake(i); // books and streams new income through _income
        if (s.idle != 0) _start(i, 0);
    }

    function _income(uint256 i, uint256 net) internal override {
        _streams[i].booked += net;
        _start(i, net);
    }

    function _start(uint256 i, uint256 incoming) private {
        Stream storage s = _streams[i];
        uint256 add = incoming + s.idle;
        if (add == 0) return;
        s.idle = 0;
        uint256 left = block.timestamp < s.finish ? s.rate * (s.finish - block.timestamp) : 0;
        s.rate = (left + add * E18) / DURATION;
        s.finish = uint64(block.timestamp + DURATION);
        s.last = uint64(block.timestamp);
        emit Streamed(currency(i), add, s.rate, s.finish);
    }

    function _accrue(Stream storage s) private {
        uint256 t = block.timestamp < s.finish ? block.timestamp : s.finish;
        if (t <= s.last) return;
        uint256 amount = s.rate * (t - s.last);
        if (totalStaked != 0) s.acc += amount * E18 / totalStaked;
        else s.idle += amount / E18;
        s.last = uint64(t);
    }

    function _earnedView(address who, uint256 i) private view returns (uint256) {
        Stream storage s = _streams[i];
        uint256 acc = s.acc;
        uint256 t = block.timestamp < s.finish ? block.timestamp : s.finish;
        if (t > s.last && totalStaked != 0) acc += s.rate * (t - s.last) * E18 / totalStaked;
        return _owed[who][i] + staked[who] * (acc - _debt[who][i]) / E36;
    }

    function _payOut(uint256 i, address to) private returns (uint256 amount) {
        amount = _owed[to][i];
        if (amount == 0) return 0;
        _owed[to][i] = 0;
        _streams[i].booked -= amount;
        _send(currency(i), to, amount);
    }
}
