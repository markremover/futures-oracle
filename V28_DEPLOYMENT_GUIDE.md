# Oracle Futures Master V28.0 - Deployment Guide

## Overview

**V28.0** introduces the **Master Workflow Architecture** - ONE universal workflow that handles ALL coins (ETH, SOL, XRP, DOGE, SUI, BTC) with dynamic configuration.

## Key Features

✅ **Zero Hardcoded Values** - All pair references use dynamic variables  
✅ **Coin-Specific Configuration** - Config node injects parameters per coin  
✅ **Filtered News API** - Backend returns only coin-specific news (no generic Bitcoin)  
✅ **RSI Safety Guard** - Prevents crash trades (RSI<25 + BUY blocked)  
✅ **Dynamic Confidence Thresholds** - Volatile coins (DOGE, SUI) require higher confidence  

---

## Architecture

### Workflow Flow

```
Webhook → Config → Candles → Price → ATR/RSI → F&G → News → Macro → Market → AI → Parser → Risk Filter → Execute → Telegram
```

### Config Node Logic

The **Config** node (Code node) injects coin-specific parameters:

| Coin | SL Multiplier | TP Multiplier | Volatility Threshold | Confidence Required |
|------|---------------|---------------|---------------------|---------------------|
| ETH  | 1.5x ATR      | 3.0x ATR      | 0.8%                | 74%                 |
| SOL  | 1.5x ATR      | 3.0x ATR      | 0.8%                | 74%                 |
| XRP  | 1.5x ATR      | 3.0x ATR      | 0.8%                | 74%                 |
| DOGE | 1.8x ATR      | 3.5x ATR      | 1.2%                | 76%                 |
| SUI  | 1.8x ATR      | 3.5x ATR      | 1.2%                | 76%                 |
| BTC  | 1.5x ATR      | 3.0x ATR      | 0.6%                | 72%                 |

**Why different configs?**
- **DOGE/SUI**: More volatile → wider stops, higher confidence needed
- **BTC**: Less volatile → tighter threshold, lower confidence OK
- **ETH/SOL/XRP**: Balanced majors → standard settings

---

## Deployment Instructions

### Step 1: Update Backend Server (Google Cloud Terminal)

```bash
# Navigate to project directory
cd /path/to/futures-oracle

# Run deployment script
chmod +x deploy_v28.sh
./deploy_v28.sh
```

**OR manual deployment:**

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Restart Oracle server
pkill -f "ts-node.*oracle"
nohup npx ts-node oracle.ts > oracle.log 2>&1 &

# Verify health
curl http://172.17.0.1:3001/health
```

### Step 2: Import Master Workflow to n8n

1. Open n8n web interface: `http://your-n8n-url:5678`
2. Click **"Workflows"** → **"Import from File"**
3. Upload `Oracle_Futures_Master_V28.0.json`
4. **Activate** the workflow
5. **Webhook URL**: `http://172.17.0.1:5678/webhook/futurec-master`

### Step 3: Configure Webhook Triggers

You now have **ONE webhook endpoint** for all coins. The workflow determines behavior based on the `pair` parameter:

**Trigger Examples:**

```bash
# Trade XRP
curl -X POST http://172.17.0.1:5678/webhook/futurec-master \
  -H "Content-Type: application/json" \
  -d '{"pair":"XRP-PERP","source":"LIVE"}'

# Trade ETH
curl -X POST http://172.17.0.1:5678/webhook/futurec-master \
  -H "Content-Type: application/json" \
  -d '{"pair":"ETH-PERP","source":"LIVE"}'

# Test Mode (bypasses AI, returns 100% confidence BUY)
curl -X POST http://172.17.0.1:5678/webhook/futurec-master \
  -H "Content-Type: application/json" \
  -d '{"pair":"SOL-PERP","source":"TEST"}'
```

---

## Testing & Verification

### Test 1: News API Filtering

**Objective**: Verify coin-specific news (no generic Bitcoin)

```bash
# Test XRP news (should return Ripple/XRP articles only)
curl "http://172.17.0.1:3001/news?query=XRP"

# Test ETH news (should return Ethereum articles only)
curl "http://172.17.0.1:3001/news?query=ETH"
```

**Expected Output**: RSS feed with XML comment showing filter count:
```xml
<!-- Oracle V27.2 News Filter: XRP (3/45) -->
```

If count is `0/45`, backend is working but no XRP news currently available (correct behavior - no generic Bitcoin shown).

### Test 2: Config Node Parameters

**Objective**: Verify coin-specific config injection

1. Open Master Workflow in n8n
2. Click **"Execute Workflow"** (test button)
3. In Webhook test data, enter:
   ```json
   {
     "pair": "DOGE-PERP",
     "source": "TEST"
   }
   ```
4. Execute and inspect **Config node output**

**Expected Output:**
```json
{
  "pair": "DOGE-PERP",
  "coin_symbol": "DOGE",
  "atr_multiplier_sl": 1.8,
  "atr_multiplier_tp": 3.5,
  "volatility_threshold": 1.2,
  "confidence_threshold": 76
}
```

### Test 3: RSI Safety Guard

**Objective**: Verify crash protection logic

