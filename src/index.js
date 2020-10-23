/** Modules */
require('dotenv').config();
const logger = require('perfect-logger');
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

/** ABI */
const MindfulProxyAbi = require('./abi/MindfulProxy.json');
const ChakraAbi = require('./abi/Chakra.json');
const Erc20Abi = require('./abi/Erc20.json');

/** Utils */
const api = require('./api.js');  

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

    let sellStrategies = await mindfulProxy.methods.getSellStrategies().call();
    let buyStrategies = await mindfulProxy.methods.getBuyStrategies().call();

    logger.info(`Number of sell strategies found: ${sellStrategies.length}`);
    logger.info(`Number of buy strategies found: ${buyStrategies.length}`);

    sellStrategies.forEach(async(sellStartegy) => {
        if(sellStartegy.isActive) {
            let chakraAddress = await mindfulProxy.methods.sellStrategyChakra(sellStartegy.sellStrategyId).call();
            let chakraManager = await mindfulProxy.methods.chakraManager(chakraAddress).call();
            let sellTokens = sellStartegy.sellTokens;
            let sellPrices = sellStartegy.prices;
            let isExecuted = sellStartegy.isExecuted;

            // get chakra tokens
            let chakra = new web3.eth.Contract(ChakraAbi, chakraAddress);
            let chakraTokens = await chakra.methods.getTokens().call();

            // get chakra tokens prices
            let chakraTokensPrices = await api.fetchTokenPrices(chakraTokens);

            // get chakra amounts
            let chakraTokensAmounts = [];
            for(i=0; i < chakraTokens.length; i++) {
                let erc20 = new web3.eth.Contract(Erc20Abi, chakraTokens[i]);
                let chakraTokenAmount = new BigNumber(await erc20.methods.balanceOf(chakra.address).call());
                chakraTokensAmounts.push(chakraTokenAmount);
            }

            // calculate chakra value
            let chakraValue = new BigNumber(0);
            for(i=0; i < chakraTokens; i++) {
                logger.info(`${chakraTokens[i]} Amount: ${chakraTokenAmount.toString()}`);
                logger.info(`${chakraTokens[i]} Price: ${chakraTokensPrices[chakraTokens[i]].usd}`);

                chakraValue.plus(chakraTokenAmount.multipliedBy(chakraTokensPrices[chakraTokens[i]].usd));
            }
            logger.info(`Chakra value: ${chakraValue.toString()}`);
            
            // loop through all strategy sell prices
            // if current Chakra value is greater than or equal a sell price, and that price is not executed yet
            // check allowance from chakra manager to Mindful proxy, and call fromChakra()
            for(i=0; i < sellPrices.length; i++) {
                if((chakraValue.isGreaterThanOrEqualTo(new BigNumber(sellPrices[i]))) && (!isExecuted[i])) {
                    let availableAllowance = await chakra.methods.allowance(chakraManager, mindfulProxy.address).call();
                    let isEnoughAllowance = web3.utils.fromWei(availableAllowance, 'ether')  >= web3.utils.fromWei(sellPrices[i], 'ether');
                    
                    if(isEnoughAllowance) {
                        let arg = {
                            _chakra: chakraAddress,
                            _sellToken: sellTokens[i],
                            _sellStrategyId: sellStartegy.sellStrategyId,
                            _sellTokenIndex: i,
                            _poolAmount: 0,
                            _minQuoteToken: 0                                               // this does not matter as the sender is a relayer
                        }

                        try {
                            await mindfulProxy.methods.fromChakra(arg).call();
                        } catch (error) {
                            logger.warn('Failed to DCA out');
                        }

                        await mindfulProxy.methods.fromChakra(arg).send({gasLimit: '100000000000'});
                    }
                    else {
                        logger.warn('Not enough allowance available from Chakra manager');
                    }
                }
            }
        }
    });

    buyStrategies.forEach(async(buyStrategy) => {
        if(buyStrategy.isActive) {
            logger.info(`Active buy strategy id: ${buyStrategy.buyStrategyId}`);

            let chakraAddress = await mindfulProxy.methods.sellStrategyChakra(buyStrategy.buyStrategyId).call();
            let chakraManager = await mindfulProxy.methods.chakraManager(chakraAddress).call();
            let buyToken = buyStrategy.buyToken;
            let buyAmount = buyStrategy.buyAmount;
            let interBuyDelay = new BigNumber(buyStrategy.interBuyDelay);
            let lastBuyTimestamp = new BigNumber(buyStrategy.lastBuyTimestamp);

            logger.info(`Chakra address: ${chakraAddress}`);
            logger.info(`Chakra manager: ${chakraManager}`);

            // current timestamp in UTC milliseconds
            let currentTimestamp = new BigNumber(Math.floor(new Date().getTime() / 1000));

            if(currentTimestamp.isGreaterThanOrEqualTo(lastBuyTimestamp.plus(interBuyDelay))) {
                logger.info(`InterBuyDelay passed for id: ${buyStrategy.buyStrategyId}`);

                let erc20 = new web3.eth.Contract(Erc20Abi, buyToken);
                let availableAllowance = await erc20.methods.allowance(chakraManager, mindfulProxy.address).call();
                let isEnoughAllowance = web3.utils.fromWei(availableAllowance, 'ether')  >= web3.utils.fromWei(buyAmount, 'ether');

                if(isEnoughAllowance) {
                    let poolAmount = new BigNumber(0);

                    try {
                        await mindfulProxy.methods.toChakra(
                            chakraAddress,
                            buyToken,
                            poolAmount,
                            buyAmount,
                            buyStrategy.buyStrategyId
                        ).call();
                    } catch (error) {
                        logger.warn('Failed to DCA in');
                    }

                    await mindfulProxy.methods.toChakra(
                        chakraAddress,
                        buyToken,
                        poolAmount,
                        buyAmount,
                        buyStrategy.buyStrategyId
                    ).send({gasLimit: '100000000000'});
                }
                else {
                    logger.warn('Not enough allowance available from Chakra manager');
                }
            }
        }
    });
}

setInterval(function(){ run()},60000)
