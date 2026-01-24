const http = require('http');
const url = require('url'); // Required for parsing query params

const PORT = 3001;
const TARGETS = [
    { symbol: "ETH-USD", path: "futurec-trigger-eth" },
    { symbol: "BTC-USD", path: "futurec-trigger-btc" },
    { symbol: "SOL-USD", path: "futurec-trigger-sol" },
    { symbol: "XRP-USD", path: "futurec-trigger-xrp" },
    { symbol: "DOGE-USD", path: "futurec-trigger-doge" },
    { symbol: "SUI-USD", path: "futurec-trigger-sui" }
];

// --- 1. THE FAKE SERVER (BRAIN) ---
const server = http.createServer((req, res) => {
    let body = '';

    // Parse URL to get query parameters (like ?pair=ETH-PERP)
    const parsedUrl = url.parse(req.url, true);
    const queryPair = parsedUrl.query.pair || "UNKNOWN-PERP";

    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        if (req.url.includes('/candles')) {
            // FIX: Return LEGACY COINBASE Format (Array of Arrays)
            const nowSeconds = Math.floor(Date.now() / 1000);
            const count = 300;

            const candles = [];
            let price = 2500;

            for (let i = 0; i < count; i++) {
                price += 2;
                const time = nowSeconds - (count - i) * 3600;
                const low = price - 5;
                const high = price + 5;
                const open = price - 1;
                const close = price;
                const volume = 1000;

                candles.unshift([time, low, high, open, close, volume]);
            }

            res.end(JSON.stringify(candles));
            console.log("   [SERVER] 🕯️ Sent Fake Candles (Coinbase Array Format)");
            return;
        }

        if (req.url.includes('/price')) {
            // FIX: Return 'pair' so N8N doesn't choke
            res.end(JSON.stringify({
                price: 2999.00,
                pair: queryPair // Echo content back
            }));
            return;
        }

        if (req.url.includes('/analyze')) {
            console.log("   [SERVER] 🧠 Processing Analysis -> Returning 100% BUY");
            res.end(JSON.stringify({
                signal: "BUY",
                confidence: 100,
                reasoning: "TEST MODE: ONE TERMINAL EXECUTION (FINAL FIX)",
                macro_impact: "POSITIVE"
            }));
            return;
        }
        res.end(JSON.stringify({ status: "OK" }));
    });
});

server.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n✅ TEST SERVER STARTED (Port ${PORT})`);
    console.log(`🚀 STARTING AUTO-TEST IN 3 SECONDS...`);

    await new Promise(r => setTimeout(r, 3000));
    await fireAll();

    console.log("\n🏁 TEST COMPLETE. Closing Server...");
    server.close();
    process.exit(0);
});

async function fireAll() {
    const http = require('http');

    for (const target of TARGETS) {
        process.stdout.write(`🔫 Firing ${target.symbol}... `);

        const payload = JSON.stringify({
            symbol: target.symbol,
            pair: target.symbol,
            price: 2500.00,

            // FIX: N8N expects 'trend_direction', NOT 'trend'
            trend_direction: "STRONG_UPTREND",
            trend: "STRONG_UPTREND", // Send both for safety!

            rsi_value: 30, // N8N might look for rsi_value too
            rsi: 30,

            technical_status: "GOLDEN_CROSS",
            fng_value: 50,
            fng_label: "Neutral",
            news_sentiment: "Positive",
            sentiment: "TEST_MODE",
            source: "SIMULATION_MODE_FINAL"
        });

        const options = {
            hostname: '172.17.0.1',
            port: 5678,
            path: `/webhook/${target.path}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            }
        };

        await new Promise((resolve) => {
            const req = http.request(options, (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log("✅ OK");
                } else {
                    console.log(`❌ FAIL (${res.statusCode})`);
                }
                resolve();
            });
            req.on('error', (e) => {
                console.log(`❌ ERROR: ${e.message}`);
                resolve();
            });
            req.write(payload);
            req.end();
        });

        await new Promise(r => setTimeout(r, 1000));
    }
}
