const axios = require('axios');

// Using Docker Gateway IP (Standard for default bridge network)
const url = 'http://172.17.0.1:5678/webhook/futurec-trigger-eth'; // Internal Docker IP

console.log(`Sending TEST to: ${url}`);

const payload = {
    symbol: "ETH-TEST",
    price: 3500.00,
    sentiment: "BULLISH_TEST",
    decision: "BUY",
    confidence: 100,
    source: "MANUAL_TEST_TRIGGER"
};

axios.post(url, payload)
    .then(res => console.log("✅ Success! Check Telegram.", res.data))
    .catch(err => {
        console.error("❌ Failed:", err.message);
        if (err.response) console.error("Status:", err.response.status);
    });
