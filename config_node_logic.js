// =====================================================
// ORACLE FUTURES V28.0 - MASTER WORKFLOW CONFIG NODE
// =====================================================
// Purpose: Inject coin-specific parameters based on incoming 'pair'
// Location: Place AFTER Webhook node, BEFORE all other nodes
// =====================================================

// Extract pair from Webhook
const webhookData = $('Webhook').first().json;
const rawPair = webhookData.pair || 'ETH-PERP'; // Fallback default
const source = webhookData.source || 'LIVE';

// Normalize pair (handle both ETH-USD and ETH-PERP formats)
let pair = rawPair.toUpperCase();
if (!pair.endsWith('-PERP') && !pair.endsWith('-USD')) {
    pair = pair + '-PERP'; // Default to PERP if no suffix
}

// Extract coin symbol (ETH, XRP, SOL, etc.)
const coinSymbol = pair.split('-')[0];

// =====================================================
// COIN-SPECIFIC CONFIGURATION
// =====================================================
// Adjust these parameters per coin based on volatility and market behavior

const coinConfig = {
    'ETH': {
        atr_multiplier_sl: 1.5,      // Stop Loss: 1.5x ATR
        atr_multiplier_tp: 3.0,      // Take Profit: 3x ATR (1:2 R/R)
        risk_per_trade: 10,          // Dollar risk per trade
        volatility_threshold: 0.8,   // Price change % threshold for impulse
        rsi_neutral_min: 48,
        rsi_neutral_max: 52,
        confidence_threshold: 74     // Minimum AI confidence to execute
    },
    'SOL': {
        atr_multiplier_sl: 1.5,
        atr_multiplier_tp: 3.0,
        risk_per_trade: 10,
        volatility_threshold: 0.8,
        rsi_neutral_min: 48,
        rsi_neutral_max: 52,
        confidence_threshold: 74
    },
    'XRP': {
        atr_multiplier_sl: 1.5,
        atr_multiplier_tp: 3.0,
        risk_per_trade: 10,
        volatility_threshold: 0.8,
        rsi_neutral_min: 48,
        rsi_neutral_max: 52,
        confidence_threshold: 74
    },
    'DOGE': {
        atr_multiplier_sl: 1.8,      // Wider SL for meme coin volatility
        atr_multiplier_tp: 3.5,      // Wider TP target
        risk_per_trade: 10,
        volatility_threshold: 1.2,   // Higher threshold (more volatile)
        rsi_neutral_min: 48,
        rsi_neutral_max: 52,
        confidence_threshold: 76     // Stricter confidence for DOGE
    },
    'SUI': {
        atr_multiplier_sl: 1.8,
        atr_multiplier_tp: 3.5,
        risk_per_trade: 10,
        volatility_threshold: 1.2,   // Higher threshold (more volatile)
        rsi_neutral_min: 48,
        rsi_neutral_max: 52,
        confidence_threshold: 76
    },
    'BTC': {
        atr_multiplier_sl: 1.5,
        atr_multiplier_tp: 3.0,
        risk_per_trade: 10,
        volatility_threshold: 0.6,   // Lower threshold (less volatile)
        rsi_neutral_min: 48,
        rsi_neutral_max: 52,
        confidence_threshold: 72
    }
};

// Get config for this coin (or use default ETH config)
const config = coinConfig[coinSymbol] || coinConfig['ETH'];

// =====================================================
// OUTPUT: Merged Data
// =====================================================
// Pass through original webhook data + injected config + normalized pair

return {
    json: {
        // Original webhook data
        ...webhookData,

        // Normalized pair information
        pair: pair,                    // e.g., "ETH-PERP"
        coin_symbol: coinSymbol,       // e.g., "ETH"
        source: source,                // e.g., "LIVE" or "TEST"

        // Coin-specific parameters
        atr_multiplier_sl: config.atr_multiplier_sl,
        atr_multiplier_tp: config.atr_multiplier_tp,
        risk_per_trade: config.risk_per_trade,
        volatility_threshold: config.volatility_threshold,
        rsi_neutral_min: config.rsi_neutral_min,
        rsi_neutral_max: config.rsi_neutral_max,
        confidence_threshold: config.confidence_threshold,

        // Metadata
        config_version: 'V28.0',
        timestamp: Date.now()
    }
};
