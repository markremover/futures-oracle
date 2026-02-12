#!/bin/bash
echo "🧪 TESTING /execute-order ENDPOINT..."

# 1. Test with Valid Data (Simulation Mode should handle this safely)
echo "----------------------------------------"
echo "👉 Sending MOCK BUY Signal for XRP-PERP..."
curl -X POST http://localhost:3001/execute-order \
     -H "Content-Type: application/json" \
     -d '{"pair": "XRP-PERP", "signal": "BUY", "confidence": 88}'

echo ""
echo "----------------------------------------"
echo "👉 Sending MOCK SELL Signal for BTC-PERP..."
curl -X POST http://localhost:3001/execute-order \
     -H "Content-Type: application/json" \
     -d '{"pair": "BTC-PERP", "signal": "SELL", "confidence": 92}'

echo ""
echo "----------------------------------------"
echo "✅ If you see JSON responses above, the Server is OK."
echo "❌ If you see 'Connection refused' or errors, the Server is BROKEN."
echo "📜 Check the Oracle logs window for details!"
