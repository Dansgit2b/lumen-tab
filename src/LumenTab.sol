// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title LumenTab: prepaid USDC tabs for pay-per-call AI agent APIs on Arc
/// @author Lumenworks
/// @notice A payer (an agent's treasury) locks USDC in a tab for one provider (an API).
///         For every call the agent signs an off-chain EIP-712 voucher carrying the new
///         cumulative amount owed. The provider verifies vouchers off-chain (no gas, no
///         latency per call) and redeems the latest one on-chain whenever it wants.
///         The payer can always recover the unspent balance after a close delay, so the
///         worst case for either side is bounded by the deposit.
/// @dev    On Arc, USDC is both the gas token and an ERC-20 at 0x3600...0000 (6 decimals).
///         This contract only uses the ERC-20 interface; it never touches msg.value.
contract LumenTab is EIP712 {
    using SafeERC20 for IERC20;

    /// @notice Voucher(uint256 tabId,uint128 cumulative): "the provider of tab `tabId` may take
    ///         up to `cumulative` USDC units in total". Vouchers are monotonic, so only the latest
    ///         one matters and replays are harmless.
    bytes32 public constant VOUCHER_TYPEHASH = keccak256("Voucher(uint256 tabId,uint128 cumulative)");

    uint64 public constant MIN_CLOSE_DELAY = 5 minutes;
    uint64 public constant MAX_CLOSE_DELAY = 30 days;

    struct Tab {
        address payer; //    funds the tab and receives the refund
        address provider; // receives redeemed USDC
        address signer; //   key that signs vouchers (EOA or ERC-1271 smart account), e.g. the agent's hot key
        uint64 closeDelay; // grace period the provider gets to redeem after a close request
        uint64 closeAt; //   0 = open; otherwise the earliest time the payer can finalize
        bool closed; //      final; no further movement possible
        uint128 deposited; // total USDC ever deposited
        uint128 paid; //      total USDC already paid to the provider
    }

    IERC20 public immutable usdc;
    uint256 public nextTabId = 1;
    mapping(uint256 => Tab) internal _tabs;

    event TabOpened(
        uint256 indexed tabId,
        address indexed payer,
        address indexed provider,
        address signer,
        uint128 amount,
        uint64 closeDelay,
        uint256 providerAgentId
    );
    event TabToppedUp(uint256 indexed tabId, address indexed from, uint128 amount, uint128 deposited);
    event Redeemed(uint256 indexed tabId, uint128 cumulative, uint128 amount);
    event CloseRequested(uint256 indexed tabId, uint64 closeAt);
    event TabClosed(uint256 indexed tabId, uint128 paidToProvider, uint128 refundedToPayer);

    error ZeroAddress();
    error ZeroAmount();
    error BadCloseDelay();
    error UnknownTab();
    error TabIsClosed();
    error CloseAlreadyRequested();
    error NotPayer();
    error NotProvider();
    error NotClaimable();
    error ExceedsDeposit();
    error BadSignature();
    error TooEarly();

    constructor(IERC20 usdc_) EIP712("LumenTab", "1") {
        if (address(usdc_) == address(0)) revert ZeroAddress();
        usdc = usdc_;
    }

    // ------------------------------------------------------------------ payer side

    /// @notice Open a tab and lock `amount` USDC (6 decimals) for `provider`.
    /// @param providerAgentId optional ERC-8004 agent id of the provider (0 if none); emitted for indexers.
    function open(address provider, address signer, uint128 amount, uint64 closeDelay, uint256 providerAgentId)
        external
        returns (uint256 tabId)
    {
        if (provider == address(0) || signer == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (closeDelay < MIN_CLOSE_DELAY || closeDelay > MAX_CLOSE_DELAY) revert BadCloseDelay();

        tabId = nextTabId++;
        _tabs[tabId] = Tab({
            payer: msg.sender,
            provider: provider,
            signer: signer,
            closeDelay: closeDelay,
            closeAt: 0,
            closed: false,
            deposited: amount,
            paid: 0
        });
        emit TabOpened(tabId, msg.sender, provider, signer, amount, closeDelay, providerAgentId);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Add funds to an open tab. Anyone may top up (e.g. a treasury refilling an agent).
    function topUp(uint256 tabId, uint128 amount) external {
        Tab storage t = _live(tabId);
        if (amount == 0) revert ZeroAmount();
        if (t.closeAt != 0) revert CloseAlreadyRequested();
        t.deposited += amount;
        emit TabToppedUp(tabId, msg.sender, amount, t.deposited);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Start the unilateral exit. The provider keeps `closeDelay` seconds to redeem.
    function requestClose(uint256 tabId) external {
        Tab storage t = _live(tabId);
        if (msg.sender != t.payer) revert NotPayer();
        if (t.closeAt != 0) revert CloseAlreadyRequested();
        uint64 at = uint64(block.timestamp) + t.closeDelay;
        t.closeAt = at;
        emit CloseRequested(tabId, at);
    }

    /// @notice After the close delay, refund whatever was not redeemed to the payer. Callable by anyone.
    function finalize(uint256 tabId) external {
        Tab storage t = _live(tabId);
        if (t.closeAt == 0 || block.timestamp < t.closeAt) revert TooEarly();
        _close(tabId, t);
    }

    // ------------------------------------------------------------------ provider side

    /// @notice Pay the provider up to `cumulative` using a voucher signed by the tab's signer.
    ///         Callable by anyone (e.g. a relayer); funds always go to the provider.
    function redeem(uint256 tabId, uint128 cumulative, bytes calldata signature) public returns (uint128 amount) {
        Tab storage t = _live(tabId);
        if (cumulative <= t.paid) revert NotClaimable();
        if (cumulative > t.deposited) revert ExceedsDeposit();
        if (!SignatureChecker.isValidSignatureNow(t.signer, voucherDigest(tabId, cumulative), signature)) {
            revert BadSignature();
        }
        amount = cumulative - t.paid;
        t.paid = cumulative;
        emit Redeemed(tabId, cumulative, amount);
        usdc.safeTransfer(t.provider, amount);
    }

    /// @notice Cooperative close by the provider: optionally redeem a final voucher, then refund the
    ///         rest to the payer immediately. Pass an empty signature to close without redeeming.
    function closeByProvider(uint256 tabId, uint128 cumulative, bytes calldata signature) external {
        Tab storage t = _live(tabId);
        if (msg.sender != t.provider) revert NotProvider();
        if (signature.length != 0 && cumulative > t.paid) redeem(tabId, cumulative, signature);
        _close(tabId, t);
    }

    // ------------------------------------------------------------------ views

    function voucherDigest(uint256 tabId, uint128 cumulative) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, tabId, cumulative)));
    }

    function getTab(uint256 tabId) external view returns (Tab memory) {
        return _tabs[tabId];
    }

    /// @notice USDC still spendable through vouchers.
    function available(uint256 tabId) external view returns (uint128) {
        Tab storage t = _tabs[tabId];
        return t.closed ? 0 : t.deposited - t.paid;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------------ internal

    function _live(uint256 tabId) internal view returns (Tab storage t) {
        t = _tabs[tabId];
        if (t.payer == address(0)) revert UnknownTab();
        if (t.closed) revert TabIsClosed();
    }

    function _close(uint256 tabId, Tab storage t) internal {
        uint128 refund = t.deposited - t.paid;
        t.closed = true;
        emit TabClosed(tabId, t.paid, refund);
        if (refund != 0) usdc.safeTransfer(t.payer, refund);
    }
}
