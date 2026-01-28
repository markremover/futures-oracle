import WebSocket from 'ws';
import http from 'http';
import url from 'url';
import axios from 'axios';
import crypto from 'crypto';
// import yahooFinance from 'yahoo-finance2'; // DEPRECATED

// --- CONFIG ---
const PORT = 3001;
const WS_URL = 'wss://advanced-trade-ws.coinbase.com';
const TARGET_PAIRS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'SUI-USD'];
const N8N_WEBHOOK_BASE = 'http://n8n:5678/webhook';
const STOCK_WATCHLIST = ['QQQ', 'NVDA', 'AAPL', 'MSTR', 'COIN', '^TNX', 'DX-Y.NYB']; // Stocks, US10Y, DXY

// --- COINBASE API ---
const COINBASE_API_URL = 'https://api.coinbase.com/api/v3/brokerage';
const COINBASE_API_KEY = process.env.COINBASE_API_KEY || '';
const COINBASE_API_SECRET = process.env.COINBASE_API_SECRET || '';

// --- GHOST SNIPER SIMULATION MODE (V21) ---
// Detect simulation mode (no API keys = virtual trading)
const SIMULATION_MODE = !COINBASE_API_KEY || !COINBASE_API_SECRET;
const SIM_BALANCE = 1400; // Virtual capital for testing
let simBalance = SIM_BALANCE; // Current virtual balance

if (SIMULATION_MODE) {
    console.log('\n🎮 [GHOST SNIPER] Simulation Mode Active');
    console.log(`💰 Virtual Capital: $${SIM_BALANCE}`);
    console.log('📊 Using REAL market data with VIRTUAL execution\n');
}

// --- STATE ---
let ws: any = null;
let reconnectAttempt = 0;
const prices: Map<string, number> = new Map();
let wsConnected = false;
let lastWsUpdate = 0;
let macroCache: any[] | null = null;
let lastMacroUpdate = 0;
let stockCache: any = null;
let lastStockUpdate = 0;

// --- ACCOUNT DATA CACHE (V20) ---
let accountBalance: number = 0;
let leverageCache: Map<string, number> = new Map(); // pair -> max leverage
let lastAccountUpdate = 0;
const ACCOUNT_CACHE_MS = 30000; // 30 seconds

// --- PORTFOLIO MANAGEMENT (V21) ---
interface ActivePosition {
    pair: string;
    orderId: string;
    side: 'BUY' | 'SELL';
    entryPrice: number;
    contracts: number;
    timestamp: number;
    slPrice?: number; // Ghost Sniper: track SL
    tpPrice?: number; // Ghost Sniper: track TP
    isSimulated?: boolean; // Ghost Sniper: virtual position marker
    unrealizedPnl?: number; // Ghost Sniper: current PnL
}

interface TradeHistory {
    pair: string;
    timestamp: number;
    side: 'BUY' | 'SELL';
    result: 'PENDING' | 'WIN' | 'LOSS';
    pnl?: number;
}

let activePositions: ActivePosition[] = [];
const MAX_POSITIONS = 3; // SNIPER MODE: Allow 3 active positions
let slCooldowns: Map<string, number> = new Map(); // pair -> timestamp of last SL hit
const COOLDOWN_AFTER_SL_MS = 3 * 60 * 60 * 1000; // 3 hours

// SNIPER MODE: Two-chances rule (max 2 trades per coin per 24h)
let dailyTrades: TradeHistory[] = [];
const MAX_TRADES_PER_COIN_24H = 2;

