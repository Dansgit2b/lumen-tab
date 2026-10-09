// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {LumenTab} from "../src/LumenTab.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

/// Minimal ERC-1271 smart account owned by one EOA key.
contract MockSmartAccount is IERC1271 {
    address public owner;
    constructor(address o) { owner = o; }
    function isValidSignature(bytes32 h, bytes memory sig) external view returns (bytes4) {
        return ECDSA.recover(h, sig) == owner ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

contract LumenTabTest is Test {
    MockUSDC usdc;
    LumenTab tab;
    address payer = makeAddr("payer");
    address provider = makeAddr("provider");
    uint256 signerKey = 0xA11CE;
    address signer;
    uint64 constant DELAY = 1 hours;

    function setUp() public {
        usdc = new MockUSDC();
        tab = new LumenTab(usdc);
        signer = vm.addr(signerKey);
        usdc.mint(payer, 1_000e6);
        vm.prank(payer);
        usdc.approve(address(tab), type(uint256).max);
    }

    function _open(uint128 amt) internal returns (uint256 id) {
        vm.prank(payer);
        id = tab.open(provider, signer, amt, DELAY, 42);
    }

    function _sig(uint256 key, uint256 id, uint128 cum) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, tab.voucherDigest(id, cum));
        return abi.encodePacked(r, s, v);
    }

    function test_OpenLocksFunds() public {
        uint256 id = _open(10e6);
        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(tab)), 10e6);
        LumenTab.Tab memory t = tab.getTab(id);
        assertEq(t.payer, payer);
        assertEq(t.provider, provider);
        assertEq(t.signer, signer);
        assertEq(t.deposited, 10e6);
        assertEq(tab.available(id), 10e6);
    }

    function test_RedeemIncrementally() public {
        uint256 id = _open(10e6);
        tab.redeem(id, 1e6, _sig(signerKey, id, 1e6));
        assertEq(usdc.balanceOf(provider), 1e6);
        // anyone can relay a redeem; money still goes to the provider
        vm.prank(makeAddr("relayer"));
        tab.redeem(id, 3_500_000, _sig(signerKey, id, 3_500_000));
        assertEq(usdc.balanceOf(provider), 3_500_000);
        assertEq(tab.available(id), 6_500_000);
    }

    function test_OldVoucherCannotBeReplayed() public {
        uint256 id = _open(10e6);
        bytes memory s1 = _sig(signerKey, id, 2e6);
        tab.redeem(id, 2e6, s1);
        vm.expectRevert(LumenTab.NotClaimable.selector);
        tab.redeem(id, 2e6, s1);
        bytes memory s0 = _sig(signerKey, id, 1e6);
        vm.expectRevert(LumenTab.NotClaimable.selector);
        tab.redeem(id, 1e6, s0);
    }

    function test_VoucherBoundToTab() public {
        uint256 a = _open(5e6);
        uint256 b = _open(5e6);
        bytes memory sa = _sig(signerKey, a, 1e6);
        vm.expectRevert(LumenTab.BadSignature.selector);
        tab.redeem(b, 1e6, sa);
    }

    function test_RejectsWrongSigner() public {
        uint256 id = _open(5e6);
        bytes memory bad = _sig(0xB0B, id, 1e6);
        vm.expectRevert(LumenTab.BadSignature.selector);
        tab.redeem(id, 1e6, bad);
    }

    function test_CannotExceedDeposit() public {
        uint256 id = _open(5e6);
        bytes memory bad = _sig(signerKey, id, 5e6 + 1);
        vm.expectRevert(LumenTab.ExceedsDeposit.selector);
        tab.redeem(id, 5e6 + 1, bad);
    }

    function test_TopUpExtendsCapacity() public {
        uint256 id = _open(1e6);
        address treasury = makeAddr("treasury");
        usdc.mint(treasury, 4e6);
        vm.startPrank(treasury);
        usdc.approve(address(tab), 4e6);
        tab.topUp(id, 4e6);
        vm.stopPrank();
        tab.redeem(id, 5e6, _sig(signerKey, id, 5e6));
        assertEq(usdc.balanceOf(provider), 5e6);
    }

    function test_UnilateralCloseRespectsDelay() public {
        uint256 id = _open(10e6);
        vm.prank(payer);
        tab.requestClose(id);
        vm.expectRevert(LumenTab.TooEarly.selector);
        tab.finalize(id);
        // provider can still redeem during the grace period
        tab.redeem(id, 4e6, _sig(signerKey, id, 4e6));
        vm.warp(block.timestamp + DELAY);
        tab.finalize(id);
        assertEq(usdc.balanceOf(provider), 4e6);
        assertEq(usdc.balanceOf(payer), 1_000e6 - 4e6);
        assertEq(usdc.balanceOf(address(tab)), 0);
        bytes memory bad = _sig(signerKey, id, 5e6);
        vm.expectRevert(LumenTab.TabIsClosed.selector);
        tab.redeem(id, 5e6, bad);
    }

    function test_OnlyPayerRequestsClose() public {
        uint256 id = _open(1e6);
        vm.expectRevert(LumenTab.NotPayer.selector);
        tab.requestClose(id);
    }

    function test_NoTopUpWhileClosing() public {
        uint256 id = _open(1e6);
        vm.prank(payer);
        tab.requestClose(id);
        vm.prank(payer);
        vm.expectRevert(LumenTab.CloseAlreadyRequested.selector);
        tab.topUp(id, 1e6);
    }

    function test_ProviderCooperativeClose() public {
        uint256 id = _open(10e6);
        bytes memory s = _sig(signerKey, id, 3e6);
        vm.prank(provider);
        tab.closeByProvider(id, 3e6, s);
        assertEq(usdc.balanceOf(provider), 3e6);
        assertEq(usdc.balanceOf(payer), 1_000e6 - 3e6);
        assertTrue(tab.getTab(id).closed);
    }

    function test_ProviderCloseWithoutVoucher() public {
        uint256 id = _open(2e6);
        vm.prank(provider);
        tab.closeByProvider(id, 0, "");
        assertEq(usdc.balanceOf(payer), 1_000e6);
    }

    function test_OnlyProviderClosesCooperatively() public {
        uint256 id = _open(2e6);
        vm.prank(payer);
        vm.expectRevert(LumenTab.NotProvider.selector);
        tab.closeByProvider(id, 0, "");
    }

    function test_SmartAccountSigner() public {
        uint256 ownerKey = 0xC0FFEE;
        MockSmartAccount acct = new MockSmartAccount(vm.addr(ownerKey));
        vm.prank(payer);
        uint256 id = tab.open(provider, address(acct), 5e6, DELAY, 0);
        tab.redeem(id, 2e6, _sig(ownerKey, id, 2e6));
        assertEq(usdc.balanceOf(provider), 2e6);
        bytes memory bad = _sig(signerKey, id, 3e6);
        vm.expectRevert(LumenTab.BadSignature.selector);
        tab.redeem(id, 3e6, bad);
    }

    function test_BadParams() public {
        vm.startPrank(payer);
        vm.expectRevert(LumenTab.ZeroAddress.selector);
        tab.open(address(0), signer, 1, DELAY, 0);
        vm.expectRevert(LumenTab.ZeroAmount.selector);
        tab.open(provider, signer, 0, DELAY, 0);
        vm.expectRevert(LumenTab.BadCloseDelay.selector);
        tab.open(provider, signer, 1, 1 minutes, 0);
        vm.expectRevert(LumenTab.BadCloseDelay.selector);
        tab.open(provider, signer, 1, 31 days, 0);
        vm.stopPrank();
        vm.expectRevert(LumenTab.UnknownTab.selector);
        tab.redeem(99, 1, "");
    }

    /// Funds are conserved for any sequence of redeem amounts followed by a close.
    function testFuzz_Conservation(uint128 dep, uint128 c1, uint128 c2) public {
        dep = uint128(bound(dep, 1, 1_000e6));
        c1 = uint128(bound(c1, 1, dep));
        c2 = uint128(bound(c2, c1, dep));
        uint256 id = _open(dep);
        tab.redeem(id, c1, _sig(signerKey, id, c1));
        if (c2 > c1) tab.redeem(id, c2, _sig(signerKey, id, c2));
        vm.prank(payer);
        tab.requestClose(id);
        vm.warp(block.timestamp + DELAY);
        tab.finalize(id);
        assertEq(usdc.balanceOf(provider), c2);
        assertEq(usdc.balanceOf(payer), 1_000e6 - c2);
        assertEq(usdc.balanceOf(address(tab)), 0);
    }
}