1. In **Code/Function (ATR/RSI Filter)** node output, manually set:
   ```json
   {
     "rsi_value": 20
   }
   ```
2. In **Parser** node output, set:
   ```json
   {
     "final_signal": "BUY",
     "confidence_score": 80
   }
   ```
3. Execute **Risk Filter** node

**Expected Behavior**: Signal BLOCKED (RSI 20 + BUY = catching falling knife)

**Correct Cases:**
- ✅ RSI 20 + SELL → ALLOWED (shorting crash)
- ✅ RSI 80 + BUY → ALLOWED (buying strength)
- ❌ RSI 20 + BUY → BLOCKED (crash trap)
- ❌ RSI 80 + SELL → BLOCKED (strength trap)

---

## Migration from V27.1

### Option 1: Clean Migration (Recommended)

1. **Deactivate** all old workflows (ETH V27.1, SOL V27.1, etc.)
2. Import and activate **Master V28.0**
3. **Update external triggers** to point to new webhook: `/webhook/futurec-master`
4. Test with one coin first, then deploy for all

### Option 2: Parallel Testing

1. Keep V27.1 workflows active
2. Import V28.0 as separate workflow
3. Send test signals to both endpoints
4. Compare results
5. Once validated, deactivate V27.1

---

## Troubleshooting

### Issue: "News node returns empty"

**Diagnosis**: Backend filtering is working correctly - no news for that coin currently available.

**Verification**:
```bash
curl "http://172.17.0.1:3001/news?query=XRP" | grep "Oracle V27.2"
```

Check the comment for `(X/Y)` where X = filtered news, Y = total news. If `X=0`, no XRP news exists (expected).

### Issue: "Config node shows wrong parameters"

**Diagnosis**: Pair normalization failed or unsupported coin.

**Fix**: Ensure webhook sends valid pair format:
- ✅ `"pair": "ETH-PERP"`
- ✅ `"pair": "ETH-USD"`
- ✅ `"pair": "ETH"` (auto-appends -PERP)
- ❌ `"pair": "eth"` (case matters in old versions - use uppercase)

### Issue: "Execute Order fails"

**Diagnosis**: Oracle backend not running or pair mismatch.

**Check Oracle Health**:
```bash
curl http://172.17.0.1:3001/health
```

**Check Oracle Logs**:
```bash
tail -f /path/to/futures-oracle/oracle.log
```

### Issue: "Telegram not sending reports"

**Diagnosis**: Telegram credentials not set in workflow.

**Fix**:
1. Open Master Workflow in n8n
2. Click **Telegram (Report)** node
3. Set credentials ID: `2HnE4TLrYpz4Yd6o` (or your Telegram credentials)
4. Verify chat ID: `-5238546812`

---

## Advanced Configuration

### Adding New Coins

Edit **Config** node in Master Workflow:

```javascript
const coinConfig = {
    // ... existing coins ...
    'AVAX': {
        atr_multiplier_sl: 1.5,
        atr_multiplier_tp: 3.0,
        risk_per_trade: 10,
        volatility_threshold: 0.9,
        rsi_neutral_min: 48,
        rsi_neutral_max: 52,
        confidence_threshold: 75
    }
};
```

### Adjusting Risk Per Trade

Change `risk_per_trade` in Config node (default: $10 per trade).

**Warning**: Higher risk = larger positions = more margin used. Ensure sufficient balance.

### Tuning Confidence Thresholds

- **Lower threshold (60-70%)**: More trades, higher risk
- **Higher threshold (80-90%)**: Fewer trades, safer
- **Default (74%)**: Balanced approach

---

## Monitoring & Logs

### Oracle Server Logs

```bash
# Real-time monitoring
tail -f oracle.log

# Last 50 lines
tail -50 oracle.log

# Search for specific pair
grep "XRP" oracle.log
```

### n8n Execution Logs

1. Open n8n web interface
2. Go to **"Executions"** tab
3. Filter by workflow: "Oracle Futures Master V28.0"
4. Click execution to see detailed logs per node

---

## Support & Debugging

### Enable Debug Logs (Backend)

Uncomment debug lines in `oracle.ts`:

**Lines 1386, 1402, 1409, 1419, 1423**: Remove `//` before `console.log`

Restart server:
```bash
pkill -f "ts-node.*oracle"
nohup npx ts-node oracle.ts > oracle.log 2>&1 &
```

### Enable Debug Logs (n8n)

Set environment variable in `docker-compose.yml`:

```yaml
environment:
  - N8N_LOG_LEVEL=debug
```

Restart n8n:
```bash
docker-compose restart
```

---

## Version History

- **V28.0** (Feb 2026): Master Workflow with dynamic config
- **V27.1** (Jan 2026): Individual workflows per coin
- **V27.0** (Jan 2026): News filtering added

---

## Next Steps

1. ✅ Deploy backend (run `deploy_v28.sh`)
2. ✅ Import Master Workflow to n8n
3. ✅ Test with XRP using test mode
4. ✅ Monitor first live trade
5. ✅ Gradually roll out to all coins

---

**Questions or Issues?** Check `oracle.log` first, then review n8n execution history.
