// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AgentRegistry} from "./AgentRegistry.sol";

/// @title TaskCreditVault — task-bound restricted credit vault (sandbox).
/// @notice Test credits only (native wei on Anvil). Enforces: total and
/// per-transaction limits, recipient allowlist, expiry, freeze, and the
/// repayment waterfall (principal → fee → owner). No PII on chain.
contract TaskCreditVault {
    AgentRegistry public immutable registry;
    address public immutable lender;
    address public immutable owner;
    address public immutable agent;
    bytes32 public immutable taskRef; // opaque off-chain task hash

    uint256 public immutable totalLimit;
    uint256 public immutable perTxnLimit;
    uint256 public immutable feeDue;
    uint64 public immutable expiresAt;

    uint256 public spent;
    uint256 public principalOutstanding;
    uint256 public feeOutstanding;
    bool public frozen;
    bool private locked; // reentrancy guard

    mapping(address => bool) public allowedRecipients;

    event Disbursed(uint256 amount);
    event VendorPaid(address indexed recipient, uint256 amount);
    event Frozen(string reason);
    event Unfrozen();
    event RevenueReceived(uint256 amount);
    event WaterfallApplied(uint256 principal, uint256 fee, uint256 ownerRelease);
    event UnspentSwept(uint256 amount);

    error NotAgent();
    error NotOwner();
    error NotLender();
    error AgentNotActive();
    error VaultFrozen();
    error VaultExpired();
    error VaultNotExpired();
    error RecipientNotAllowed();
    error PerTxnLimitExceeded();
    error TotalLimitExceeded();
    error Reentrancy();
    error TransferFailed();
    error NothingToRepay();

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    constructor(
        AgentRegistry _registry,
        address _owner,
        address _agent,
        bytes32 _taskRef,
        uint256 _perTxnLimit,
        uint256 _feeDue,
        uint64 _expiresAt,
        address[] memory recipients
    ) payable {
        registry = _registry;
        lender = msg.sender;
        owner = _owner;
        agent = _agent;
        taskRef = _taskRef;
        totalLimit = msg.value; // lender funds the vault at creation
        perTxnLimit = _perTxnLimit;
        feeDue = _feeDue;
        expiresAt = _expiresAt;
        principalOutstanding = msg.value;
        feeOutstanding = _feeDue;
        for (uint256 i = 0; i < recipients.length; i++) {
            allowedRecipients[recipients[i]] = true;
        }
        emit Disbursed(msg.value);
    }

    /// @notice Agent-triggered vendor payment under all restrictions.
    function payVendor(address recipient, uint256 amount) external nonReentrant {
        if (msg.sender != agent) revert NotAgent();
        if (!registry.isActive(agent)) revert AgentNotActive();
        if (frozen) revert VaultFrozen();
        if (block.timestamp >= expiresAt) revert VaultExpired();
        if (!allowedRecipients[recipient]) revert RecipientNotAllowed();
        if (amount == 0 || amount > perTxnLimit) revert PerTxnLimitExceeded();
        if (spent + amount > totalLimit) revert TotalLimitExceeded();

        spent += amount; // effects before interaction
        emit VendorPaid(recipient, amount);
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function freeze(string calldata reason) external {
        if (msg.sender != owner && msg.sender != lender) revert NotOwner();
        frozen = true;
        emit Frozen(reason);
    }

    function unfreeze() external {
        if (msg.sender != owner) revert NotOwner();
        frozen = false;
        emit Unfrozen();
    }

    /// @notice Task revenue lands here (mandate) and the waterfall applies
    /// immediately: principal → fee → remainder to owner.
    function receiveRevenue() external payable nonReentrant {
        if (msg.value == 0) revert NothingToRepay();
        emit RevenueReceived(msg.value);
        uint256 remaining = msg.value;

        uint256 principalPay = remaining < principalOutstanding ? remaining : principalOutstanding;
        principalOutstanding -= principalPay;
        remaining -= principalPay;

        uint256 feePay = remaining < feeOutstanding ? remaining : feeOutstanding;
        feeOutstanding -= feePay;
        remaining -= feePay;

        emit WaterfallApplied(principalPay, feePay, remaining);

        uint256 lenderShare = principalPay + feePay;
        if (lenderShare > 0) {
            (bool okLender,) = lender.call{value: lenderShare}("");
            if (!okLender) revert TransferFailed();
        }
        if (remaining > 0) {
            (bool okOwner,) = owner.call{value: remaining}("");
            if (!okOwner) revert TransferFailed();
        }
    }

    /// @notice After expiry or under freeze, the lender sweeps the unspent
    /// balance back toward the outstanding principal.
    function sweepUnspent() external nonReentrant {
        if (msg.sender != lender) revert NotLender();
        if (!frozen && block.timestamp < expiresAt) revert VaultNotExpired();
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToRepay();
        uint256 credit = balance < principalOutstanding ? balance : principalOutstanding;
        principalOutstanding -= credit;
        spent = totalLimit; // vault can no longer disburse
        emit UnspentSwept(balance);
        (bool ok,) = lender.call{value: balance}("");
        if (!ok) revert TransferFailed();
    }
}