// GHOST SNIPER: Virtual position monitoring
let virtualPositions: ActivePosition[] = []; // Separate tracking for sim mode
let totalVirtualPnl = 0; // Track cumulative virtual profit/loss

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
        // --- DYNAMIC THRESHOLD (SMART COPY) ---
        // High Volatility (DOGE, SUI) -> 1.2%
        // Standard (ETH, SOL, XRP)   -> 0.8%

        let threshold = 0.8;
        if (pair.includes("DOGE") || pair.includes("SUI")) {
            threshold = 1.2;
        }

        // Check Global Stock Sentiment
        const sentiment = stockCache?.sentiment || "NEUTRAL";

        // If Market is Bearish/Crashing, be more sensitive to DROPS (Shorts)
        if ((sentiment === "BEARISH" || sentiment === "CRASH_WARNING") && change < 0) {
            // Reduce threshold by 0.3% in crash mode
            threshold = Math.max(0.5, threshold - 0.3);
        }

        if (absChange >= threshold) {
            this.triggerAlert(pair, "VELOCITY", change);
        }
    }

    private async getTrendData(pair: string): Promise<{ sma200_1h: number, sma200_4h: number, currentPrice: number } | null> {
        try {
            // Fetch 1h candles (last 200 hours = ~8 days)
            const candles1h = await this.fetchCandles(pair, 3600, 200);
            // Fetch 4h candles (last 800 hours = ~33 days)
            const candles4h = await this.fetchCandles(pair, 14400, 200);

            if (!candles1h || !candles4h) return null;

            const sma200_1h = this.calculateSMA(candles1h, 200);
            const sma200_4h = this.calculateSMA(candles4h, 200);
            const currentPrice = prices.get(pair) || 0;

            return { sma200_1h, sma200_4h, currentPrice };
        } catch (e: any) {
            console.error(`❌ [TREND ERROR] Failed to fetch trend data for ${pair}:`, e.message);
            return null;
        }
    }

    private async fetchCandles(pair: string, granularity: number, count: number): Promise<number[] | null> {
        try {
            const endTime = Math.floor(Date.now() / 1000);
            const startTime = endTime - (granularity * count);

            const response = await axios.get(`https://api.exchange.coinbase.com/products/${pair}/candles`, {
                params: {
                    start: startTime,
                    end: endTime,
                    granularity
                }
            });

            if (!response.data || !Array.isArray(response.data)) return null;

            // Coinbase returns [time, low, high, open, close, volume]
            // We need close prices (index 4)
            return response.data.map((candle: any) => candle[4]);
        } catch (e) {
            return null;
        }
    }

    private calculateSMA(prices: number[], period: number): number {
        if (prices.length < period) return prices[prices.length - 1] || 0;
        const slice = prices.slice(-period);
        const sum = slice.reduce((a, b) => a + b, 0);
        return sum / period;
    }

    private shouldBlockSignal(pair: string, trendData: { sma200_1h: number, sma200_4h: number, currentPrice: number }): string | null {
        const { sma200_1h, sma200_4h, currentPrice } = trendData;

        // Block LONG signals in downtrend (price below SMA200 on both timeframes)
        if (currentPrice < sma200_1h && currentPrice < sma200_4h) {
            return `DOWNTREND: Price ${currentPrice.toFixed(2)} < SMA200_1h ${sma200_1h.toFixed(2)} & SMA200_4h ${sma200_4h.toFixed(2)}`;
        }

        // For now, we don't block SHORT signals (Oracle doesn't generate them yet)
        // Future: Block SHORT in uptrend (price > SMA200)

        return null; // Signal allowed
    }

    private async triggerAlert(pair: string, type: string, value: number) {
        const now = Date.now();
        const last = this.lastAlert.get(pair) || 0;

        // Extended cooldown: 3 hours instead of 15 mins to prevent spam during crashes
        const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours
        if (now - last < COOLDOWN_MS) {
            const remainingMin = Math.floor((COOLDOWN_MS - (now - last)) / 60000);
            console.log(`⏸️  [COOLDOWN] ${pair} blocked - ${remainingMin}min remaining`);
            return;
        }

        // TREND PROTECTION: Check SMA200 before sending signal
        console.log(`🔍 [TREND CHECK] Analyzing ${pair} trend before signal...`);
        const trendData = await this.getTrendData(pair);

        if (!trendData) {
            console.log(`⚠️  [TREND WARNING] Could not fetch trend data for ${pair} - BLOCKING signal as safety measure`);
            return;
        }

        const blockReason = this.shouldBlockSignal(pair, trendData);
        if (blockReason) {
            console.log(`🚫 [BLOCKED] ${pair} signal blocked: ${blockReason}`);
            return;
        }

        console.log(`✅ [TREND OK] ${pair} passed trend check - Price: ${trendData.currentPrice.toFixed(2)}, SMA200_1h: ${trendData.sma200_1h.toFixed(2)}, SMA200_4h: ${trendData.sma200_4h.toFixed(2)}`);
        console.log(`🚀 [ALERT] ${pair} triggered ${type}: ${value.toFixed(2)}% (Threshold checked)`);
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



// --- COINBASE API HELPERS (V20) ---

/**
 * Generate JWT token for Coinbase Advanced Trade API v3
 */
function generateCoinbaseJWT(method: string, path: string): string {
    if (!COINBASE_API_KEY || !COINBASE_API_SECRET) {
        throw new Error('Coinbase API credentials not set');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
        iss: 'coinbase-cloud',
        nbf: timestamp,
        exp: timestamp + 120, // 2 min expiry
        sub: COINBASE_API_KEY,
        iat: timestamp
    };

    const header = { alg: 'ES256', kid: COINBASE_API_KEY, typ: 'JWT' };

    const token = Buffer.from(JSON.stringify(header)).toString('base64url') + '.' +
        Buffer.from(JSON.stringify(payload)).toString('base64url');

    const signature = crypto
        .createSign('SHA256')
        .update(token)
        .sign(COINBASE_API_SECRET, 'base64url');

    return token + '.' + signature;
}

/**
 * Fetch available balance from Coinbase
 */
async function fetchAccountBalance(): Promise<number> {
    try {
        const path = '/accounts';
        const jwt = generateCoinbaseJWT('GET', path);

        const response = await axios.get(`${COINBASE_API_URL}${path}`, {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json'
            }
        });

        // Find USDC account (futures use USDC margin)
        const usdcAccount = response.data.accounts?.find((acc: any) => acc.currency === 'USDC');
        return parseFloat(usdcAccount?.available_balance?.value || '0');
    } catch (e: any) {
        console.error('❌ [COINBASE API] Failed to fetch balance:', e.message);
        return 0;
    }
}

