import WebSocket from 'ws';
import http from 'http';
import url from 'url';
import axios from 'axios';
// import yahooFinance from 'yahoo-finance2'; // DEPRECATED

// --- CONFIGURATION ---
const WS_URL = 'wss://advanced-trade-ws.coinbase.com';
const PORT = 3001;
const TARGET_PAIRS = ["ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD", "SUI-USD"];
const STOCK_WATCHLIST = ['QQQ', 'NVDA', 'AAPL', 'MSTR', 'COIN', '^TNX', 'DX-Y.NYB']; // Stocks, US10Y, DXY
const N8N_WEBHOOK_BASE = 'http://172.17.0.1:5678/webhook/futurec-trigger-'; // Base URL (Docker Gateway)

// --- STATE ---
const prices: Map<string, number> = new Map();
let wsConnected = false;
let lastWsUpdate = 0;
let macroCache: any[] | null = null;
let lastMacroUpdate = 0;
let stockCache: any = null;
let lastStockUpdate = 0;

// --- PRICE MONITOR (AUTONOMOUS AGENT) ---
class PriceMonitor {
    private history: Map<string, { time: number, price: number }[]> = new Map();
    private lastAlert: Map<string, number> = new Map();

    update(pair: string, price: number) {
        const now = Date.now();
        if (!this.history.has(pair)) this.history.set(pair, []);

        const buffer = this.history.get(pair)!;
        buffer.push({ time: now, price });

        // Prune older than 5 minutes (300000 ms)
        const cutoff = now - 300000;
        while (buffer.length > 0 && buffer[0].time < cutoff) {
            buffer.shift();
        }

        this.checkVelocity(pair, price, buffer);
    }

    private checkVelocity(pair: string, currentPrice: number, buffer: { time: number, price: number }[]) {
        if (buffer.length < 2) return;

        const oldest = buffer[0];
        const change = ((currentPrice - oldest.price) / oldest.price) * 100;
        const absChange = Math.abs(change);

        // --- DYNAMIC THRESHOLD (AGGRESSIVE SHORT) ---
        // Default: 1.5%
        let threshold = 1.5;

        // Check Global Stock Sentiment
        // Accessing the global stockCache variable
        const sentiment = stockCache?.sentiment || "NEUTRAL";

        // If Market is Bearish/Crashing, be more sensitive to DROPS (Shorts)
        if ((sentiment === "BEARISH" || sentiment === "CRASH_WARNING") && change < 0) {
            threshold = 1.0; // Trigger on 1% drop
            // console.log(`🐻 [BEAR MODE] Lowering threshold for ${pair} to 1.0%`);
        }

        if (absChange >= threshold) {
            this.triggerAlert(pair, "VELOCITY", change);
        }
    }

    private async triggerAlert(pair: string, type: string, value: number) {
        const now = Date.now();
        const last = this.lastAlert.get(pair) || 0;

        // Debounce: 1 alert per 15 mins for same pair
        if (now - last < 900000) return;

        console.log(`🚀 [ALERT] ${pair} triggered ${type}: ${value.toFixed(2)}%`);
        this.lastAlert.set(pair, now);

        // Construct unique URL: e.g. futurec-trigger-eth
        const symbol = pair.split('-')[0].toLowerCase(); // ETH, SOL, etc.
        const url = `${N8N_WEBHOOK_BASE}${symbol}`;

        try {
            await axios.post(url, {
                pair,
                type,
                value,
                timestamp: now,
                message: `Golden Moment: ${pair} moved ${value.toFixed(2)}% in 5m`
            });
            console.log(`✅ [WEBHOOK] Sent signal to ${url}`);
        } catch (e: any) {
            console.error(`❌ [WEBHOOK FAILED]`, e.message);
        }
    }
}

const monitor = new PriceMonitor();

interface TradeLog {
    pair: string;
    type: 'WIN' | 'LOSS';
    pnl: number;
    price: number;
    time: string;
}

let dailyTrades: TradeLog[] = [];
let currentDay = new Date().toISOString().split('T')[0];

