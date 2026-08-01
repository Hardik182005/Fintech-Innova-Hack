// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AgentRegistry — owner↔agent linkage with revocation (sandbox).
/// @notice No PII on chain: only addresses and opaque capability hashes.
contract AgentRegistry {
    enum Status {
        None,
        Active,
        Frozen,
        Revoked
    }

    struct AgentRecord {
        address owner;
        bytes32 capabilityHash; // hash of off-chain passport payload
        Status status;
    }

    mapping(address => AgentRecord) public agents;

    event AgentRegistered(address indexed agent, address indexed owner, bytes32 capabilityHash);
    event AgentStatusChanged(address indexed agent, Status status, string reason);

    error NotAgentOwner();
    error UnknownAgent();
    error AlreadyRegistered();
    error RevokedIsFinal();

    modifier onlyAgentOwner(address agent) {
        if (agents[agent].owner != msg.sender) revert NotAgentOwner();
        _;
    }

    function register(address agent, bytes32 capabilityHash) external {
        if (agents[agent].status != Status.None) revert AlreadyRegistered();
        agents[agent] = AgentRecord(msg.sender, capabilityHash, Status.Active);
        emit AgentRegistered(agent, msg.sender, capabilityHash);
    }

    function freeze(address agent, string calldata reason) external onlyAgentOwner(agent) {
        _setStatus(agent, Status.Frozen, reason);
    }

    function unfreeze(address agent, string calldata reason) external onlyAgentOwner(agent) {
        if (agents[agent].status == Status.Revoked) revert RevokedIsFinal();
        _setStatus(agent, Status.Active, reason);
    }

    function revoke(address agent, string calldata reason) external onlyAgentOwner(agent) {
        _setStatus(agent, Status.Revoked, reason);
    }

    function isActive(address agent) external view returns (bool) {
        return agents[agent].status == Status.Active;
    }

    function _setStatus(address agent, Status status, string calldata reason) internal {
        if (agents[agent].status == Status.None) revert UnknownAgent();
        if (agents[agent].status == Status.Revoked) revert RevokedIsFinal();
        agents[agent].status = status;
        emit AgentStatusChanged(agent, status, reason);
    }
}
