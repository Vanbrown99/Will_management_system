
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./WillContract.sol";

/**
 * @title  WillFactory
 * @author DecentralWill Team
 * @notice Master factory contract.
 *         Users call createWill() here — the factory deploys
 *         an isolated WillContract for each user and tracks them.
 *
 * @dev    This is the only contract address users need to know.
 *         Each individual will lives at its own contract address.
 */
contract WillFactory {

    // ─── State ────────────────────────────────────────────────────────────────

    address public admin;
    uint256 public totalWills;

    // owner address → array of their will contract addresses
    mapping(address => address[]) private willsByOwner;

    // will contract address → owner address
    mapping(address => address) private willOwner;

    // flat list of every will ever deployed
    address[] private allWills;

    // ─── Events ───────────────────────────────────────────────────────────────

    event WillDeployed(
        address indexed owner,
        address indexed willContract,
        string          ipfsCid,
        uint256         timestamp
    );
    event AdminTransferred(
        address indexed oldAdmin,
        address indexed newAdmin
    );

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        require(
            msg.sender == admin,
            "WillFactory: caller is not the admin"
        );
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        admin      = msg.sender;
        totalWills = 0;
    }

    // ─── Main Functions ───────────────────────────────────────────────────────

    /**
     * @notice Deploy a new WillContract for the caller (msg.sender).
     *
     * @param _ipfsCid        IPFS CID of the encrypted will document.
     *                        Must be uploaded and encrypted BEFORE calling this.
     * @param _inactivityDays Days of inactivity before dead man switch triggers
     * @param _dmsEnabled     Whether dead man switch is active from the start
     *
     * @return willAddress Address of the newly deployed WillContract
     */
    function createWill(
        string  memory _ipfsCid,
        uint256 _inactivityDays,
        bool    _dmsEnabled
    )
        external
        returns (address willAddress)
    {
        require(
            bytes(_ipfsCid).length > 0,
            "WillFactory: IPFS CID is required"
        );
        require(
            _inactivityDays >= 1,
            "WillFactory: minimum inactivity is 1 day"
        );
        require(
            _inactivityDays <= 3650,
            "WillFactory: maximum inactivity is 3650 days"
        );

        // Deploy a new isolated WillContract
        // msg.sender becomes the owner of the new contract
        WillContract newWill = new WillContract(
            msg.sender,
            _ipfsCid,
            _inactivityDays,
            _dmsEnabled
        );

        willAddress = address(newWill);

        // Track the new will
        willsByOwner[msg.sender].push(willAddress);
        willOwner[willAddress]  = msg.sender;
        allWills.push(willAddress);
        totalWills++;

        emit WillDeployed(
            msg.sender,
            willAddress,
            _ipfsCid,
            block.timestamp
        );

        return willAddress;
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Get all will contract addresses belonging to an owner.
     * @param _owner The owner's Ethereum address
     */
    function getWillsByOwner(address _owner)
        external view
        returns (address[] memory)
    {
        return willsByOwner[_owner];
    }

    /**
     * @notice Get the owner of a specific will contract.
     * @param _willAddress Address of the WillContract
     */
    function getWillOwner(address _willAddress)
        external view
        returns (address)
    {
        return willOwner[_willAddress];
    }

    /**
     * @notice Returns true if the address is a valid will from this factory.
     * @param _willAddress Address to check
     */
    function isValidWill(address _willAddress)
        external view
        returns (bool)
    {
        return willOwner[_willAddress] != address(0);
    }

    /**
     * @notice Get total number of wills ever created on this factory.
     */
    function getTotalWills()
        external view
        returns (uint256)
    {
        return totalWills;
    }

    /**
     * @notice Get all will addresses ever deployed (admin only).
     */
    function getAllWills()
        external view
        onlyAdmin
        returns (address[] memory)
    {
        return allWills;
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    /**
     * @notice Transfer admin role to a new address.
     * @param _newAdmin Address of the new admin
     */
    function transferAdmin(address _newAdmin)
        external
        onlyAdmin
    {
        require(
            _newAdmin != address(0),
            "WillFactory: invalid admin address"
        );
        address old = admin;
        admin       = _newAdmin;
        emit AdminTransferred(old, _newAdmin);
    }
}