/**
 * Fetch max leverage for a specific pair
 */
async function fetchMaxLeverage(pair: string): Promise<number> {
    try {
        const productId = `${pair}-PERP`;
        const path = `/products/${productId}`;
        const jwt = generateCoinbaseJWT('GET', path);

        const response = await axios.get(`${COINBASE_API_URL}${path}`, {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json'
            }
        });

        return parseFloat(response.data.fcm_trading_session_details?.max_leverage || '1');
    } catch (e: any) {
        console.error(`❌ [COINBASE API] Failed to fetch leverage for ${pair}:`, e.message);
        return 1; // Default to 1x if error
    }
}

/**
 * Update account data cache (balance + leverage for all pairs)
 */
async function refreshAccountData(): Promise<void> {
    const now = Date.now();
    if (now - lastAccountUpdate < ACCOUNT_CACHE_MS) {
        return; // Use cache
    }

    console.log('🔄 [ACCOUNT SYNC] Refreshing balance and leverage...');

    // GHOST SNIPER: Use virtual balance in simulation mode
    if (SIMULATION_MODE) {
        accountBalance = simBalance;
        // Set default leverage for all pairs (5x is common for perps)
        for (const pair of TARGET_PAIRS) {
            leverageCache.set(pair, 5); // Virtual 5x leverage
        }
        lastAccountUpdate = now;
        console.log(`🎮 [SIM MODE] Virtual Balance: $${simBalance.toFixed(2)}, Leverage: 5x`);
        return;
    }

    accountBalance = await fetchAccountBalance();

    for (const pair of TARGET_PAIRS) {
        const leverage = await fetchMaxLeverage(pair);
        leverageCache.set(pair, leverage);
    }

    lastAccountUpdate = now;
    console.log(`✅ [ACCOUNT SYNC] Balance: $${accountBalance.toFixed(2)}, Leverage: ${Array.from(leverageCache.entries()).map(([p, l]) => `${p.split('-')[0]}:${l}x`).join(', ')}`);
}

// --- V21 RECOVERY MODE: ATR & TREND FILTER ---

/**
 * Calculate Average True Range (ATR) from candles
 * @param candles Array of [time, low, high, open, close, volume]
 * @param period ATR period (default: 14)
 */
function calculateATR(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 0;

    const trueRanges: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const prevCandle = candles[i - 1];
        const currCandle = candles[i];

        const prevLow = prevCandle[1];
        const prevHigh = prevCandle[2];
        const prevClose = prevCandle[4];
        const currLow = currCandle[1];
        const currHigh = currCandle[2];

        const highLow = currHigh - currLow;
        const highClosePrev = Math.abs(currHigh - prevClose);
        const lowClosePrev = Math.abs(currLow - prevClose);

        trueRanges.push(Math.max(highLow, highClosePrev, lowClosePrev));
    }

    // Take last 'period' values and average
    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}

/**
 * Fetch 1h candles for ATR and MA calculations
 */
async function fetchCandlesForATR(pair: string, count: number = 200): Promise<any[] | null> {
    try {
        const granularity = 3600; // 1 hour
        const endTime = Math.floor(Date.now() / 1000);
        const startTime = endTime - (granularity * count);

        const response = await axios.get(`https://api.exchange.coinbase.com/products/${pair}/candles`, {
            params: { start: startTime, end: endTime, granularity },
            timeout: 10000
        });

        return response.data || null;
    } catch (e: any) {
        console.error(`❌ [CANDLES] Failed to fetch for ${pair}:`, e.message);
        return null;
    }
}

/**
 * Check if LONG signal should be blocked based on MA(200) 1h
 * Priority #1: Prevent catching falling knives
 */
