#!/bin/bash

echo "=========================================="
echo "🚀 INITIATING 100% RELIABLE TEST MODE"
echo "=========================================="

echo "[1/6] Stopping all Node processes (Cleaning Port 3001)..."
killall node || true

echo "[2/6] Deep Cleaning Docker (Removing 'zombie' containers)..."
docker stop futures-oracle 2>/dev/null
docker rm -f futures-oracle 2>/dev/null
docker-compose rm -f -s -v

echo "[3/6] Pulling Latest Updates (Git)..."
git pull

echo "[4/6] Launching REAL BOT in Background (Port 3001)..."
# This launches the real Docker container, which now has the 'Trojan Horse' fix.
docker-compose up -d --build --force-recreate

echo "[5/6] Waiting 20 seconds for Oracle to initialize..."
sleep 20

# Check if it's alive
if docker ps | grep -q futures-oracle; then
    echo "✅ Oracle is Online."
else
    echo "❌ Oracle failed to start. Checking logs..."
    docker logs futures-oracle
    exit 1
fi

echo "[6/6] FIRING TEST SIGNALS (Trojan Horse Mode)..."
# We execute the trigger INSIDE the container to bypass network issues
docker exec -it futures-oracle node manual_trigger.js

echo "=========================================="
echo "🏁 TEST COMPLETE."
echo "Check your Telegram for 6 messages!"
echo "=========================================="
