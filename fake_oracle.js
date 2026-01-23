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
    // console.log(`[SERVER] ${req.method} ${req.url}`); // Silent mode to not clutter
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        if (req.url.includes('/candles')) {
            // Fake Candles (Uptrend)
            const candles = [];
            let price = 2500;
            for (let i = 0; i < 50; i++) { price += 2; candles.push({ c: price, h: price + 1, l: price - 1, o: price, t: Date.now() - (50 - i) * 60000 }); }
            res.end(JSON.stringify(candles));
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
                reasoning: "TEST MODE: ONE TERMINAL EXECUTION",
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

    // Wait for server to settle
    await new Promise(r => setTimeout(r, 3000));

    // --- 2. THE TRIGGER (GUN) ---
    await fireAll();

    console.log("\n🏁 TEST COMPLETE. Closing Server...");
    server.close();
    process.exit(0);
});

// --- HELPER FUNCTION TO FIRE SIGNALS ---
async function fireAll() {
    const http = require('http'); // Native http to avoid axios dependency

    for (const target of TARGETS) {
        process.stdout.write(`🔫 Firing ${target.symbol}... `);

        const payload = JSON.stringify({
            symbol: target.symbol,
            price: 2500.00,
            sentiment: "TEST_MODE",
            source: "ONE_TERMINAL_TEST"
        });

        const options = {
            hostname: '172.17.0.1', // Docker Gateway (or localhost if running locally outside docker?)
            // WAIT! If we run this ON HOST, n8n is on localhost:5678 potentially?
            // Actually, usually user runs 'node fake_oracle.js' on HOST.
            // And N8N is in Docker.
            // N8N is reachable via localhost:5678 usually?
            // Let's try localhost:5678 first.
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
                // Try Docker Gateway IP if localhost fails
                // console.log(`(Retrying Gateway)...`);
                console.log(`❌ ERROR: ${e.message}`);
                resolve();
            });
            req.write(payload);
            req.end();
        });

        await new Promise(r => setTimeout(r, 1500)); // Pace it
    }
}