async function shouldBlockLong(pair: string): Promise<{ blocked: boolean, reason?: string }> {
    try {
        const candles = await fetchCandlesForATR(pair, 200);
        if (!candles || candles.length < 200) {
            return { blocked: true, reason: 'Insufficient candle data for MA200 check' };
        }

        // Calculate MA(200) from close prices (index 4)
        const closePrices = candles.map((c: any) => c[4]);
        const ma200 = closePrices.slice(-200).reduce((sum: number, p: number) => sum + p, 0) / 200;

        const currentPrice = prices.get(pair) || closePrices[closePrices.length - 1];

        if (currentPrice < ma200) {
            return {
                blocked: true,
                reason: `Price ${currentPrice.toFixed(2)} < MA(200) ${ma200.toFixed(2)} - Downtrend`
            };
        }

        console.log(`✅ [TREND OK] ${pair}: Price ${currentPrice.toFixed(2)} > MA(200) ${ma200.toFixed(2)}`);
        return { blocked: false };
    } catch (e: any) {
        console.error(`❌ [TREND ERROR] ${pair}:`, e.message);
        return { blocked: true, reason: 'Trend check failed - blocking as safety' };
    }
}

// --- V21 SNIPER MODE: TWO-CHANCES RULE ---

/**
 * Clean up trade history older than 24 hours
 */
function cleanupOldTrades() {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    dailyTrades = dailyTrades.filter(trade => (now - trade.timestamp) < TWENTY_FOUR_HOURS);
}

/**
 * Record a new trade
 */
function recordTrade(pair: string, side: 'BUY' | 'SELL') {
    cleanupOldTrades();
    dailyTrades.push({
        pair,
        timestamp: Date.now(),
        side,
        result: 'PENDING'
    });
}

/**
 * Update trade result (called when position closes)
 */
function updateTradeResult(pair: string, result: 'WIN' | 'LOSS', pnl?: number) {
    const recent = dailyTrades.filter(t => t.pair === pair && t.result === 'PENDING')
        .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (recent) {
        recent.result = result;
        recent.pnl = pnl;
        console.log(`📝 [TRADE RESULT] ${pair}: ${result}${pnl ? ` (${pnl.toFixed(2)}%)` : ''}`);
    }
}

/**
 * Check if pair can trade based on two-chances rule
 */
function canTradeToday(pair: string): { allowed: boolean, reason?: string } {
    cleanupOldTrades();

    const tradesLast24h = dailyTrades.filter(t => t.pair === pair);

    if (tradesLast24h.length >= MAX_TRADES_PER_COIN_24H) {
        return {
            allowed: false,
            reason: `Max ${MAX_TRADES_PER_COIN_24H} trades per 24h reached`
        };
    }

    if (tradesLast24h.length === 1) {
        const firstTrade = tradesLast24h[0];
        if (firstTrade.result === 'LOSS') {
            const timeSinceLoss = Date.now() - firstTrade.timestamp;
            if (timeSinceLoss < COOLDOWN_AFTER_SL_MS) {
                const remainingMin = Math.floor((COOLDOWN_AFTER_SL_MS - timeSinceLoss) / 60000);
                return {
                    allowed: false,
                    reason: `Second chance requires 3h wait after first loss (${remainingMin}min remaining)`
                };
            }
        }
    }

    return { allowed: true };
}

/**
 * Check if new position can be opened (V21 Portfolio Management)
 */
function canOpenNewPosition(pair: string): { allowed: boolean, reason?: string } {
    // Check two-chances rule first
    const twoChancesCheck = canTradeToday(pair);
    if (!twoChancesCheck.allowed) {
        return twoChancesCheck;
    }

    // Check portfolio limit
    if (activePositions.length >= MAX_POSITIONS) {
        return {
            allowed: false,
            reason: `Portfolio full (${activePositions.length}/${MAX_POSITIONS} positions)`
        };
    }

    // Check cooldown after SL hit
    const lastSL = slCooldowns.get(pair) || 0;
    const now = Date.now();
    if (now - lastSL < COOLDOWN_AFTER_SL_MS) {
        const remainingMin = Math.floor((COOLDOWN_AFTER_SL_MS - (now - lastSL)) / 60000);
        return {
            allowed: false,
            reason: `Cooldown active: ${remainingMin}min remaining after SL`
        };
    }

    return { allowed: true };
}

// --- GHOST SNIPER: VIRTUAL POSITION MONITOR ---

