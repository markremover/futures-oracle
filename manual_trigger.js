const axios = require('axios');

// Using Docker Gateway IP (Standard for default bridge network)
const targets = [
    { symbol: "ETH-USD", path: "futurec-trigger-eth" },
    { symbol: "SOL-USD", path: "futurec-trigger-sol" },
    { symbol: "XRP-USD", path: "futurec-trigger-xrp" },
    { symbol: "DOGE-USD", path: "futurec-trigger-doge" },
    { symbol: "SUI-USD", path: "futurec-trigger-sui" }
];

async function fireAll() {
    console.log("🚀 STARTING MASS TEST TRIGGER (TROJAN HORSE MODE)...");

    for (const target of targets) {
        const url = `http://172.17.0.1:5678/webhook/${target.path}`;

        console.log(`🔫 Firing ${target.symbol} -> ${url}`);

        // Inject "TEST" into ALL fields (using N8N internal names: trend_direction, rsi_value)
        const payload = {
            symbol: target.symbol,
            price: 2500.00,
            sentiment: "BULLISH_TEST_MODE",
            trend: "STRONG_UPTREND_TEST",
            trend_direction: "STRONG_UPTREND_TEST", // <--- Required for N8N mapping
            rsi: 35,
            rsi_value: 35, // <--- Required for N8N mapping
            technical_status: "GOLDEN_CROSS_TEST",
            fng_value: 80, // Extreme Greed
            fng_label: "Extreme Greed",
            news_sentiment: "Positive",
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

        // Wait 2s
        await new Promise(r => setTimeout(r, 2000));
    }
    console.log("🏁 DONE. Check Telegram for 6 messages.");
}

fireAll();
