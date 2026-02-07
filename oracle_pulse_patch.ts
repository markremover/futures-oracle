
// --- MARKET PULSE (VISIBILITY LOOP) ---
function logMarketPulse() {
    if (!wsConnected || prices.size === 0) return;

    // Header removed to fit all 5 pairs in dashboard (tail -5)
    // console.log(`\n💓 [ORACLE PULSE] Tracking ${prices.size} Pairs | Stock Sentiment: ${stockCache?.sentiment || 'NEUTRAL'}`);

    TARGET_PAIRS.forEach(pair => {
        const currentPrice = prices.get(pair) || 0;
        monitor.logPairStatus(pair, currentPrice);
    });
    // console.log('--------------------------------------------------');
}