// --- SERVER ---
function startServer() {
    const server = http.createServer(async (req, res) => {
        // Handle CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const parsedUrl = url.parse(req.url || '', true);

        // 1. REAL-TIME PRICE (UPDATED WITH SPOT FALLBACK)
        if (req.method === 'GET' && parsedUrl.pathname === '/price') {
            let pair = parsedUrl.query.pair as string;

            // NORMALIZATION: Map PERP -> USD for lookup
            let lookupPair = pair;
            if (pair && pair.endsWith('-PERP')) {
                lookupPair = pair.replace('-PERP', '-USD');
            }

            // Success Case (Look for Spot Price)
            if (lookupPair && prices.has(lookupPair)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    pair: pair, // Return requested pair name (e.g. BTC-PERP)
                    price: prices.get(lookupPair), // Return Spot Price
                    source_pair: lookupPair,
                    timestamp: Date.now(),
                    source: 'oracle-v7.1-spot-fallback'
                }));
                // console.log(`[SERVED] Price for ${pair} (via ${lookupPair})`); // Reduce log spam
                return;
            }

            // SOFT FAILURE
            console.log(`[MISSING] Price not found for ${pair} (checked ${lookupPair})`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: `Price not available yet`,
                pair: pair,
                ws_status: wsConnected ? 'Connected' : 'Disconnected',
                last_update_seconds_ago: lastWsUpdate > 0 ? (Date.now() - lastWsUpdate) / 1000 : -1,
                available_pairs: Array.from(prices.keys())
            }));
            return;
        }

        // 2. HISTORICAL CANDLES (PROXY)
        if (parsedUrl.pathname === '/candles') {
            // ... (Exact same logic as V7.1)
            let pair = parsedUrl.query.pair as string;
            // ... (keep existing validation/mapping)
            if (!pair) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Missing pair parameter' }));
                return;
            }
            const granularity = parsedUrl.query.granularity || '3600';
            if (pair.endsWith('-PERP')) { pair = pair.replace('-PERP', '-USD'); }

            console.log(`[PROXY] Fetching candles for ${pair}...`);
            try {
                const response = await axios.get(`https://api.exchange.coinbase.com/products/${pair}/candles`, {
                    params: { granularity, limit: 300 },
                    headers: { 'User-Agent': 'NodeJS-Oracle', 'Accept': 'application/json' },
                    timeout: 5000
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response.data));
                console.log(`[SUCCESS] Served candles for ${pair}`);
            } catch (error: any) {
                console.error(`[ERROR] Fetch failed:`, error.message);
                res.writeHead(502);
                res.end(JSON.stringify({ error: 'Coinbase API Error', details: error.message }));
            }
            return;
        }

        // 3. FEAR AND GREED PROXY (NEW)
        if (parsedUrl.pathname === '/fng') {
            console.log(`[PROXY] Fetching Fear & Greed Index...`);
            try {
                const response = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response.data));
                console.log(`[SUCCESS] Served F&G Index`);
            } catch (error: any) {
                console.error(`[ERROR] F&G Fetch failed:`, error.message);
                res.writeHead(502);
                res.end(JSON.stringify({ error: 'F&G Proxy Error', details: error.message }));
            }
            return;
        }

        // 4. NEWS RSS PROXY (NEW)
        if (parsedUrl.pathname === '/news') {
            console.log(`[PROXY] Fetching CoinTelegraph RSS...`);
            try {
                const response = await axios.get('https://cointelegraph.com/rss', { timeout: 5000 });
                res.writeHead(200, { 'Content-Type': 'application/xml' }); // Return XML for RSS
                res.end(response.data);
                console.log(`[SUCCESS] Served RSS Feed`);
            } catch (error: any) {
                console.error(`[ERROR] RSS Fetch failed:`, error.message);
                res.writeHead(502);
                res.end(JSON.stringify({ error: 'RSS Proxy Error', details: error.message }));
            }
            return;
        }

        // 5. MACRO CALENDAR (KEYLESS - FOREXFACTORY)
        if (req.method === 'GET' && parsedUrl.pathname === '/macro') {
            try {
                // Check Cache (1 hour)
                const now = Date.now();
                if (macroCache && (now - lastMacroUpdate < 3600000)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ source: 'cache', data: macroCache }));
                    return;
                }

                console.log('[MACRO] Fetching ForexFactory Data...');
                const response = await axios.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
                    headers: { 'User-Agent': 'Mozilla/5.0' }, // Pretend to be a browser
                    timeout: 5000
                });

                // Filter: Only USD and High Impact
                const events = response.data;
                const highImpact = events.filter((e: any) =>
                    e.country === 'USD' &&
                    (e.impact === 'High' || e.impact === 'Medium') // Medium is also useful for context
                );

                // Update Cache
                macroCache = highImpact;
                lastMacroUpdate = now;

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ source: 'live', data: highImpact }));
                console.log(`[MACRO] Served ${highImpact.length} events`);
            } catch (error: any) {
                console.error(`[ERROR] Macro Fetch failed:`, error.message);
                res.writeHead(502);
                res.end(JSON.stringify({ error: 'Macro Proxy Error', details: error.message }));
            }
            return;
        }

        // 6. MARKET CONTEXT (STOCKS & MACRO) - FINNHUB (V19)
        if (parsedUrl.pathname === '/market-context') {
            try {
                const now = Date.now();
                // Cache for 1 miinute (Real-time is better, but rate limit is 60/min for free)
                if (stockCache && (now - lastStockUpdate < 60000)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ source: 'cache', ...stockCache }));
                    return;
                }

                console.log('[STOCKS] Fetching Market Context (Finnhub)...');

                const FINNHUB_KEY = process.env.FINNHUB_KEY;
                if (!FINNHUB_KEY) {
                    throw new Error("FINNHUB_KEY not set in environment");
                }

                // Helper to fetch single quote
                const getQuote = async (symbol: string) => {
                    try {
                        const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
                        const res = await axios.get(url, { timeout: 5000 });
                        if (res.data.c === 0 && res.data.d === null) return null; // Invalid
                        return {
                            symbol,
                            price: res.data.c, // Current price
                            change_percent: res.data.dp // Percent change
                        };
                    } catch (e) {
                        return null;
                    }
                };

                // Finnhub symbols
                const watchlist = ['QQQ', 'MSTR', 'NVDA', 'AAPL', 'COIN'];

                // Parallel Fetch
                const results = await Promise.all(watchlist.map(s => getQuote(s)));
                const data = results.filter(r => r !== null) as any[];

                if (data.length === 0) {
                    throw new Error("Finnhub returned no data (Check API Key or Limits)");
                }

                // Logic: Determine Severity
                // IF QQQ or MSTR drops > 2% -> CRASH_WARNING
                let sentiment = "NEUTRAL";
                let crashWarning = false;

                const qqq = data.find(d => d.symbol === 'QQQ');
                const mstr = data.find(d => d.symbol === 'MSTR');

                if ((qqq && qqq.change_percent < -2) || (mstr && mstr.change_percent < -2)) {
                    sentiment = "CRASH_WARNING";
                    crashWarning = true;
                } else if (qqq && qqq.change_percent < -1) {
                    sentiment = "BEARISH";
                } else if (qqq && qqq.change_percent > 1) {
                    sentiment = "BULLISH";
                }

                stockCache = { sentiment, crash_warning: crashWarning, data };
                lastStockUpdate = now;

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ source: 'live_finnhub', ...stockCache }));
                console.log(`[STOCKS] Served Context: ${sentiment}`);
            } catch (error: any) {
                console.error(`[ERROR] Stock Fetch failed:`, error.message);

                // CRITICAL FAIL (USER REQUESTED HARD ERROR)
                res.writeHead(502);
                res.end(JSON.stringify({
                    error: "Stock Data Unavailable",
                    details: error.message,
                    instructions: "Please update FINNHUB_KEY in docker-compose.yml"
                }));
            }
            return;
        }

        // 7. GEMINI AI PROXY (NEW V10 - MACRO AWARE)
        if (req.method === 'POST' && parsedUrl.pathname === '/analyze') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const apiKey = data.api_key;

                    if (!apiKey) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: "Missing 'api_key' in body" }));
                        return;
                    }

                    // --- BYPASS AI FOR TESTS ---
                    
                    // --- ROBUST BYPASS AI FOR TESTS ---
                    // Check MULTIPLE fields because N8N might filter 'source'
                    const isTest = 
                        (data.source && data.source.includes("TEST")) ||
                        (data.sentiment && data.sentiment.includes("TEST")) ||
                        (data.technical_status && data.technical_status.includes("TEST")) ||
                        (data.trend && data.trend.includes("TEST"));

                    if (isTest) {
                        console.log(`[TEST MODE] Bypassing AI for ${data.pair}. Returning 100% Confidence.`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                             signal: "BUY",
                             confidence: 100,
                             reasoning: "TEST SIGNAL (AI BYPASSED 100%)",
                             macro_impact: "TEST MODE"
                        }));
                        return;
                    }


                    console.log(`[AI] Analyzing Market Data for ${data.pair || 'Crypto'}...`);

                    const prompt = `
You are a crypto trading expert. Analyze this data and provide a signal (BUY, SELL, or HOLD).

=== MARKET DATA ===
Pair: ${data.pair}
Trend: ${data.trend}
RSI: ${data.rsi}
Technical Status: ${data.technical_status}
Fear & Greed Index: ${data.fng_value} (${data.fng_label})
News Sentiment: ${data.news_sentiment || 'Neutral'}
Market Context (Stocks/TradFi): ${JSON.stringify(data.market_context || 'None')}

=== INSTRUCTIONS ===
1. Respond with a JSON object ONLY.
2. **CRITICAL RISK CHECK**:
   - If 'Market Context' sentiment is "CRASH_WARNING" (Nasdaq/MSTR down >2%), SIGNAL MUST BE "HOLD" or "SELL".
   - **FAIL-SAFE LOGIC**: If sentiment is "NEUTRAL" or "DATA_UNAVAILABLE" (due to API error), **RELY 90% ON TECHNICAL INDICATORS** (Trend, RSI). Do NOT lower confidence artificially just because stock data is missing.
   - **AGGRESSIVE SHORT MODE**: If sentiment is "CRASH_WARNING", **IGNORE** 'Oversold' RSI (e.g. <30). In a crash, RSI is irrelevant. SELL if trend confirms.
   - If "BEARISH", reduce confidence for "BUY" signals by 20%.
3. Format: { "signal": "BUY" | "SELL" | "HOLD", "confidence": 0-100, "reasoning": "Short explanation", "macro_impact": "Explain how stocks/macro affected this" }
4. Be conservative unless Shorting in a crash. High correlation between stocks and crypto means stock dump = crypto dump.
`;

                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

                    const response = await axios.post(geminiUrl, {
                        contents: [{ parts: [{ text: prompt }] }]
                    }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000
                    });

                    // Extract text from Gemini response structure
                    const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text; // Simplify for N8N

                    // Try to parse JSON from the text if possible, or just return the text
                    // We will return the raw text to N8N so it can parse via JSON node or use regex
                    // Actually, let's try to parse it safely to ensure valid JSON return.

                    let result = { raw: generatedText };
                    try {
                        // Remove markdown code blocks if present
                        const cleanJson = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
                        result = JSON.parse(cleanJson);
                    } catch (e) {
                        console.log("Could not parse AI JSON, returning raw text");
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                    console.log(`[AI] Analysis Served: ${JSON.stringify(result).substring(0, 50)}...`);

                } catch (error: any) {
                    console.error(`[ERROR] AI Analysis Failed:`, error.message);

                    let details = error.message;
                    if (error.response) {
                        console.error(`[AI ERROR DATA]`, JSON.stringify(error.response.data));
                        details = `Gemini API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
                    }

                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Gemini Proxy Error',
                        details: details,
                        solution: "Check API Key in N8N HTTP Request node."
                    }));
                }
            });
            return;
        }

        // 8. TRADE LOGGER (POST /log-trade)
        if (req.method === 'POST' && parsedUrl.pathname === '/log-trade') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const trade: TradeLog = {
                        pair: data.pair || 'UNKNOWN',
                        type: data.pnl >= 0 ? 'WIN' : 'LOSS',
                        pnl: parseFloat(data.pnl),
                        price: parseFloat(data.price),
                        time: new Date().toLocaleTimeString()
                    };

                    dailyTrades.push(trade);
                    console.log(`📝 [LOG] ${trade.time} | ${trade.pair} | ${trade.type} | ${trade.pnl}%`);

                    res.writeHead(200);
                    res.end(JSON.stringify({ status: 'Logged' }));
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
            return;
        }

        res.writeHead(200);
        res.end("Futures Oracle Running (V12 - Autonomous). Endpoints: GET /price, POST /log-trade, /market-context");
    });

    server.listen(PORT, () => {
        console.log(`✅ [FUTURES ORACLE] Captain's Log active on port ${PORT}`);
    });
}

