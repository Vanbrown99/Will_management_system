const hre = require('hardhat');

async function main() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   🏛️  DecentralWill — Contract Deployment  ║');
  console.log('╚════════════════════════════════════════════╝\n');

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  const network    = hre.network.name;

  console.log(`📡 Network         : ${network}`);
  console.log(`📋 Deployer        : ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance         : ${hre.ethers.formatEther(balance)} ETH`);
  console.log('');

  if (balance === 0n) {
    console.error('❌ Deployer has no ETH — cannot deploy');
    process.exit(1);
  }

  // ── Deploy WillFactory ──────────────────────────────────────────────────────
  console.log('⏳ Deploying WillFactory...');

  const WillFactory = await hre.ethers.getContractFactory('WillFactory');
  const factory     = await WillFactory.deploy();
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  const deployTx       = factory.deploymentTransaction();

  console.log(`✅ WillFactory deployed!`);
  console.log(`   Address  : ${factoryAddress}`);
  console.log(`   TX Hash  : ${deployTx.hash}`);
  console.log('');

  // ── Verify deployment ───────────────────────────────────────────────────────
  const adminAddress = await factory.admin();
  const totalWills   = await factory.getTotalWills();

  console.log(`🔍 Verification:`);
  console.log(`   Admin    : ${adminAddress}`);
  console.log(`   Total wills: ${totalWills}`);
  console.log('');

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  📝 Add these to your backend/.env file                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  WILL_FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`║  NETWORK=${network}`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  // ── Testnet verification hint ───────────────────────────────────────────────
  if (network === 'mumbai' || network === 'polygon') {
    console.log('\n💡 To verify on Polygonscan:');
    console.log(
      `   npx hardhat verify --network ${network} ${factoryAddress}`
    );
  }

  console.log('\n✅ Deployment complete!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  });
