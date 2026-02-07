#!/bin/bash
# Quick deploy script for Ghost Sniper Oracle fix

echo "🔧 Rebuilding Oracle with MA(200) non-blocking fix..."

cd ~/futures-oracle

# Stop current container
docker stop futures-oracle

# Rebuild with new code
docker compose up -d --build

echo "✅ Oracle restarted!"
echo "📊 Checking status..."
sleep 3
docker logs futures-oracle --tail 20