// --- DAILY REPORT ---
function checkDailyReset() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (today !== currentDay) {
        printDailyReport();
        dailyTrades = [];
        currentDay = today;
    }
}

function printDailyReport() {
    const wins = dailyTrades.filter(t => t.type === 'WIN').length;
    const losses = dailyTrades.filter(t => t.type === 'LOSS').length;
    const totalPnL = dailyTrades.reduce((sum, t) => sum + t.pnl, 0);

    console.log(`\n========================================`);
    console.log(`📅 DAILY SUMMARY: ${currentDay}`);
    console.log(`========================================`);

    dailyTrades.forEach((t, i) => {
        const icon = t.type === 'WIN' ? '🟢' : '🔴';
        console.log(`${i + 1}. ${icon} ${t.pair} (${t.time}): ${t.pnl}%`);
    });

    console.log(`----------------------------------------`);
    console.log(`🏆 WINS: ${wins} | 💀 LOSSES: ${losses}`);
    console.log(`💰 TOTAL PNL: ${totalPnL.toFixed(2)}%`);
    console.log(`========================================\n`);
}

setInterval(checkDailyReset, 60000);

// --- WEBSOCKET ---
function connectWs() {
    console.log(`[CONNECT] Connecting to ${WS_URL}...`);
    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
        console.log('[CONNECTED] Validating connection...');
        wsConnected = true;
        const subscribeMsg = {
            "type": "subscribe",
            "channel": "ticker",
            "product_ids": TARGET_PAIRS
        };
        ws.send(JSON.stringify(subscribeMsg));
        console.log(`[SUBSCRIBE] Sent subscription for: ${TARGET_PAIRS.join(', ')}`);
    });

    ws.on('message', (data: any) => {
        wsConnected = true;
        lastWsUpdate = Date.now();
        try {
            const msg = JSON.parse(data.toString());
            if (msg.channel === 'ticker' && msg.events) {
                for (const event of msg.events) {
                    if (event.type === 'update' || event.type === 'snapshot') {
                        for (const ticker of event.tickers) {
                            const price = parseFloat(ticker.price);
                            prices.set(ticker.product_id, price);
                            // FEED AUTONOMOUS AGENT
                            monitor.update(ticker.product_id, price);
                        }
                    }
                }
            }
        } catch (e) { }
    });

    // Heartbeat to keep connection alive
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);

    ws.on('close', () => {
        clearInterval(pingInterval);
        console.log('⚠️ [WS] Disconnected. Reconnecting in 5s...');
        wsConnected = false;
        setTimeout(connectWs, 5000);
    });

    ws.on('error', (e) => console.error(`❌ [WS ERROR] ${e.message}`));
}

