const http = require('http');

const PORT = 3001;

const server = http.createServer((req, res) => {
    console.log(`[FAKE ORACLE] Request: ${req.method} ${req.url}`);

    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {

        res.writeHead(200, { 'Content-Type': 'application/json' });

        // 1. Handle Candles (Historical Data)
        if (req.url.includes('/candles')) {
            // Return fake candles (Uptrend)
            const candles = [];
            let price = 2500;
            for (let i = 0; i < 50; i++) {
                price += 5; // Uptrend
                candles.push({ c: price, h: price + 2, l: price - 2, o: price - 1, t: Date.now() - (50 - i) * 60000 });
            }
            res.end(JSON.stringify(candles));
            console.log("   -> Sent Fake Candles (Uptrend)");
            return;
        }

        // 2. Handle Price (Current Price)
        if (req.url.includes('/price')) {
            res.end(JSON.stringify({ price: 2999.00 }));
            console.log("   -> Sent Fake Price");
            return;
        }

        // 3. Handle Analyze (The Brain)
        if (req.url.includes('/analyze')) {
            const responseData = {
                signal: "BUY",
                confidence: 100,
                reasoning: "TEST TERMINAL: FORCED BUY SIGNAL",
                macro_impact: "POSITIVE",
                timestamp: new Date().toISOString()
            };
            res.end(JSON.stringify(responseData));
            console.log("   -> Sent 100% CONFIDENCE SIGNAL 🚀");
            return;
        }

        // Fallback for anything else
        res.end(JSON.stringify({ status: "OK" }));
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ TEST TERMINAL RUNNING ON PORT ${PORT}`);
    console.log(`   (Handling /candles, /price, /analyze)`);
    console.log(`   Waiting for signals... (Keep this window OPEN!)`);
});
