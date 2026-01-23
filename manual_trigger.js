const axios = require('axios');

// CONFIGURATION
// Use 'n8n' if running inside Docker container
// Use 'localhost' or External IP if running from host (and port 5678 is mapped)
const N8N_HOST = 'http://n8n:5678';
const COINS = ['eth', 'sol', 'xrp', 'doge', 'sui'];

async function trigger(coin) {
    const url = `${N8N_HOST}/webhook/futurec-trigger-${coin}`;

    const payload = {
        pair: `${coin.toUpperCase()}-USD`,
        type: "TEST_SIGNAL",
        value: 5.55, // Fake 5.55% move
        timestamp: Date.now(),
        message: `🔥 TEST SIGNAL for ${coin.toUpperCase()} - Checking Telegram!`
    };

    try {
        console.log(`Sending TEST to: ${url}`);
        const res = await axios.post(url, payload);
        console.log(`✅ Success! Status: ${res.status}`);
        console.log('Check your Telegram now.');
    } catch (e) {
        console.error(`❌ Failed: ${e.message}`);
        console.log('Hint: If running from outside Docker, change N8N_HOST to http://localhost:5678');
    }
}

// Get coin from arg or default to ETH
const coin = process.argv[2] || 'eth';

if (coin === 'all') {
    console.log("🚀 TRIGGERING ALL 5 COINS (Staggered)...");
    const allCoins = ['eth', 'sol', 'xrp', 'doge', 'sui'];
    allCoins.forEach((c, i) => {
        setTimeout(() => {
            trigger(c);
        }, i * 3000); // 3 second delay between each
    });
} else {
    trigger(coin.toLowerCase());
}
