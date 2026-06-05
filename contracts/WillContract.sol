// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title  WillContract
 * @author DecentralWill Team
 * @notice One contract deployed per user.
 *         Stores encrypted will IPFS hash, manages beneficiaries,
 *         handles dead man switch logic and automatic execution.
 *
 * Security:
 *  - onlyOwner on all sensitive functions
 *  - Reentrancy guard on triggerExecution()
 *  - Checks-Effects-Interactions pattern on ETH transfers
 *  - Allocations must total exactly 100%
 *  - Cannot execute or modify after execution
 *  - Cannot execute if revoked
 */
contract WillContract {

    // ─── State Variables ──────────────────────────────────────────────────────

    address public owner;
    address public factory;
    string  public ipfsCid;
    bool    public isExecuted;
    bool    public isRevoked;
    bool    private locked;

    uint256 public lastPing;
    uint256 public inactivityDays;
    bool    public dmsEnabled;
    uint256 public createdAt;

    // ─── Beneficiary ──────────────────────────────────────────────────────────

    struct Beneficiary {
        address wallet;
        uint256 allocation; // percentage 1-100
        string  email;      // off-chain notification reference
        bool    exists;
    }

    address[]                       public beneficiaryAddresses;
    mapping(address => Beneficiary) public beneficiaries;

    // ─── Events ───────────────────────────────────────────────────────────────

    event WillCreated(
        address indexed owner,
        string          ipfsCid,
        uint256         inactivityDays,
        uint256         timestamp
    );
    event WillUpdated(
        address indexed owner,
        string          newIpfsCid,
        uint256         timestamp
    );
    event Pinged(
        address indexed owner,
        uint256         timestamp,
        uint256         nextTrigger
    );
    event BeneficiaryAdded(
        address indexed wallet,
        uint256         allocation
    );
    event WillExecuted(
        address indexed executor,
        uint256         timestamp
    );
    event WillRevoked(
        address indexed owner,
        uint256         timestamp
    );
    event TransferFailed(
        address indexed wallet,
        uint256         amount
    );

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(
            msg.sender == owner,
            "WillContract: caller is not the owner"
        );
        _;
    }

    modifier notExecuted() {
        require(
            !isExecuted,
            "WillContract: will has already been executed"
        );
        _;
    }

    modifier notRevoked() {
        require(
            !isRevoked,
            "WillContract: will has been revoked"
        );
        _;
    }

    modifier noReentrancy() {
        require(!locked, "WillContract: reentrant call detected");
        locked = true;
        _;
        locked = false;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _owner          Address of the will creator
     * @param _ipfsCid        IPFS CID of encrypted will document
     * @param _inactivityDays Days of inactivity before DMS triggers
     * @param _dmsEnabled     Whether dead man switch is active
     */
    constructor(
        address _owner,
        string  memory _ipfsCid,
        uint256 _inactivityDays,
        bool    _dmsEnabled
    ) {
        require(
            _owner != address(0),
            "WillContract: invalid owner address"
        );
        require(
            bytes(_ipfsCid).length > 0,
            "WillContract: IPFS CID cannot be empty"
        );
        require(
            _inactivityDays >= 1,
            "WillContract: minimum 1 day inactivity"
        );
        require(
            _inactivityDays <= 3650,
            "WillContract: maximum 10 years inactivity"
        );

        owner          = _owner;
        factory        = msg.sender;
        ipfsCid        = _ipfsCid;
        inactivityDays = _inactivityDays;
        dmsEnabled     = _dmsEnabled;
        lastPing       = block.timestamp;
        createdAt      = block.timestamp;
        isExecuted     = false;
        isRevoked      = false;
        locked         = false;

        emit WillCreated(
            _owner,
            _ipfsCid,
            _inactivityDays,
            block.timestamp
        );
    }

    // ─── Owner Functions ──────────────────────────────────────────────────────

    /**
     * @notice Update the IPFS CID pointing to the encrypted will document.
     *         Call this if you re-encrypt and re-upload the will.
     * @param _newIpfsCid New IPFS content identifier
     */
    function updateWill(string memory _newIpfsCid)
        external
        onlyOwner
        notExecuted
        notRevoked
    {
        require(
            bytes(_newIpfsCid).length > 0,
            "WillContract: CID cannot be empty"
        );
        ipfsCid = _newIpfsCid;
        emit WillUpdated(owner, _newIpfsCid, block.timestamp);
    }

    /**
     * @notice Confirm owner is alive — resets the dead man switch timer.
     *         Must be called at least once every `inactivityDays` days.
     */
    function ping()
        external
        onlyOwner
        notExecuted
        notRevoked
    {
        lastPing = block.timestamp;
        uint256 nextTrigger = block.timestamp + (inactivityDays * 1 days);
        emit Pinged(owner, block.timestamp, nextTrigger);
    }

    /**
     * @notice Add a beneficiary to this will.
     * @param _wallet     Ethereum wallet address of beneficiary
     * @param _allocation Percentage share (all beneficiaries must total 100)
     * @param _email      Email address for off-chain notifications
     */
    function addBeneficiary(
        address _wallet,
        uint256 _allocation,
        string  memory _email
    )
        external
        onlyOwner
        notExecuted
        notRevoked
    {
        require(
            _wallet != address(0),
            "WillContract: invalid wallet address"
        );
        require(
            _wallet != owner,
            "WillContract: owner cannot be a beneficiary"
        );
        require(
            _allocation > 0,
            "WillContract: allocation must be greater than 0"
        );
        require(
            _allocation <= 100,
            "WillContract: allocation cannot exceed 100"
        );
        require(
            !beneficiaries[_wallet].exists,
            "WillContract: beneficiary already added"
        );

        uint256 currentTotal = getTotalAllocation();
        require(
            currentTotal + _allocation <= 100,
            "WillContract: total allocation would exceed 100%"
        );

        beneficiaries[_wallet] = Beneficiary({
            wallet:     _wallet,
            allocation: _allocation,
            email:      _email,
            exists:     true
        });
        beneficiaryAddresses.push(_wallet);

        emit BeneficiaryAdded(_wallet, _allocation);
    }

    /**
     * @notice Enable or disable the dead man switch.
     * @param _enabled True to enable, false to disable
     */
    function setDMSEnabled(bool _enabled)
        external
        onlyOwner
        notExecuted
        notRevoked
    {
        dmsEnabled = _enabled;
    }

    /**
     * @notice Update the inactivity period.
     * @param _days New number of days before DMS triggers
     */
    function updateInactivityDays(uint256 _days)
        external
        onlyOwner
        notExecuted
        notRevoked
    {
        require(_days >= 1,    "WillContract: minimum 1 day");
        require(_days <= 3650, "WillContract: maximum 10 years");
        inactivityDays = _days;
    }

    /**
     * @notice Permanently revoke this will.
     *         Cannot be undone. Create a new will if needed.
     */
    function revoke()
        external
        onlyOwner
        notExecuted
    {
        isRevoked = true;
        emit WillRevoked(owner, block.timestamp);
    }

    // ─── Execution ────────────────────────────────────────────────────────────

    /**
     * @notice Trigger will execution when conditions are met.
     *
     * Conditions required:
     *   1. Will is not already executed
     *   2. Will is not revoked
     *   3. At least one beneficiary exists
     *   4. Total allocation equals exactly 100%
     *   5a. DMS enabled  → inactivity period must have elapsed
     *   5b. DMS disabled → only owner can trigger execution
     *
     * @dev Anyone can call this once DMS has triggered.
     *      Uses checks-effects-interactions to prevent reentrancy.
     */
    function triggerExecution()
        external
        notExecuted
        notRevoked
        noReentrancy
    {
        // Must have at least one beneficiary
        require(
            beneficiaryAddresses.length > 0,
            "WillContract: no beneficiaries defined"
        );

        // Allocations must total exactly 100%
        require(
            getTotalAllocation() == 100,
            "WillContract: allocations must total exactly 100%"
        );

        // DMS check
        if (dmsEnabled) {
            uint256 triggerTime = lastPing + (inactivityDays * 1 days);
            require(
                block.timestamp >= triggerTime,
                "WillContract: inactivity period has not elapsed yet"
            );
        } else {
            // DMS off — only owner can manually execute
            require(
                msg.sender == owner,
                "WillContract: only owner can execute when DMS is disabled"
            );
        }

        // ── EFFECTS: mark executed BEFORE transfers ────────────────────────
        isExecuted = true;
        emit WillExecuted(msg.sender, block.timestamp);

        // ── INTERACTIONS: distribute ETH ───────────────────────────────────
        uint256 balance = address(this).balance;
        if (balance > 0) {
            for (uint256 i = 0; i < beneficiaryAddresses.length; i++) {
                address benWallet  = beneficiaryAddresses[i];
                uint256 share      = beneficiaries[benWallet].allocation;
                uint256 amount     = (balance * share) / 100;

                if (amount > 0) {
                    (bool sent, ) = payable(benWallet).call{value: amount}("");
                    if (!sent) {
                        // Log failure but do not revert —
                        // other beneficiaries must still receive their share
                        emit TransferFailed(benWallet, amount);
                    }
                }
            }
        }
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Returns sum of all beneficiary allocations.
     */
    function getTotalAllocation() public view returns (uint256 total) {
        for (uint256 i = 0; i < beneficiaryAddresses.length; i++) {
            total += beneficiaries[beneficiaryAddresses[i]].allocation;
        }
    }

    /**
     * @notice Returns true if the dead man switch has triggered.
     */
    function isDMSTriggered() public view returns (bool) {
        if (!dmsEnabled) return false;
        return block.timestamp >= lastPing + (inactivityDays * 1 days);
    }

    /**
     * @notice Returns all beneficiary wallet addresses.
     */
    function getBeneficiaries()
        external view
        returns (address[] memory)
    {
        return beneficiaryAddresses;
    }

    /**
     * @notice Returns details of a specific beneficiary.
     */
    function getBeneficiary(address _wallet)
        external view
        returns (
            address wallet,
            uint256 allocation,
            string  memory email
        )
    {
        require(
            beneficiaries[_wallet].exists,
            "WillContract: beneficiary not found"
        );
        Beneficiary memory b = beneficiaries[_wallet];
        return (b.wallet, b.allocation, b.email);
    }

    /**
     * @notice Returns seconds remaining before DMS triggers.
     *         Returns 0 if already triggered.
     *         Returns max uint256 if DMS is disabled.
     */
    function timeUntilTrigger() external view returns (uint256) {
        if (!dmsEnabled)         return type(uint256).max;
        uint256 triggerTime = lastPing + (inactivityDays * 1 days);
        if (block.timestamp >= triggerTime) return 0;
        return triggerTime - block.timestamp;
    }

    /**
     * @notice Returns a full summary of this will's state.
     */
    function getWillInfo()
        external view
        returns (
            address _owner,
            string  memory _ipfsCid,
            bool    _isExecuted,
            bool    _isRevoked,
            bool    _dmsEnabled,
            uint256 _lastPing,
            uint256 _inactivityDays,
            uint256 _totalAllocation,
            uint256 _beneficiaryCount
        )
    {
        return (
            owner,
            ipfsCid,
            isExecuted,
            isRevoked,
            dmsEnabled,
            lastPing,
            inactivityDays,
            getTotalAllocation(),
            beneficiaryAddresses.length
        );
    }

    // ─── Receive ETH ──────────────────────────────────────────────────────────

    receive()  external payable {}
    fallback() external payable {}
}