function monitorVirtualPositions() {
    if (!SIMULATION_MODE || virtualPositions.length === 0) return;

    virtualPositions.forEach((pos, index) => {
        const currentPrice = prices.get(pos.pair);
        if (!currentPrice) return;

        const priceDiff = pos.side === 'BUY' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
        pos.unrealizedPnl = priceDiff * pos.contracts;

        const slHit = pos.side === 'BUY' ? currentPrice <= (pos.slPrice || 0) : currentPrice >= (pos.slPrice || 0);
        const tpHit = pos.side === 'BUY' ? currentPrice >= (pos.tpPrice || 999999) : currentPrice <= (pos.tpPrice || 0);

        if (slHit) {
            const slPnl = ((pos.slPrice || 0) - pos.entryPrice) * pos.contracts * (pos.side === 'BUY' ? 1 : -1);
            simBalance += Math.abs(slPnl);
            totalVirtualPnl += slPnl;
            console.log(`🛑 [SIM] SL HIT: ${pos.pair} @ $${currentPrice.toFixed(2)} | PnL: $${slPnl.toFixed(2)} | Balance: $${simBalance.toFixed(2)}`);
            virtualPositions.splice(index, 1);
            updateTradeResult(pos.pair, 'LOSS', slPnl);
            slCooldowns.set(pos.pair, Date.now());
        } else if (tpHit) {
            const tpPnl = ((pos.tpPrice || 0) - pos.entryPrice) * pos.contracts * (pos.side === 'BUY' ? 1 : -1);
            simBalance += Math.abs(tpPnl);
            totalVirtualPnl += tpPnl;
            console.log(`🎯 [SIM] TP HIT: ${pos.pair} @ $${currentPrice.toFixed(2)} | PnL: $${tpPnl.toFixed(2)} | Balance: $${simBalance.toFixed(2)}`);
            virtualPositions.splice(index, 1);
            updateTradeResult(pos.pair, 'WIN', tpPnl);
        }
    });
}

setInterval(monitorVirtualPositions, 5000);

/**
 * Add position to portfolio tracking
 */
function addPosition(pair: string, orderId: string, side: 'BUY' | 'SELL', entryPrice: number, contracts: number) {
    activePositions.push({
        pair,
        orderId,
        side,
        entryPrice,
        contracts,
        timestamp: Date.now()
    });
    console.log(`➕ [PORTFOLIO] Added ${pair} position (${activePositions.length}/${MAX_POSITIONS})`);
}

/**
 * Remove position from tracking (called when TP/SL is hit)
 */
