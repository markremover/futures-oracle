#!/bin/bash
# FIX TRADE DEBUG DEPLOYMENT

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

echo "🔍 TAILING LOGS TO WATCH FOR TRADE REQUESTS..."
echo "Do NOT close this window. Trigger the N8N workflow again."
echo "--------------------------------------------------------"
docker logs -f futures-oracle
