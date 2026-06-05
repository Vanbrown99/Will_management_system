const { expect }  = require('chai');
const { ethers }  = require('hardhat');
const { time }    = require('@nomicfoundation/hardhat-network-helpers');

describe('DecentralWill — Smart Contract Tests', function () {

  // ─── Shared state ──────────────────────────────────────────────────────────
  let factory;
  let willContract;
  let owner, beneficiary1, beneficiary2, beneficiary3, stranger;

  const IPFS_CID    = 'QmTestCIDabcdef1234567890';
  const INACT_DAYS  = 30;
  const ONE_ETH     = ethers.parseEther('1.0');

  // ─── Helper: get WillContract from deploy tx ──────────────────────────────
  async function getDeployedWill(tx) {
    const receipt    = await tx.wait();
    const WillFactory_iface = factory.interface;
    const log = receipt.logs.find(l => {
      try {
        return WillFactory_iface.parseLog(l)?.name === 'WillDeployed';
      } catch { return false; }
    });
    if (!log) throw new Error('WillDeployed event not found');
    const parsed      = WillFactory_iface.parseLog(log);
    const willAddress = parsed.args.willContract;
    const WC          = await ethers.getContractFactory('WillContract');
    return WC.attach(willAddress);
  }

  // ─── Deploy fresh contracts before each test ───────────────────────────────
  beforeEach(async function () {
    [owner, beneficiary1, beneficiary2, beneficiary3, stranger] =
      await ethers.getSigners();

    // Deploy factory
    const WF = await ethers.getContractFactory('WillFactory');
    factory  = await WF.deploy();

    // Create one will via factory
    const tx = await factory
      .connect(owner)
      .createWill(IPFS_CID, INACT_DAYS, true);
    willContract = await getDeployedWill(tx);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WILL FACTORY TESTS
  // ──────────────────────────────────────────────────────────────────────────

  describe('WillFactory', function () {

    it('sets deployer as admin', async function () {
      expect(await factory.admin()).to.equal(owner.address);
    });

    it('starts with zero total wills except the one in beforeEach', async function () {
      expect(await factory.getTotalWills()).to.equal(1n);
    });

    it('tracks will under correct owner', async function () {
      const wills = await factory.getWillsByOwner(owner.address);
      expect(wills.length).to.equal(1);
    });

    it('marks deployed will as valid', async function () {
      const wills = await factory.getWillsByOwner(owner.address);
      expect(await factory.isValidWill(wills[0])).to.be.true;
    });

    it('marks random address as invalid will', async function () {
      expect(await factory.isValidWill(stranger.address)).to.be.false;
    });

    it('correctly returns will owner', async function () {
      const wills = await factory.getWillsByOwner(owner.address);
      expect(await factory.getWillOwner(wills[0])).to.equal(owner.address);
    });

    it('allows one owner to create multiple wills', async function () {
      await factory.connect(owner).createWill('QmCID2', 60, true);
      await factory.connect(owner).createWill('QmCID3', 90, false);
      const wills = await factory.getWillsByOwner(owner.address);
      expect(wills.length).to.equal(3);
      expect(await factory.getTotalWills()).to.equal(3n);
    });

    it('allows different owners to create wills independently', async function () {
      await factory.connect(stranger).createWill('QmStrangerCID', 45, true);
      const ownerWills   = await factory.getWillsByOwner(owner.address);
      const strangerWills = await factory.getWillsByOwner(stranger.address);
      expect(ownerWills.length).to.equal(1);
      expect(strangerWills.length).to.equal(1);
    });

    it('rejects empty IPFS CID', async function () {
      await expect(
        factory.connect(owner).createWill('', INACT_DAYS, true)
      ).to.be.revertedWith('WillFactory: IPFS CID is required');
    });

    it('rejects 0 inactivity days', async function () {
      await expect(
        factory.connect(owner).createWill(IPFS_CID, 0, true)
      ).to.be.revertedWith('WillFactory: minimum inactivity is 1 day');
    });

    it('rejects more than 3650 inactivity days', async function () {
      await expect(
        factory.connect(owner).createWill(IPFS_CID, 3651, true)
      ).to.be.revertedWith('WillFactory: maximum inactivity is 3650 days');
    });

    it('allows admin to transfer admin role', async function () {
      await factory.connect(owner).transferAdmin(stranger.address);
      expect(await factory.admin()).to.equal(stranger.address);
    });

    it('blocks non-admin from transferring admin', async function () {
      await expect(
        factory.connect(stranger).transferAdmin(stranger.address)
      ).to.be.revertedWith('WillFactory: caller is not the admin');
    });

    it('blocks non-admin from calling getAllWills', async function () {
      await expect(
        factory.connect(stranger).getAllWills()
      ).to.be.revertedWith('WillFactory: caller is not the admin');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WILL CONTRACT — INITIAL STATE
  // ──────────────────────────────────────────────────────────────────────────

  describe('WillContract — initial state', function () {

    it('sets owner correctly', async function () {
      expect(await willContract.owner()).to.equal(owner.address);
    });

    it('stores IPFS CID correctly', async function () {
      expect(await willContract.ipfsCid()).to.equal(IPFS_CID);
    });

    it('stores inactivity days correctly', async function () {
      expect(await willContract.inactivityDays()).to.equal(BigInt(INACT_DAYS));
    });

    it('starts as not executed', async function () {
      expect(await willContract.isExecuted()).to.be.false;
    });

    it('starts as not revoked', async function () {
      expect(await willContract.isRevoked()).to.be.false;
    });

    it('has DMS enabled', async function () {
      expect(await willContract.dmsEnabled()).to.be.true;
    });

    it('has zero beneficiaries', async function () {
      const bens = await willContract.getBeneficiaries();
      expect(bens.length).to.equal(0);
    });

    it('has zero total allocation', async function () {
      expect(await willContract.getTotalAllocation()).to.equal(0n);
    });

    it('DMS is not yet triggered', async function () {
      expect(await willContract.isDMSTriggered()).to.be.false;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WILL CONTRACT — updateWill()
  // ──────────────────────────────────────────────────────────────────────────

  describe('WillContract — updateWill()', function () {

    it('owner can update IPFS CID', async function () {
      const newCid = 'QmUpdatedCIDxyz987654';
      await willContract.connect(owner).updateWill(newCid);
      expect(await willContract.ipfsCid()).to.equal(newCid);
    });

    it('emits WillUpdated event', async function () {
      await expect(
        willContract.connect(owner).updateWill('QmNewCID')
      ).to.emit(willContract, 'WillUpdated')
        .withArgs(owner.address, 'QmNewCID', await time.latest() + 1);
    });

    it('rejects update from stranger', async function () {
      await expect(
        willContract.connect(stranger).updateWill('QmHackCID')
      ).to.be.revertedWith('WillContract: caller is not the owner');
    });

    it('rejects empty CID', async function () {
      await expect(
        willContract.connect(owner).updateWill('')
      ).to.be.revertedWith('WillContract: CID cannot be empty');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WILL CONTRACT — ping()
  // ──────────────────────────────────────────────────────────────────────────

  describe('WillContract — ping()', function () {

    it('updates lastPing timestamp', async function () {
      const before = await willContract.lastPing();
      await time.increase(100);
      await willContract.connect(owner).ping();
      const after = await willContract.lastPing();
      expect(after).to.be.greaterThan(before);
    });

    it('emits Pinged event', async function () {
      await expect(
        willContract.connect(owner).ping()
      ).to.emit(willContract, 'Pinged');
    });

    it('rejects ping from stranger', async function () {
      await expect(
        willContract.connect(stranger).ping()
      ).to.be.revertedWith('WillContract: caller is not the owner');
    });

    it('resets DMS after near-trigger ping', async function () {
      // Advance almost to trigger point
      await time.increase((INACT_DAYS - 1) * 24 * 60 * 60);
      expect(await willContract.isDMSTriggered()).to.be.false;
      // Ping resets it
      await willContract.connect(owner).ping();
      // Now advance another 29 days — still not triggered
      await time.increase((INACT_DAYS - 1) * 24 * 60 * 60);
      expect(await willContract.isDMSTriggered()).to.be.false;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WILL CONTRACT — addBeneficiary()
  // ──────────────────────────────────────────────────────────────────────────

  describe('WillContract — addBeneficiary()', function () {

    it('adds a single beneficiary at 100%', async function () {
      await willContract.connect(owner).addBeneficiary(
        beneficiary1.address, 100, 'ben1@test.com'
      );
      const [wallet, alloc, email] =
        await willContract.getBeneficiary(beneficiary1.address);
      expect(wallet).to.equal(beneficiary1.address);
      expect(alloc).to.equal(100n);
      expect(email).to.equal('ben1@test.com');
    });

    it('adds multiple beneficiaries totaling 100%', async function () {
      await willContract.connect(owner).addBeneficiary(
        beneficiary1.address, 60, 'b1@test.com'
      );
      await willContract.connect(owner).addBeneficiary(
        beneficiary2.address, 40, 'b2@test.com'
      );
      expect(await willContract.getTotalAllocation()).to.equal(100n);
      const bens = await willContract.getBeneficiaries();
      expect(bens.length).to.equal(2);
    });

    it('adds three beneficiaries totaling 100%', async function () {
      await willContract.connect(owner).addBeneficiary(
        beneficiary1.address, 50, 'b1@test.com'
      );
      await willContract.connect(owner).addBeneficiary(
        beneficiary2.address, 30, 'b2@test.com'
      );
      await willContract.connect(owner).addBeneficiary(
        beneficiary3.address, 20, 'b3@test.com'
      );
      expect(await willContract.getTotalAllocation()).to.equal(100n);
    });

    it('rejects allocation that would exceed 100%', async function () {
      await willContract.connect(owner).addBeneficiary(
        beneficiary1.address, 70, 'b1@test.com'
      );
      await expect(
        willContract.connect(owner).addBeneficiary(
          beneficiary2.address, 40, 'b2@test.com'
        )
      ).to.be.revertedWith(
        'WillContract: total allocation would exceed 100%'
      );
    });

    it('rejects zero allocation', async function () {
      await expect(
        willContract.connect(owner).addBeneficiary(
          beneficiary1.address, 0, 'b1@test.com'
        )
      ).to.be.revertedWith(
        'WillContract: allocation must be greater than 0'
      );
    });

    it('rejects owner as beneficiary', async function () {
      await expect(
        willContract.connect(owner).addBeneficiary(
          owner.address, 100, 'owner@test.com'
        )
      ).to.be.revertedWith(
        'WillContract: owner cannot be a beneficiary'
      );
    });

    it('rejects zero address as beneficiary', async function () {
      await expect(
        willContract.connect(owner).addBeneficiary(
          ethers.ZeroAddress, 100, 'zero@test.com'
        )
      ).to.be.revertedWith('WillContract: invalid wallet address');
    });

    it('rejects duplicate beneficiary', async function () {
      await willContract.connect(owner).addBeneficiary(
        beneficiary1.address, 50, 'b1@test.com'
      );
      await expect(
        willContract.connect(owner).addBeneficiary(
          beneficiary1.address, 50, 'b1again@test.com'
        )
      ).to.be.revertedWith('WillContract: beneficiary already added');
    });

    it('rejects from non-owner', async function () {
      await expect(
        willContract.connect(stranger).addBeneficiary(
          beneficiary1.address, 100, 'hack@test.com'
        )
      ).to.be.revertedWith('WillContract: caller is not the owner');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WILL CONTRACT — triggerExecution()
  // ──────────────────────────────────────────────────────────────────────────

  describe('WillContract — triggerExecution()', function () {

    // Setup beneficiaries before each execution test
    beforeEach(async function () {
      await willContract.connect(owner).addBeneficiary(
        beneficiary1.address, 60, 'b1@test.com'
      );
      await willContract.connect(owner).addBeneficiary(
        beneficiary2.address, 40, 'b2@test.com'
      );
    });

    it('DMS triggers after inactivity period', async function () {
      await time.increase(INACT_DAYS * 24 * 60 * 60 + 1);
      expect(await willContract.isDMSTriggered()).to.be.true;
    });

    it('DMS does not trigger before inactivity period', async function () {
      await time.increase((INACT_DAYS - 1) * 24 * 60 * 60);
      expect(await willContract.isDMSTriggered()).to.be.false;
    });

    it('executes successfully after inactivity period', async function () {
      await time.increase(INACT_DAYS * 24 * 60 * 60 + 1);
      await willContract.connect(stranger).triggerExecution();
      expect(await willContract.isExecuted()).to.be.true;
    });

    it('emits WillExecuted event on execution', async function () {
      await time.increase(INACT_DAYS * 24 * 60 * 60 + 1);
      await expect(
        willContract.connect(stranger).triggerExecution()
      ).to.emit(willContract, 'WillExecuted');
    });

    it('distributes ETH correctly to two beneficiaries', async function () {
      // Fund the contract
      await owner.sendTransaction({
        to:    await willContract.getAddress(),
        value: ONE_ETH,
      });

      const b1Before = await ethers.provider.getBalance(beneficiary1.address);
      const b2Before = await ethers.provider.getBalance(beneficiary2.address);

      await time.increase(INACT_DAYS * 24 * 60 * 60 + 1);
      await willContract.connect(stranger).triggerExecution();

      const b1After = await ethers.provider.getBalance(beneficiary1.address);
      const b2After = await ethers.provider.getBalance(beneficiary2.address);

      // beneficiary1 gets 60%
      expect(b1After - b1Before).to.equal(ethers.parseEther('0.6'));
      // beneficiary2 gets 40%
      expect(b2After - b2Before).to.equal(ethers.parseEther('0.4'));
    });

    it('executes even with zero ETH balance', async function () {
      await time.increase(INACT_DAYS * 24 * 60 * 60 + 1);
      // No ETH funded — should still mark executed
      await willContract.connect(stranger).triggerExecution();
      expect(await willContract.isExecuted()).to.be.true;
    });

    it('rejects execution before inactivity period', async function () {
      await time.increase(10 * 24 * 60 * 60); // only 10 days
      await expect(
        willContract.connect(stranger).triggerExecution()
      ).to.be.revertedWith(
        'WillContract: inactivity period has not elapsed yet'
      );
    });

    it('rejects second execution after first', async function () {
      await time.increase(INACT_DAYS * 24 * 60 * 60 + 1);
      await willContract.connect(stranger).triggerExecution();
      await expect(
        willContract.connect(stranger).triggerExecution()
      ).to.be.revertedWith(
        'WillContract: will has already been executed'
      );
    });

    it('rejects execution when allocations not 100%', async function () {
      // Deploy a fresh will with only 50% allocated
      const tx = await factory
        .connect(owner)
        .createWill('QmFreshCID', INACT_DAYS, true);
      const freshWill = await getDeployedWill(tx);
      await freshWill.connect(owner).addBeneficiary(
        beneficiary1.address, 50, 'b1@test.com'
      );
      await time.increase(INACT_DAYS * 24 * 60 * 60 + 1);
      await expect(
        freshWill.connect(stranger).triggerExecution()
      ).to.be.revertedWith(
        'WillContract: allocations must total exactly 100%'
      );
    });

    it('rejects execution with no beneficiaries', async function () {
      const tx = await factory
        .connect(owner)
        .createWill('QmNoBenCID', INACT_DAYS, true);
      const freshWill = await getDeployedWill(tx);
      await time.increase(INACT_DAYS * 24 * 60 * 60 + 1);
      await expect(
        freshWill.connect(stranger).triggerExecution()
      ).to.be.revertedWith(
        'WillContract: no beneficiaries defined'
      );
    });

    it('when DMS disabled, only owner can execute', async function () {
      // Deploy will with DMS disabled
      const tx = await factory
        .connect(owner)
        .createWill('QmNoDMSCID', INACT_DAYS, false);
      const freshWill = await getDeployedWill(tx);
      await freshWill.connect(owner).addBeneficiary(
        beneficiary1.address, 100, 'b1@test.com'
      );
      // Stranger cannot execute
      await expect(
        freshWill.connect(stranger).triggerExecution()
      ).to.be.revertedWith(
        'WillContract: only owner can execute when DMS is disabled'
      );
      // Owner can execute
      await freshWill.connect(owner).triggerExecution();
      expect(await freshWill.isExecuted()).to.be.true;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WILL CONTRACT — revoke()
  // ──────────────────────────────────────────────────────────────────────────

  describe('WillContract — revoke()', function () {

    it('owner can revoke the will', async function () {
      await willContract.connect(owner).revoke();
      expect(await willContract.isRevoked()).to.be.true;
    });

    it('emits WillRevoked event', async function () {
      await expect(
        willContract.connect(owner).revoke()
      ).to.emit(willContract, 'WillRevoked')
        .withArgs(owner.address, await time.latest() + 1);
    });

    it('prevents execution after revocation', async function () {
      await willContract.connect(owner).addBeneficiary(
        beneficiary1.address, 100, 'b1@test.com'
      );
      await willContract.connect(owner).revoke();
      await time.increase(INACT_DAYS * 24 * 60 * 60 + 1);
      await expect(
        willContract.connect(stranger).triggerExecution()
      ).to.be.revertedWith('WillContract: will has been revoked');
    });

    it('prevents adding beneficiaries after revocation', async function () {
      await willContract.connect(owner).revoke();
      await expect(
        willContract.connect(owner).addBeneficiary(
          beneficiary1.address, 100, 'b1@test.com'
        )
      ).to.be.revertedWith('WillContract: will has been revoked');
    });

    it('prevents update after revocation', async function () {
      await willContract.connect(owner).revoke();
      await expect(
        willContract.connect(owner).updateWill('QmRevokedCID')
      ).to.be.revertedWith('WillContract: will has been revoked');
    });

    it('rejects revoke from stranger', async function () {
      await expect(
        willContract.connect(stranger).revoke()
      ).to.be.revertedWith('WillContract: caller is not the owner');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WILL CONTRACT — getWillInfo()
  // ──────────────────────────────────────────────────────────────────────────

  describe('WillContract — getWillInfo()', function () {

    it('returns correct summary', async function () {
      await willContract.connect(owner).addBeneficiary(
        beneficiary1.address, 60, 'b1@test.com'
      );
      await willContract.connect(owner).addBeneficiary(
        beneficiary2.address, 40, 'b2@test.com'
      );

      const [
        _owner, _cid, _executed, _revoked,
        _dms, _ping, _days, _total, _count
      ] = await willContract.getWillInfo();

      expect(_owner).to.equal(owner.address);
      expect(_cid).to.equal(IPFS_CID);
      expect(_executed).to.be.false;
      expect(_revoked).to.be.false;
      expect(_dms).to.be.true;
      expect(_days).to.equal(BigInt(INACT_DAYS));
      expect(_total).to.equal(100n);
      expect(_count).to.equal(2n);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WILL CONTRACT — receive ETH
  // ──────────────────────────────────────────────────────────────────────────

  describe('WillContract — receives ETH', function () {

    it('accepts ETH deposits', async function () {
      await owner.sendTransaction({
        to:    await willContract.getAddress(),
        value: ONE_ETH,
      });
      const bal = await ethers.provider.getBalance(
        await willContract.getAddress()
      );
      expect(bal).to.equal(ONE_ETH);
    });
  });

});
