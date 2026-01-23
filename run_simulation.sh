#!/bin/bash

echo "=========================================="
echo "🎭 STARTING SIMULATION MODE (100% PASS)"
echo "=========================================="

# 1. Kill old processes
echo "[1/3] Clearing ports..."
killall node || true
docker stop futures-oracle 2>/dev/null

# 2. Pull latest fake_oracle (with Finnhub fix)
echo "[2/3] Updating Simulation Core..."
git pull

# 3. Run the "One-Terminal" Simulation
echo "[3/3] Launching Simulator..."
echo "      (This will mimic the Oracle and force a BUY signal)"
node fake_oracle.js
