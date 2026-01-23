const http = require('http');

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
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        if (req.url.includes('/candles')) {
            // FIX: Return LEGACY COINBASE Format (Array of Arrays)
            // Structure: [ time, low, high, open, close, volume ]
            const nowSeconds = Math.floor(Date.now() / 1000);
            const count = 300; // N8N asks for limit 300

            const candles = [];
            let price = 2500;

            // Generate valid candle history
            for (let i = 0; i < count; i++) {
                price += 2; // Uptrend
                const time = nowSeconds - (count - i) * 3600; // Hourly candles
                const low = price - 5;
                const high = price + 5;
                const open = price - 1;
                const close = price;
                const volume = 1000;

                // Matches N8N code expectation: c[4] is close, c[2] high, c[1] low
                candles.unshift([time, low, high, open, close, volume]); // Unshift because N8N usually expects index 0 to be NEWEST
            }

            res.end(JSON.stringify(candles));
            console.log("   [SERVER] 🕯️ Sent Fake Candles (Coinbase Array Format)");
            return;
        }

        if (req.url.includes('/price')) {
            res.end(JSON.stringify({ price: 2999.00 }));
            return;
        }

        if (req.url.includes('/analyze')) {
            console.log("   [SERVER] 🧠 Processing Analysis -> Returning 100% BUY");
            res.end(JSON.stringify({
                signal: "BUY",
                confidence: 100,
                reasoning: "TEST MODE: ONE TERMINAL EXECUTION (COINBASE FIX)",
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
            trend: "STRONG_UPTREND",
            rsi: 30,
            technical_status: "GOLDEN_CROSS",
            fng_value: 50,
            fng_label: "Neutral",
            news_sentiment: "Positive",
            sentiment: "TEST_MODE",
            source: "SIMULATION_MODE_COINBASE_FIX"
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
