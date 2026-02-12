#!/bin/bash
# FIX NEWS NODE DEPLOYMENT

echo "🔄 Pulling latest code..."
git pull

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
response=$(curl -s "http://localhost:3001/news?query=XRP")

if [[ $response == *"RIPPLE"* ]] || [[ $response == *"XRP"* ]]; then
    echo "✅ SUCCESS! News filtering is WORKING."
    echo "Found 'XRP' or 'RIPPLE' in response."
else
    echo "⚠️ WARNING: News filtering might not be working or no XRP news found."
    echo "Response preview:"
    echo "$response" | head -n 10
fi
