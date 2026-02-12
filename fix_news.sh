#!/bin/bash
# FIX NEWS NODE DEPLOYMENT V2

echo "🔄 Pulling latest code..."
git pull

# Verify file content
echo "🔍 Checking for V27.2 update in oracle.ts..."
if grep -q "V27.2" oracle.ts; then
    echo "✅ oracle.ts is UPDATED (Found V27.2)"
else
    echo "❌ oracle.ts is OUTDATED! Git pull failed?"
    exit 1
fi

echo "🛑 Stopping Oracle..."
if command -v docker-compose &> /dev/null; then
    docker-compose down
else
    docker compose down
fi

echo "🏗️ Rebuilding Oracle..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d --build oracle
else
    docker compose up -d --build oracle
fi

echo "⏳ Waiting 10s for startup..."
sleep 10

echo "🧪 TESTING NEWS ENDPOINT (XRP)..."
response=$(curl -s -i "http://localhost:3001/news?query=XRP")

echo "📜 RAW RESPONSE HEADER:"
echo "$response" | grep "X-Oracle-Version"

echo "📜 CHECKING FOR FILTERED CONTENT:"
# Check if body contains "Oracle V27.2" which we added as a comment
if echo "$response" | grep -q "Oracle V27.2"; then
    echo "✅ SERVER IS RUNNING V27.2 CODE!"
else
    echo "❌ SERVER IS RUNNING OLD CODE (Missing signature)"
fi

echo ""
echo "📝 ORACLE LOGS (Last 20 lines):"
docker logs futures-oracle --tail 20
