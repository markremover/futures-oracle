#!/bin/bash
# =====================================================
# ORACLE FUTURES V28.0 - DEPLOYMENT SCRIPT
# =====================================================
# Purpose: Deploy Master Workflow and restart Oracle server
# Usage: ./deploy_v28.sh
# =====================================================

echo "=========================================="
echo "  ORACLE FUTURES V28.0 DEPLOYMENT"
echo "=========================================="
echo ""

# Step 1: Pull Latest Changes
echo "[1/5] Pulling latest changes from GitHub..."
git pull origin main

if [ $? -ne 0 ]; then
    echo "ERROR: Git pull failed. Aborting deployment."
    exit 1
fi

echo "SUCCESS: Code updated from GitHub"
echo ""

# Step 2: Install Dependencies
echo "[2/5] Installing dependencies..."
npm install

echo "SUCCESS: Dependencies installed"
echo ""

# Step 3: Stop Current Oracle Server
echo "[3/5] Stopping current Oracle server..."
pkill -f "node.*oracle" || true
pkill -f "ts-node.*oracle" || true
sleep 2

echo "SUCCESS: Oracle server stopped"
echo ""

# Step 4: Start Oracle Server
echo "[4/5] Starting Oracle server..."
nohup npx ts-node oracle.ts > oracle.log 2>&1 &

sleep 3

# Get PID
ORACLE_PID=$(pgrep -f "ts-node.*oracle")

if [ -z "$ORACLE_PID" ]; then
    echo "ERROR: Oracle server failed to start. Check oracle.log"
    tail -20 oracle.log
    exit 1
fi

echo "SUCCESS: Oracle server started (PID: $ORACLE_PID)"
echo ""

# Step 5: Health Check
echo "[5/5] Running health check..."
sleep 2

HEALTH_CHECK=$(curl -s http://172.17.0.1:3001/health)

if [ $? -eq 0 ]; then
    echo "SUCCESS: Health check passed"
    echo "$HEALTH_CHECK" | jq .
else
    echo "WARNING: Health check failed (server may still be starting)"
fi

echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Import Oracle_Futures_Master_V28.0.json into n8n"
echo "2. Test with: curl -X POST http://172.17.0.1:5678/webhook/futurec-master -H 'Content-Type: application/json' -d '{\"pair\":\"XRP-PERP\",\"source\":\"TEST\"}'"
echo "3. Monitor logs: tail -f oracle.log"
echo ""
