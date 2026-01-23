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
    console.log("🚀 STARTING MASS TEST TRIGGER (PERFECT SETUP)...");

    for (const target of targets) {
        const url = `http://172.17.0.1:5678/webhook/${target.path}`;

        console.log(`🔫 Firing ${target.symbol} -> ${url}`);

        // RICH PAYLOAD to trick AI into High Confidence
        const payload = {
            symbol: target.symbol,
            price: 2500.00,
            sentiment: "BULLISH",

            // Technical Indicators (Crucial for AI Confidence)
            trend: "STRONG_UPTREND",
            rsi: 35, // Oversold in uptrend = BUY signal
            technical_status: "GOLDEN_CROSS_CONFIRMED",
            fng_value: 45,
            fng_label: "Neutral",
            news_sentiment: "Positive",

            // Bypass fields (just in case)
            decision: "BUY",
            confidence: 99,
            source: "MANUAL_TEST_TRIGGER"
        };

        try {
            await axios.post(url, payload);
            console.log(`✅ SENT: ${target.symbol}`);
        } catch (err) {
            console.error(`❌ FAILED: ${target.symbol}`, err.message);
        }

        // Wait 3s to be gentle on new API Key
        await new Promise(r => setTimeout(r, 3000));
    }
    console.log("🏁 DONE. Check Telegram for 6 messages.");
}

fireAll();
