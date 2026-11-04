// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IModuleToken {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @title QModuleBase
/// @notice Base for QHooks marketplace modules: contracts a launch names as a revenue-split payee. One module per
/// (template, token, quote, builder, builderBps), deployed by anyone through the deterministic deployer with the
/// marketplace salt and init = creationCode ++ abi.encode(token, quote, builder, builderBps), so its address is
/// known before the launch exists.
///
/// The launch pays a module by plain transfer (its `release()` sends each payee its share), so a module only ever
/// holds what the launch's configured share sent it, plus what users deposit. A module measures new income as its
/// balance minus everything it already accounts for (`reserved` from the module, plus what it owes its builder).
/// Every unit of new income passes through `_intake`, which sets aside exactly `builderBps / 10_000` of it for the
/// builder and hands the rest to the module. The builder's cut is capped at MAX_BUILDER_BPS, fixed at deployment,
/// and paid only to the builder (pull: anyone may trigger it, nobody can redirect it). No owner, no upgrade.
abstract contract QModuleBase {
    uint256 internal constant BPS = 10_000;
    /// @notice The largest share of a module's income its builder can take: 10%.
    uint16 public constant MAX_BUILDER_BPS = 1_000;

    address public immutable token;
    address public immutable quote;
    address public immutable builder;
    uint16 public immutable builderBps;

    /// @notice Owed to the builder and not yet paid, per currency (0: the token, 1: the quote).
    uint256[2] public builderOwed;
    /// @notice All income this module has received, per currency (before the builder's cut).
    uint256[2] public income;
    /// @notice All the builder has been paid, per currency.
    uint256[2] public builderPaid;

    uint256 private _entered;

    event Income(address indexed currency, uint256 amount, uint256 builderCut);
    event BuilderPaid(address indexed builder, uint256 tokenAmount, uint256 quoteAmount);

    modifier guarded() {
        require(_entered == 0, "QModule: busy");
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(address token_, address quote_, address builder_, uint16 builderBps_) {
        require(token_.code.length != 0 && quote_.code.length != 0 && token_ != quote_, "QModule: pair");
        require(builderBps_ <= MAX_BUILDER_BPS, "QModule: builder share");
        require((builder_ == address(0)) == (builderBps_ == 0), "QModule: builder");
        token = token_;
        quote = quote_;
        builder = builder_;
        builderBps = builderBps_;
    }

    /// @notice A short template id, e.g. "stake" or "raffle": what the site's module panel is drawn from.
    function kind() external pure virtual returns (string memory);

    /// @notice Pays the builder everything owed. Anyone can call it; it always pays the builder.
    function claimBuilder() external guarded returns (uint256 tokenAmount, uint256 quoteAmount) {
        _syncAll();
        tokenAmount = builderOwed[0];
        quoteAmount = builderOwed[1];
        require(tokenAmount != 0 || quoteAmount != 0, "QModule: nothing owed");
        builderOwed[0] = 0;
        builderOwed[1] = 0;
        builderPaid[0] += tokenAmount;
        builderPaid[1] += quoteAmount;
        if (tokenAmount != 0) _send(token, builder, tokenAmount);
        if (quoteAmount != 0) _send(quote, builder, quoteAmount);
        emit BuilderPaid(builder, tokenAmount, quoteAmount);
    }

    /// @notice What the builder would be owed after counting income that has arrived but not been counted yet.
    function builderPending() external view returns (uint256 tokenAmount, uint256 quoteAmount) {
        (uint256 t,) = _peek(0);
        (uint256 q,) = _peek(1);
        return (builderOwed[0] + t * builderBps / BPS, builderOwed[1] + q * builderBps / BPS);
    }

    /// @notice Income that has arrived since the module last counted it (before the builder's cut).
    function uncounted() external view returns (uint256 tokenAmount, uint256 quoteAmount) {
        (tokenAmount,) = _peek(0);
        (quoteAmount,) = _peek(1);
    }

    function currency(uint256 i) public view returns (address) {
        return i == 0 ? token : quote;
    }

    /// What the module holds of currency `i` that is not new income: deposits it keeps for users and income it has
    /// already counted and not yet paid out. Must never exceed what the module holds.
    function _reserved(uint256 i) internal view virtual returns (uint256);

    /// Hands the module its share of new income in currency `i`. The module books the returned amount.
    function _income(uint256 i, uint256 net) internal virtual;

    /// Brings the module up to date, counting new income in both currencies. Modules that keep time-based state
    /// (streams, rounds) override it to move that state to now before counting.
    function _syncAll() internal virtual {
        _intake(0);
        _intake(1);
    }

    /// Counts new income in currency `i`: the builder's cut is set aside, the rest goes to `_income`.
    function _intake(uint256 i) internal {
        (uint256 incoming,) = _peek(i);
        if (incoming == 0) return;
        uint256 cut = incoming * builderBps / BPS;
        income[i] += incoming;
        if (cut != 0) builderOwed[i] += cut;
        emit Income(currency(i), incoming, cut);
        _income(i, incoming - cut);
    }

    function _peek(uint256 i) internal view returns (uint256 incoming, uint256 bal) {
        bal = IModuleToken(currency(i)).balanceOf(address(this));
        uint256 held = _reserved(i) + builderOwed[i];
        incoming = bal > held ? bal - held : 0;
    }

    /// Pulls `amount` of `t` from `from` and returns what actually arrived (fee-on-transfer tokens count less).
    function _pull(address t, address from, uint256 amount) internal returns (uint256 got) {
        uint256 before = IModuleToken(t).balanceOf(address(this));
        _call(t, abi.encodeCall(IModuleToken.transferFrom, (from, address(this), amount)));
        got = IModuleToken(t).balanceOf(address(this)) - before;
    }

    function _send(address t, address to, uint256 amount) internal {
        _call(t, abi.encodeCall(IModuleToken.transfer, (to, amount)));
    }

    function _call(address t, bytes memory data) private {
        (bool ok, bytes memory r) = t.call(data);
        require(ok && (r.length == 0 || abi.decode(r, (bool))), "QModule: transfer");
    }
}
