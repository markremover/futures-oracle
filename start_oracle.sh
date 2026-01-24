#!/bin/bash

# Visual Header
echo "================================================="
echo "🔌 SWITCHING TO PRODUCTION MODE (REAL ORACLE)"
echo "================================================="

# 1. Kill Simulator Processes (fake_oracle.js)
echo "[1/3] Stopping Simulator..."
killall node 2>/dev/null
pkill -f fake_oracle.js
echo "      (Simulator Stopped)"

# 2. Stop any zombie Docker containers
echo "[2/3] Cleaning Docker State..."
docker stop futures-oracle 2>/dev/null
docker rm futures-oracle 2>/dev/null

# 3. Start Real Oracle
echo "[3/3] Launching Real Oracle..."
docker-compose up -d --build --force-recreate

# 4. Wait & Verify
echo "⏳ Waiting 10s for Oracle to wake up..."
sleep 10

if docker ps | grep -q "futures-oracle"; then
    echo "✅ REAL BOT IS ONLINE!"
    echo "   Use 'bash dashboard.sh' to monitor status."
else
    echo "❌ Failed to start. Check 'docker logs futures-oracle'"
fi
