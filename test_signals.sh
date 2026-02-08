#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
d='\033[0m'

echo -e "${YELLOW}=================================================${d}"
echo -e "         ${YELLOW}FUTURES ORACLE TEST SUITE${d}"
echo -e "${YELLOW}=================================================${d}"
echo ""
echo "Select Test Mode:"
echo "1. 🟣 Trigger N8N Workflow (Simulate Scanner Signal)"
echo "   - Checks if N8N receives the signal."
echo "   - Runs full analysis (Candles -> Gemini -> Risk)."
echo "   - NOTE: Might NOT result in a trade if Gemini says 'WAIT'."
echo ""
echo "2. 🚀 Force Oracle Execution (Simulate BUY Signal)"
echo "   - Bypasses N8N analysis."
echo "   - Forces Oracle to process a 'BUY' signal."
echo "   - Checks Telegram connection immediately."
echo ""
read -p "Enter choice (1 or 2): " choice

# Define Pairs
PAIRS=("DOGE" "ETH" "SOL" "SUI" "XRP")

if [ "$choice" == "1" ]; then
    echo ""
    echo -e "${YELLOW}🟣 Triggering N8N Workflows...${d}"
    for coin in "${PAIRS[@]}"; do
        echo -e "  - Sending Webhook for ${GREEN}${coin}${d}..."
        # N8N Webhook (Port 5678)
        # URL pattern: http://localhost:5678/webhook/futurec-trigger-{coin_lower}
        coin_lower=$(echo "$coin" | tr '[:upper:]' '[:lower:]')
        url="http://localhost:5678/webhook/futurec-trigger-${coin_lower}"
        
        # Payload mimicking Momentum Scanner
        response=$(curl -s -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "{\"pair\":\"${coin}-USD\", \"direction\":\"LONG\", \"price\":100, \"action\":\"TEST_SIGNAL\"}")
            
        if [ $? -eq 0 ]; then
             echo -e "    ✅ Sent"
        else
             echo -e "    ❌ Failed"
        fi
        sleep 1
    done
    echo ""
    echo "Done. Check N8N UI for execution details."

elif [ "$choice" == "2" ]; then
    echo ""
    echo -e "${YELLOW}🚀 Forcing Oracle Execution (Telegram Check)...${d}"
    for coin in "${PAIRS[@]}"; do
        echo -e "  - Forcing BUY on ${GREEN}${coin}${d}..."
        # Oracle API (Port 3001)
        url="http://localhost:3001/execute-order"
        
        # Valid payload for Oracle
        response=$(curl -s -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "{\"pair\":\"${coin}-USD\", \"signal\":\"BUY\", \"confidence\":\"TEST-100\", \"report_to_telegram\": true}")
            
        echo -e "    ✅ Signal Sent. Check Telegram!"
        sleep 2
    done
    echo ""
    echo "Done. All mock signals sent to Oracle."

else
    echo "Invalid choice."
fi
