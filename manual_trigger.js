const axios = require('axios');

// Using Docker Gateway IP (Standard for default bridge network)
const targets = [
    { symbol: "ETH-USD", path: "futurec-trigger-eth" },
    { symbol: "BTC-USD", path: "futurec-trigger-btc" },
    { symbol: "SOL-USD", path: "futurec-trigger-sol" },
    { symbol: "XRP-USD", path: "futurec-trigger-xrp" },
    { symbol: "DOGE-USD", path: "futurec-trigger-doge" },
    { symbol: "SUI-USD", path: "futurec-trigger-sui" }
];

async function fireAll() {
    console.log("🚀 STARTING MASS TEST TRIGGER (High Confidence)...");

    for (const target of targets) {
        // Use the internal Docker IP
        const url = `http://172.17.0.1:5678/webhook/${target.path}`;

        console.log(`🔫 Firing ${target.symbol} -> ${url}`);

        const payload = {
            symbol: target.symbol, // MUST use real symbol so Oracle can analyze it!
            price: 99999.00,       // Fake price
            sentiment: "STRONG_BUY_TEST",
            decision: "BUY",
            confidence: 95,        // HIGH CONFIDENCE to pass Risk Filter
            source: "MANUAL_TEST_TRIGGER"
        };

        try {
            await axios.post(url, payload);
            console.log(`✅ SENT: ${target.symbol}`);
        } catch (err) {
            console.error(`❌ FAILED: ${target.symbol}`, err.message);
        }

        // Wait 2s to prevent "Bad Gateway" (overload)
        await new Promise(r => setTimeout(r, 2000));
    }
    console.log("🏁 DONE. Check Telegram.");
}

fireAll();
