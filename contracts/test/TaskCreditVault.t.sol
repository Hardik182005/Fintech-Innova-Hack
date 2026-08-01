// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TaskCreditVault} from "../src/TaskCreditVault.sol";

contract TaskCreditVaultTest is Test {
    AgentRegistry registry;
    TaskCreditVault vault;

    address lender = makeAddr("lender");
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address vendor = makeAddr("vendor");
    address evil = makeAddr("evilWallet");

    uint256 constant LIMIT = 1000e15; // ₹1,000 test units
    uint256 constant PER_TXN = 600e15;
    uint256 constant FEE = 50e15;

    function setUp() public {
        registry = new AgentRegistry();
        vm.prank(owner);
        registry.register(agent, keccak256("passport-payload"));

        address[] memory recipients = new address[](1);
        recipients[0] = vendor;
        vm.deal(lender, LIMIT);
        vm.prank(lender);
        vault = new TaskCreditVault{value: LIMIT}(
            registry, owner, agent, keccak256("task-CO-1041"), PER_TXN, FEE, uint64(block.timestamp + 1 days), recipients
        );
    }

    function test_ValidVendorPayment() public {
        vm.prank(agent);
        vault.payVendor(vendor, 600e15);
        assertEq(vendor.balance, 600e15);
        assertEq(vault.spent(), 600e15);
    }

    function test_RevertOverPerTxnLimit() public {
        vm.prank(agent);
        vm.expectRevert(TaskCreditVault.PerTxnLimitExceeded.selector);
        vault.payVendor(vendor, PER_TXN + 1);
    }

    function test_RevertOverTotalLimit() public {
        vm.startPrank(agent);
        vault.payVendor(vendor, 600e15);
        vm.expectRevert(TaskCreditVault.TotalLimitExceeded.selector);
        vault.payVendor(vendor, 500e15);
        vm.stopPrank();
    }

    function test_RevertUnapprovedRecipient() public {
        vm.prank(agent);
        vm.expectRevert(TaskCreditVault.RecipientNotAllowed.selector);
        vault.payVendor(evil, 100e15);
    }

    function test_RevertNonAgentCaller() public {
        vm.prank(evil);
        vm.expectRevert(TaskCreditVault.NotAgent.selector);
        vault.payVendor(vendor, 100e15);
    }

    function test_RevertWhenExpired() public {
        vm.warp(block.timestamp + 2 days);
        vm.prank(agent);
        vm.expectRevert(TaskCreditVault.VaultExpired.selector);
        vault.payVendor(vendor, 100e15);
    }

    function test_RevertWhenFrozen() public {
        vm.prank(owner);
        vault.freeze("kill switch");
        vm.prank(agent);
        vm.expectRevert(TaskCreditVault.VaultFrozen.selector);
        vault.payVendor(vendor, 100e15);
    }

    function test_RevertWhenAgentRevoked() public {
        vm.prank(owner);
        registry.revoke(agent, "compromised");
        vm.prank(agent);
        vm.expectRevert(TaskCreditVault.AgentNotActive.selector);
        vault.payVendor(vendor, 100e15);
    }

    function test_RevokedAgentCannotBeUnfrozen() public {
        vm.startPrank(owner);
        registry.revoke(agent, "compromised");
        vm.expectRevert(AgentRegistry.RevokedIsFinal.selector);
        registry.unfreeze(agent, "try to sneak back");
        vm.stopPrank();
    }

    function test_WaterfallPrincipalFeeThenOwner() public {
        uint256 revenue = 1800e15;
        address customer = makeAddr("customer");
        vm.deal(customer, revenue);
        uint256 lenderBefore = lender.balance;
        uint256 ownerBefore = owner.balance;

        vm.prank(customer);
        vault.receiveRevenue{value: revenue}();

        assertEq(vault.principalOutstanding(), 0);
        assertEq(vault.feeOutstanding(), 0);
        assertEq(lender.balance - lenderBefore, LIMIT + FEE);
        assertEq(owner.balance - ownerBefore, revenue - LIMIT - FEE);
    }

    function test_PartialRevenuePaysPrincipalFirst() public {
        address customer = makeAddr("customer");
        vm.deal(customer, 400e15);
        vm.prank(customer);
        vault.receiveRevenue{value: 400e15}();
        assertEq(vault.principalOutstanding(), LIMIT - 400e15);
        assertEq(vault.feeOutstanding(), FEE);
        assertEq(owner.balance, 0); // owner gets nothing before full waterfall
    }

    function test_SweepAfterFreeze() public {
        vm.prank(agent);
        vault.payVendor(vendor, 600e15);
        vm.prank(owner);
        vault.freeze("task failed");
        uint256 lenderBefore = lender.balance;
        vm.prank(lender);
        vault.sweepUnspent();
        assertEq(lender.balance - lenderBefore, LIMIT - 600e15);
        assertEq(vault.principalOutstanding(), LIMIT - (LIMIT - 600e15));
    }

    function test_ReplaySafeSweepOnlyLender() public {
        vm.warp(block.timestamp + 2 days);
        vm.prank(evil);
        vm.expectRevert(TaskCreditVault.NotLender.selector);
        vault.sweepUnspent();
    }

    /// Fuzz: waterfall conserves every wei of revenue.
    function testFuzz_WaterfallConservation(uint96 revenue) public {
        vm.assume(revenue > 0);
        address customer = makeAddr("customer");
        vm.deal(customer, revenue);
        uint256 lenderBefore = lender.balance;
        uint256 ownerBefore = owner.balance;
        vm.prank(customer);
        vault.receiveRevenue{value: revenue}();
        uint256 distributed = (lender.balance - lenderBefore) + (owner.balance - ownerBefore);
        assertEq(distributed, revenue);
        // Owner paid only after principal + fee fully covered.
        if (owner.balance > ownerBefore) {
            assertEq(vault.principalOutstanding(), 0);
            assertEq(vault.feeOutstanding(), 0);
        }
    }

    /// Fuzz: spend can never exceed limits regardless of amount sequence.
    function testFuzz_SpendNeverExceedsLimits(uint96[5] memory amounts) public {
        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 amount = uint256(amounts[i]) % (PER_TXN + 100e15);
            uint256 spentBefore = vault.spent(); // read before prank: view calls consume pranks
            bool shouldRevert = amount == 0 || amount > PER_TXN || spentBefore + amount > LIMIT;
            if (shouldRevert) {
                vm.expectRevert();
            }
            vm.prank(agent);
            vault.payVendor(vendor, amount);
        }
        assertLe(vault.spent(), LIMIT);
    }
}
