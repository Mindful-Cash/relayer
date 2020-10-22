require('dotenv').config();
const logger = require('perfect-logger');
const Web3 = require('web3');

const MindfulProxyAbi = require('./abi/MindfulProxy.json');

const web3 = new Web3(new Web3.providers.HttpProvider(`https://kovan.infura.io/v3/${process.env.INFURA_KEY}`));
const signer = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
const mindfulProxy = new web3.eth.Contract(MindfulProxyAbi, process.env.MINDFUL_PROXY_ADDRESS, {
    from: signer.address
});

logger.initialize('FrontEndDriver', {
    logLevelFile: 0,                    // Log level for file
    logLevelConsole: 0,                 // Log level for STDOUT/STDERR
    logDirectory: 'logs/',              // Log directory
    customBannerHeaders: 'This is a custom banner'  // Custom Log Banner
});

async function run() {
    logger.info('Relayer started');
    logger.info(`Loaded signer address: ${signer.address}`);
    logger.info(`Loaded MindfulProxy: ${process.env.MINDFUL_PROXY_ADDRESS}`);

    var sellStrategies = await mindfulProxy.methods.getSellStrategies().call();
    var buyStrategies = await mindfulProxy.methods.getBuyStrategies().call();

    logger.info(`Number of sell strategies found: ${sellStrategies.length}`);
    logger.info(`Number of buy strategies found: ${buyStrategies.length}`);

    sellStrategies.forEach(async(sellStartegy) => {
        var chakraAddress = await mindfulProxy.sellStrategyChakra(sellStartegy.sellStrategyId).call();

    });

    buyStrategies.forEach(async(buyStrategy) => {
        var chakraAddress = await mindfulProxy.sellStrategyChakra(buyStrategy.buyStrategyId).call();
    });
}

run()
