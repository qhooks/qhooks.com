// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {QModuleBase} from "./QModuleBase.sol";

/// @title QRafflePot
/// @notice A no-loss holder raffle as a marketplace module. The launch's share (less the builder's cut) collects in a
/// pot. Holders enter a daily round by depositing the token; tickets are tokens x seconds left in the round, so
/// entering at the last minute buys almost nothing. After a round ends anyone draws it: the first call picks a draw
/// block a few blocks ahead, the next call after that block uses its hash to pick one winner, weighted by tickets,
/// who wins the whole pot in the token and the pair currency. Every depositor takes their tokens back once the round
/// has ended, winner or not. Rounds nobody entered are skipped; their income waits for the next draw.
/// Randomness comes from a future block hash: good enough for a small pot, but the chain's block producer could
/// influence it, so pots are not meant to be large. No owner.
contract QRafflePot is QModuleBase {
    uint256 public constant ROUND = 1 days;
    uint256 public constant DRAW_DELAY = 2; // blocks between arming a draw and drawing it

    uint256 public immutable start;

    struct Round {
        uint256 weight; // total tickets
        uint64 drawBlock; // 0 until armed
        bool drawn;
        address winner;
        uint256 prizeToken;
        uint256 prizeQuote;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => uint256[]) internal _cum; // running ticket totals, one per entry
    mapping(uint256 => address[]) internal _who;
    mapping(uint256 => mapping(address => uint256)) public deposits;
    mapping(uint256 => mapping(address => uint256)) public tickets;
    uint256 public totalDeposits;
    /// @notice Rounds that had entries, in order; draws go through them one by one.
    uint256[] public entered;
    uint256 public drawIndex;
    /// @notice The module's share of income not yet won, per currency.
    uint256[2] public pot;
    uint256[2] internal _prizesOwed;
    mapping(address => uint256[2]) internal _won;

    event Entered(uint256 indexed round, address indexed who, uint256 amount, uint256 tickets);
    event Withdrawn(uint256 indexed round, address indexed who, uint256 amount);
    event Armed(uint256 indexed round, uint256 drawBlock);
    event Drawn(uint256 indexed round, address indexed winner, uint256 tokenPrize, uint256 quotePrize);
    event Claimed(address indexed who, uint256 tokenAmount, uint256 quoteAmount);

    constructor(address token_, address quote_, address builder_, uint16 builderBps_)
        QModuleBase(token_, quote_, builder_, builderBps_)
    {
        start = block.timestamp;
    }

    function kind() external pure override returns (string memory) {
        return "raffle";
    }

    function currentRound() public view returns (uint256) {
        return (block.timestamp - start) / ROUND;
    }

    function roundEnd(uint256 r) public view returns (uint256) {
        return start + (r + 1) * ROUND;
    }

    /// @notice Deposits `amount` of the token into the current round. Tokens come back after the round ends.
    function enter(uint256 amount) external guarded {
        require(amount != 0, "QRaffle: amount");
        _syncAll();
        uint256 r = currentRound();
        uint256 got = _pull(token, msg.sender, amount);
        require(got != 0, "QRaffle: amount");
        uint256 t = got * (roundEnd(r) - block.timestamp);
        Round storage rd = rounds[r];
        if (rd.weight == 0) entered.push(r);
        rd.weight += t;
        _cum[r].push(rd.weight);
        _who[r].push(msg.sender);
        deposits[r][msg.sender] += got;
        tickets[r][msg.sender] += t;
        totalDeposits += got;
        emit Entered(r, msg.sender, got, t);
    }

    /// @notice Takes back what the caller deposited in round `r`, once it has ended.
    function withdraw(uint256 r) external guarded {
        require(r < currentRound(), "QRaffle: round open");
        uint256 amount = deposits[r][msg.sender];
        require(amount != 0, "QRaffle: nothing deposited");
        deposits[r][msg.sender] = 0;
        totalDeposits -= amount;
        _send(token, msg.sender, amount);
        emit Withdrawn(r, msg.sender, amount);
    }

    /// @notice Draws the next ended round with entries. The first call arms it (picks a draw block DRAW_DELAY
    /// blocks ahead); a call after that block draws. If the draw block is too old for its hash, it re-arms.
    /// Returns true when a winner was drawn.
    function draw() external guarded returns (bool) {
        require(drawIndex < entered.length, "QRaffle: nothing to draw");
        uint256 r = entered[drawIndex];
        require(r < currentRound(), "QRaffle: round open");
        Round storage rd = rounds[r];
        if (rd.drawBlock == 0 || (block.number > rd.drawBlock && blockhash(rd.drawBlock) == 0)) {
            rd.drawBlock = uint64(block.number + DRAW_DELAY);
            emit Armed(r, rd.drawBlock);
            return false;
        }
        require(block.number > rd.drawBlock, "QRaffle: too early");
        _syncAll();
        uint256 seed = uint256(keccak256(abi.encode(blockhash(rd.drawBlock), r, address(this))));
        address w = _pick(r, seed % rd.weight);
        uint256 pt = pot[0];
        uint256 pq = pot[1];
        pot[0] = 0;
        pot[1] = 0;
        _won[w][0] += pt;
        _won[w][1] += pq;
        _prizesOwed[0] += pt;
        _prizesOwed[1] += pq;
        rd.drawn = true;
        rd.winner = w;
        rd.prizeToken = pt;
        rd.prizeQuote = pq;
        drawIndex++;
        emit Drawn(r, w, pt, pq);
        return true;
    }

    /// @notice Pays the caller everything they have won.
    function claim() external guarded returns (uint256 tokenAmount, uint256 quoteAmount) {
        tokenAmount = _won[msg.sender][0];
        quoteAmount = _won[msg.sender][1];
        require(tokenAmount != 0 || quoteAmount != 0, "QRaffle: nothing won");
        _won[msg.sender][0] = 0;
        _won[msg.sender][1] = 0;
        _prizesOwed[0] -= tokenAmount;
        _prizesOwed[1] -= quoteAmount;
        if (tokenAmount != 0) _send(token, msg.sender, tokenAmount);
        if (quoteAmount != 0) _send(quote, msg.sender, quoteAmount);
        emit Claimed(msg.sender, tokenAmount, quoteAmount);
    }

    /// @notice Counts income that has arrived. Anyone can call it.
    function sync() external guarded {
        _syncAll();
    }

    /// @notice What `who` has won and not claimed.
    function won(address who) external view returns (uint256 tokenAmount, uint256 quoteAmount) {
        return (_won[who][0], _won[who][1]);
    }

    /// @notice The pot the next draw pays, counting income that has arrived but not been counted yet.
    function nextPrize() external view returns (uint256 tokenAmount, uint256 quoteAmount) {
        (uint256 t,) = _peek(0);
        (uint256 q,) = _peek(1);
        return (pot[0] + t - t * builderBps / BPS, pot[1] + q - q * builderBps / BPS);
    }

    /// @notice Entries in round `r`.
    function entries(uint256 r) external view returns (uint256) {
        return _who[r].length;
    }

    /// @notice How many entered rounds are still waiting to be drawn, and the next one.
    function pendingDraw() external view returns (uint256 count, uint256 round, uint64 drawBlock) {
        count = entered.length - drawIndex;
        if (count != 0) {
            round = entered[drawIndex];
            drawBlock = rounds[round].drawBlock;
        }
    }

    function _pick(uint256 r, uint256 x) internal view returns (address) {
        uint256[] storage c = _cum[r];
        uint256 lo;
        uint256 hi = c.length - 1;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (c[mid] > x) hi = mid;
            else lo = mid + 1;
        }
        return _who[r][lo];
    }

    function _reserved(uint256 i) internal view override returns (uint256) {
        return (i == 0 ? totalDeposits : 0) + pot[i] + _prizesOwed[i];
    }

    function _income(uint256 i, uint256 net) internal override {
        pot[i] += net;
    }
}