function removePosition(orderId: string, hitSL: boolean = false) {
    const pos = activePositions.find(p => p.orderId === orderId);
    if (!pos) return;

    if (hitSL) {
        slCooldowns.set(pos.pair, Date.now());
        console.log(`🔒 [COOLDOWN] ${pos.pair} blocked for 3 hours after SL hit`);
    }

    activePositions = activePositions.filter(p => p.orderId !== orderId);
    console.log(`➖ [PORTFOLIO] Removed ${pos.pair} (${activePositions.length}/${MAX_POSITIONS} remaining)`);
}

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

        // 3. ACCOUNT INFO (V20 - AUTONOMOUS TRADING)
        if (parsedUrl.pathname === '/account-info') {
            try {
                await refreshAccountData(); // Refresh cache if needed

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    balance: accountBalance,
                    leverage: Object.fromEntries(leverageCache),
                    last_updated: lastAccountUpdate,
                    timestamp: Date.now()
                }));
                console.log(`[ACCOUNT INFO] Balance: $${accountBalance.toFixed(2)}`);
            } catch (error: any) {
                console.error('[ACCOUNT INFO ERROR]:', error.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'Failed to fetch account data',
                    details: error.message
                }));
            }
            return;
        }

        // 4. CALCULATE POSITION SIZE (V20)
        if (req.method === 'POST' && parsedUrl.pathname === '/calculate-position') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const { pair, entry_price, sl_price, tp_price, risk_amount = 10, tp_amount = 20 } = data;

                    if (!pair || !entry_price || !sl_price || !tp_price) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing required fields: pair, entry_price, sl_price, tp_price' }));
                        return;
                    }

                    // Refresh account data
                    await refreshAccountData();

                    const leverage = leverageCache.get(pair) || 1;
                    const balance = accountBalance;

                    // Calculate position size based on SL risk
                    const slDistance = Math.abs(entry_price - sl_price);
                    if (slDistance === 0) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'SL price must be different from entry price' }));
                        return;
                    }

                    const contracts = risk_amount / slDistance; // Risk $10 on SL
                    const notional = contracts * entry_price;
                    const marginRequired = notional / leverage;

                    // Safety check: use only 95% of available balance
                    const safeMarginLimit = balance * 0.95;
                    if (marginRequired > safeMarginLimit) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            allowed: false,
                            reason: 'Insufficient margin',
                            margin_required: marginRequired.toFixed(2),
                            margin_available: safeMarginLimit.toFixed(2)
                        }));
                        return;
                    }

                    // Min notional check (Coinbase requirement)
                    if (notional < 10) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            allowed: false,
                            reason: 'Below minimum notional',
                            notional: notional.toFixed(2),
                            minimum: 10
                        }));
                        return;
                    }

                    // Success - return position details
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        allowed: true,
                        pair,
                        contracts: contracts.toFixed(4),
                        notional: notional.toFixed(2),
                        margin_required: marginRequired.toFixed(2),
                        leverage: leverage,
                        entry_price: entry_price,
                        sl_price: sl_price,
                        tp_price: tp_price,
                        risk_amount: risk_amount,
                        tp_amount: tp_amount
                    }));
                    console.log(`[POSITION CALC] ${pair}: ${contracts.toFixed(4)} contracts, margin: $${marginRequired.toFixed(2)}`);
                } catch (error: any) {
                    console.error('[POSITION CALC ERROR]:', error.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Calculation failed', details: error.message }));
                }
            });
            return;
        }

        // 5. EXECUTE ORDER (V21 - RECOVERY MODE WITH ATR + TREND FILTER)
        if (req.method === 'POST' && parsedUrl.pathname === '/execute-order') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const { pair, signal, confidence } = data;

                    if (!pair || !signal) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing required fields: pair, signal' }));
                        return;
                    }

                    console.log(`\ud83d\ude80 [V21 EXECUTE] ${signal} ${pair} (Confidence: ${confidence || 'N/A'})`);

                    // === STEP 1: MA(200) TREND FILTER (Priority #1) ===
                    if (signal.toUpperCase() === 'BUY') {
                        const trendCheck = await shouldBlockLong(pair);
                        if (trendCheck.blocked) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: false,
                                error: 'Trend filter block',
                                reason: trendCheck.reason
                            }));
                            console.log(`\ud83d\udeab [TREND BLOCK] ${pair}: ${trendCheck.reason}`);
                            return;
                        }
                    }

                    // === STEP 2: PORTFOLIO LIMIT & COOLDOWN CHECK ===
                    const portfolioCheck = canOpenNewPosition(pair);
                    if (!portfolioCheck.allowed) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: false,
                            error: 'Portfolio restriction',
                            reason: portfolioCheck.reason
                        }));
                        console.log(`\ud83d\udea7 [PORTFOLIO BLOCK] ${pair}: ${portfolioCheck.reason}`);
                        return;
                    }

                    // === STEP 3: FETCH CANDLES & CALCULATE ATR ===
                    const candles = await fetchCandlesForATR(pair, 50); // Need 50 candles for ATR-14
                    if (!candles || candles.length < 15) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: false,
                            error: 'Failed to fetch candle data for ATR'
                        }));
                        console.log(`\u274c [ATR ERROR] ${pair}: Insufficient candle data`);
                        return;
                    }

                    const atr = calculateATR(candles, 14);
                    if (atr === 0) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: false,
                            error: 'Invalid ATR calculation'
                        }));
                        console.log(`\u274c [ATR ERROR] ${pair}: ATR = 0`);
                        return;
                    }

                    // === STEP 4: CALCULATE SL/TP BASED ON ATR ===
                    const currentPrice = prices.get(pair);
                    if (!currentPrice) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: false,
                            error: 'Current price not available'
                        }));
                        console.log(`\u274c [PRICE ERROR] ${pair}: No price data`);
                        return;
                    }

                    const slDistance = atr * 1.5; // 1.5x ATR for Stop Loss
                    const tpDistance = atr * 3.0; // 3x ATR for Take Profit (1:2 R/R)

                    const side = signal.toUpperCase(); // BUY or SELL
                    const slPrice = side === 'BUY'
                        ? currentPrice - slDistance
                        : currentPrice + slDistance;
                    const tpPrice = side === 'BUY'
                        ? currentPrice + tpDistance
                        : currentPrice - tpDistance;

                    console.log(`\ud83d\udccf [ATR] ${pair}: ATR=${atr.toFixed(2)}, SL=${slPrice.toFixed(2)}, TP=${tpPrice.toFixed(2)}`);

                    // === STEP 5: CALCULATE POSITION SIZE (INTEGER CONTRACTS) ===
                    await refreshAccountData();
                    const leverage = leverageCache.get(pair) || 1;
                    const balance = accountBalance;

                    const targetRisk = 10; // Fixed $10 risk per trade
                    const riskPerContract = slDistance; // Risk per 1 unit of asset
                    const rawContracts = targetRisk / riskPerContract;

                    // CRITICAL: Round DOWN to integer (no decimals)
                    const contracts = Math.floor(rawContracts);

                    if (contracts < 1) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: false,
                            error: 'Position size too small',
                            reason: `Calculated ${rawContracts.toFixed(4)} contracts - minimum is 1`
                        }));
                        console.log(`\u274c [SIZE ERROR] ${pair}: ${rawContracts.toFixed(4)} contracts < 1`);
                        return;
                    }

                    // Recalculate actual risk with integer contracts
                    const actualRisk = contracts * riskPerContract;
                    const notional = contracts * currentPrice;
                    const marginRequired = notional / leverage;

                    console.log(`\ud83d\udcca [POSITION] ${pair}: ${contracts} contracts (actual risk: $${actualRisk.toFixed(2)})`);

                    // === STEP 6: MARGIN VALIDATION ===
                    if (marginRequired > balance * 0.95) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: false,
                            error: 'Insufficient margin',
                            margin_required: marginRequired.toFixed(2),
                            balance: balance.toFixed(2)
                        }));
                        console.log(`\u274c [MARGIN] ${pair}: Need $${marginRequired.toFixed(2)}, have $${balance.toFixed(2)}`);
                        return;
                    }

                    // Min notional check (Coinbase requirement)
                    if (notional < 10) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: false,
                            error: 'Below minimum notional',
                            notional: notional.toFixed(2)
                        }));
                        console.log(`\u274c [MIN NOTIONAL] ${pair}: $${notional.toFixed(2)} < $10`);
                        return;
                    }

                    // === STEP 7: SEND MARKET ORDER (REAL OR SIMULATED) ===
                    const productId = `${pair}-PERP`;
                    const clientOrderId = `v21-${Date.now()}-${pair}`;
                    let orderId = clientOrderId;
                    let filledPrice = currentPrice;

                    // GHOST SNIPER: Simulate order execution if no API keys
                    if (SIMULATION_MODE) {
                        console.log(`🎮 [SIM MODE] Simulating ${side} order: ${contracts} contracts @ $${currentPrice.toFixed(2)}`);

                        // Virtual order "executed" instantly at current market price
                        orderId = `SIM-${Date.now()}`;
                        filledPrice = currentPrice;

                        // Update virtual balance (deduct margin used)
                        simBalance -= marginRequired;

                        console.log(`💰 [SIM BALANCE] $${simBalance.toFixed(2)} (used $${marginRequired.toFixed(2)} margin)`);
                    } else {
                        // REAL MODE: Send order to Coinbase
                        const orderPayload = {
                            client_order_id: clientOrderId,
                            product_id: productId,
                            side: side,
                            order_configuration: {
                                market_market_fok: {
                                    quote_size: notional.toFixed(2)
                                }
                            },
                            attached_order_configuration: {
                                trigger_bracket_gtc: {
                                    stop_trigger_price: slPrice.toFixed(2),
                                    limit_price_stop: slPrice.toFixed(2),
                                    limit_price_take_profit: tpPrice.toFixed(2)
                                }
                            }
                        };

                        const path = '/orders';
                        const jwt = generateCoinbaseJWT('POST', path);

                        console.log(`📤 [COINBASE] Sending ${side} order: ${contracts} contracts @ $${currentPrice.toFixed(2)}`);

                        const response = await axios.post(
                            `${COINBASE_API_URL}${path}`,
                            orderPayload,
                            {
                                headers: {
                                    'Authorization': `Bearer ${jwt}`,
                                    'Content-Type': 'application/json'
                                },
                                timeout: 10000
                            }
                        );

                        // Extract real order ID
                        orderId = response.data.success_response?.order_id || response.data.order_id || 'UNKNOWN';
                        filledPrice = parseFloat(response.data.success_response?.average_filled_price || currentPrice);
                    }

                    // === STEP 8: TRACK POSITION ===
                    const position: ActivePosition = {
                        pair,
                        orderId,
                        side: side as 'BUY' | 'SELL',
                        entryPrice: filledPrice,
                        contracts,
                        timestamp: Date.now(),
                        slPrice: parseFloat(slPrice.toFixed(2)),
                        tpPrice: parseFloat(tpPrice.toFixed(2)),
                        isSimulated: SIMULATION_MODE,
                        unrealizedPnl: 0
                    };

                    if (SIMULATION_MODE) {
                        virtualPositions.push(position);
                    } else {
                        activePositions.push(position);
                    }

                    recordTrade(pair, side as 'BUY' | 'SELL'); // Sniper Mode: Track for two-chances rule

                    // === SUCCESS RESPONSE ===
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        order_id: orderId,
                        pair: pair,
                        side: side,
                        contracts: contracts,
                        entry_price: filledPrice,
                        sl_price: parseFloat(slPrice.toFixed(2)),
                        tp_price: parseFloat(tpPrice.toFixed(2)),
                        atr: parseFloat(atr.toFixed(2)),
                        actual_risk: parseFloat(actualRisk.toFixed(2)),
                        margin_used: parseFloat(marginRequired.toFixed(2)),
                        leverage: leverage,
                        mode: SIMULATION_MODE ? 'SIMULATION' : 'LIVE', // Ghost Sniper indicator
                        sim_balance: SIMULATION_MODE ? simBalance.toFixed(2) : undefined
                    }));

                    const modeTag = SIMULATION_MODE ? '🎮 [SIM]' : '💵 [LIVE]';
                    console.log(`✅ [V21 SUCCESS] ${modeTag} ${side} ${pair} - Order: ${orderId}, Entry: ${filledPrice.toFixed(2)}, Risk: $${actualRisk.toFixed(2)}`);
                } catch (error: any) {
                    console.error('\u274c [V21 EXECUTION ERROR]:', error.response?.data || error.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: 'Order execution failed',
                        details: error.response?.data || error.message
                    }));
                }
            });
            return;
        }

        // 6. POSITIONS LIST (V21 - PORTFOLIO MANAGEMENT)
        if (req.method === 'GET' && parsedUrl.pathname === '/positions') {
            try {
                await refreshAccountData();

                const totalMarginUsed = activePositions.reduce((sum, pos) => {
                    const positionValue = pos.contracts * pos.entryPrice;
                    const leverage = leverageCache.get(pos.pair) || 1;
                    return sum + (positionValue / leverage);
                }, 0);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    active_positions: activePositions.length,
                    max_positions: MAX_POSITIONS,
                    positions: activePositions,
                    total_margin_used: parseFloat(totalMarginUsed.toFixed(2)),
                    available_balance: parseFloat(accountBalance.toFixed(2)),
                    available_margin: parseFloat((accountBalance - totalMarginUsed).toFixed(2))
                }));

                console.log(`[POSITIONS] ${activePositions.length}/${MAX_POSITIONS} active, margin used: $${totalMarginUsed.toFixed(2)}`);
            } catch (error: any) {
                console.error('[POSITIONS ERROR]:', error.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to fetch positions', details: error.message }));
            }
            return;
        }

        // 7. CLOSE POSITION (V21 - MANUAL POSITION MANAGEMENT)
        if (req.method === 'POST' && parsedUrl.pathname === '/close-position') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const { order_id, hit_sl } = data;

                    if (!order_id) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing order_id' }));
                        return;
                    }

                    const pos = activePositions.find(p => p.orderId === order_id);
                    if (!pos) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Position not found' }));
                        return;
                    }

                    removePosition(order_id, hit_sl === true);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: `Position ${pos.pair} closed`,
                        cooldown_active: hit_sl ? '3 hours' : 'none'
                    }));
                } catch (error: any) {
                    console.error('[CLOSE POSITION ERROR]:', error.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to close position', details: error.message }));
                }
            });
            return;
        }

        // 8. FEAR AND GREED PROXY (NEW)
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

        // 9. NEWS RSS PROXY
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

        // 10. MACRO CALENDAR (KEYLESS - FOREXFACTORY)
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
                        (data.trend && data.trend.includes("TEST")) ||
                        (data.trend_direction && data.trend_direction.includes("TEST"));

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

                    // FIX: Reverting to Gemini 2.0 Flash (User's account supports this)
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

        // HEALTH CHECK ENDPOINT
        if (req.method === 'GET' && parsedUrl.pathname === '/health') {
            const now = Date.now();
            const wsAge = now - lastWsUpdate;
            const wsStatus = wsConnected && wsAge < 60000 ? 'Connected' : 'Disconnected';

            const modeStatus = SIMULATION_MODE ? 'SIMULATION' : 'LIVE';
            const positionsCount = SIMULATION_MODE ? virtualPositions.length : activePositions.length;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'Online',
                message: '🎯 Oracle watching markets',
                mode: modeStatus,
                websocket: wsStatus,
                last_update: Math.floor(wsAge / 1000) + 's ago',
                active_positions: positionsCount,
                max_positions: MAX_POSITIONS,
                virtual_balance: SIMULATION_MODE ? simBalance.toFixed(2) : undefined,
                uptime: process.uptime() + 's'
            }));
            return;
        }


        res.writeHead(200);
        res.end("Futures Oracle Running (V12 - Autonomous). Endpoints: GET /price, /market-context");
    });

    server.listen(PORT, () => {
        const modeTag = SIMULATION_MODE ? '🎮 [SIMULATION]' : '💵 [LIVE]';
        console.log(`✅ [FUTURES ORACLE] ${modeTag} Captain's Log active on port ${PORT}`);
        console.log(`🎯 Oracle watching markets - Ready for signals`);
    });
}



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
