const http = require('http');
const url = require('url');

const PORT = 3001;
const TARGETS = [
    { symbol: "ETH-USD", path: "futurec-trigger-eth" },
    { symbol: "SOL-USD", path: "futurec-trigger-sol" },
    { symbol: "XRP-USD", path: "futurec-trigger-xrp" },
    { symbol: "DOGE-USD", path: "futurec-trigger-doge" },
    { symbol: "SUI-USD", path: "futurec-trigger-sui" }
];

const server = http.createServer((req, res) => {
    // Enable CORS just in case
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const parsedUrl = url.parse(req.url, true);
    const queryPair = parsedUrl.query.pair || "UNKNOWN-PERP";

    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {

        // --- 1. CANDLES (Coinbase Format for Scripts) ---
        if (req.url.includes('/candles')) {
            const nowSeconds = Math.floor(Date.now() / 1000);
            const count = 300;
            const candles = [];
            let price = 2500;
            for (let i = 0; i < count; i++) {
                price += 2;
                const time = nowSeconds - (count - i) * 3600;
                candles.unshift([time, price - 5, price + 5, price - 1, price, 1000]);
            }
            res.end(JSON.stringify(candles));
            return;
        }

        // --- 2. PRICE (Must return 'pair') ---
        if (req.url.includes('/price')) {
            res.end(JSON.stringify({
                price: 2999.00,
                pair: queryPair
            }));
            return;
        }

        // --- 3. F&G INDEX (Must have data[0].value) ---
        if (req.url.includes('/fng')) {
            res.end(JSON.stringify({
                name: "Fear and Greed Index",
                data: [
                    { value: "50", value_classification: "Neutral", timestamp: "123456" }
                ]
            }));
            return;
        }

        // --- 4. NEWS/SENTIMENT (Status OK is fine?) ---
        // N8N just passes this to Macro, doesn't seem to extract deeply in HTTP Request,
        // BUT the HTTP Request final node might send it to AI.
        if (req.url.includes('/news')) {
            res.end(JSON.stringify({ status: "OK", news: [] }));
            return;
        }

        // --- 5. MACRO CALENDAR (Must be array in data?) ---
        if (req.url.includes('/macro')) {
            res.end(JSON.stringify({
                data: [{ event: "Non-Farm Payrolls", impact: "High" }]
            }));
            return;
        }

        // --- 6. MARKET CONTEXT (Must be object?) ---
        if (req.url.includes('/market-context')) {
            res.end(JSON.stringify({
                sentiment: "Bullish",
                trend: "Up"
            }));
            return;
        }

        // --- 7. ANALYZE (The Brain) ---
        if (req.url.includes('/analyze')) {
            console.log("   [SERVER] 🧠 Processing Analysis -> Returning 100% BUY");
            res.end(JSON.stringify({
                signal: "BUY",
                confidence: 100,
                reasoning: "TEST MODE: FULL MOCK",
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
            trend_direction: "STRONG_UPTREND",
            trend: "STRONG_UPTREND",
            rsi_value: 30, rsi: 30,
            technical_status: "GOLDEN_CROSS",
            fng_value: 50, fng_label: "Neutral",
            news_sentiment: "Positive",
            sentiment: "TEST_MODE",
            source: "SIMULATION_MODE_FULL_MOCK"
        });
        const options = {
            hostname: '172.17.0.1', port: 5678,
            path: `/webhook/${target.path}`, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length }
        };
        await new Promise((resolve) => {
            const req = http.request(options, (res) => resolve());
            req.on('error', (e) => resolve());
            req.write(payload);
            req.end();
        });
        await new Promise(r => setTimeout(r, 500));
        console.log("✅ OK");
    }
}
