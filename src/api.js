/** Modules */
const fetch = require('node-fetch');

const fetchTokenPrices = async (tokens) => {
    const query = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokens.join(
        "%2C"
    )}&vs_currencies=usd
    `;
    const response = await fetch(query, {
        headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
        }
    });

    const tokensPrices = await response.json();

    return tokensPrices;
};

exports.fetchTokenPrices = fetchTokenPrices;