// --- SMART REPORTER ---
async function sendSystemReport(status: "STARTUP" | "ERROR", msg: string) {
    const url = `${N8N_WEBHOOK_BASE}system`;
    try {
        await axios.post(url, {
            type: "SYSTEM_REPORT",
            level: status === "ERROR" ? "CRITICAL" : "INFO",
            message: msg,
            timestamp: Date.now()
        });
        console.log(`✅ [REPORT SENT] ${msg}`);
    } catch (e: any) {
        if (e.response && e.response.status === 404) {
            console.log(`🔸 [REPORTING DISABLED] Create 'futurec-trigger-system' in N8N to receive Telegram alerts.`);
        } else {
            console.error(`⚠️ [REPORT FAILED] Connection error: ${e.message}`);
        }
    }
}

// --- SELF-DIAGNOSTIC (STARTUP CHECK) ---
function runStartupCheck() {
    console.log("⏳ [SYSTEM] Waiting 10s for warm-up...");
    setTimeout(async () => {
        const isHealthy = wsConnected && prices.size > 0;
        const tracked = Array.from(prices.keys()).length;

        console.log(`🔍 [DIAGNOSTIC] Connected: ${wsConnected}, Pairs: ${tracked}, Finnhub: Ready`);

        if (isHealthy) {
            sendSystemReport("STARTUP", `🟢 Futures Oracle Online. Tracking ${tracked} pairs.`);
        } else {
            console.error(`🔴 [DIAGNOSTIC FAILED] Oracle is NOT healthy.`);
            sendSystemReport("ERROR", "🔴 Oracle Startup FAILED. Check server logs!");
        }
    }, 10000);
}

// --- MAIN ---
startServer();
connectWs();
runStartupCheck();
