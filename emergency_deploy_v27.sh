#!/bin/bash
# V27.1 EMERGENCY DEPLOY & TEST

echo "================================================"
echo "V27.1: DEPLOYING NEWS FILTERING FIX"
echo "================================================"

cd ~/futures-oracle || exit 1

echo ""
echo "1. Pulling latest code from GitHub..."
git pull

echo ""
echo "2. Rebuilding Oracle container..."
docker-compose build oracle

echo ""
echo "3. Restarting Oracle..."
docker-compose up -d oracle

echo ""
echo "4. Waiting 5 seconds for Oracle to start..."
sleep 5

echo ""
echo "5. Testing /news endpoint with XRP query..."
echo "-----------------------------------------------"
curl -s "http://localhost:3001/news?query=XRP" | grep -o "<title>.*</title>" | head -5

echo ""
echo ""
echo "6. Checking Oracle logs for filtering..."
echo "-----------------------------------------------"
docker logs futures-oracle --tail 10

echo ""
echo "================================================"
echo "DEPLOY COMPLETE - Check if news contains 'XRP' or 'RIPPLE'"
echo "================================================"
