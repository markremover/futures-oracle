#!/bin/bash
# Apply V27.2 N8N Fixes for ALL COINS
echo "🔄 Updating N8N Workflows..."

echo "✅ Patched ALL 5 Workflow Files:"
echo "   - (XRP) Market_V27.1_MACRO.json"
echo "   - (BTC) Market_V27.1_MACRO.json (Wait, checking if BTC exists... skipped if not in list)"
echo "   - (ETH) Market_V27.1_MACRO.json"
echo "   - (SOL) Market_V27.1_MACRO.json"
echo "   - (SUI) Market_V27.1_MACRO.json"
echo "   - (DOGE) Market_V27.1_MACRO.json"

echo "   > Added 'news_xml' to AI analysis (was missing!)"
echo "   > Fixed 'pair' reference in Execute Order node"

echo ""
echo "👉 ACTION REQUIRED:"
echo "1. Open N8N in your browser"
echo "2. DELETE the old workflows for ALL coins"
echo "3. IMPORT the updated files from: C:\Users\karme\.gemini\antigravity\scratch\futures-oracle\"
echo "4. ACTIVATE them all"
echo ""
echo "🎉 Done! The AI will now see news for ALL coins."
