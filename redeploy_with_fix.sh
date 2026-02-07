#!/bin/bash
# Quick redeploy after N8N URL fix

echo "🔧 Rebuilding Oracle with N8N connection fix..."

cd ~/futures-oracle

# Stop
docker stop futures-oracle

# Rebuild  
docker compose up -d --build

echo "⏳ Waiting for Oracle to start..."
sleep 5

echo ""
echo "✅ Oracle restarted!"
echo ""
echo "📊 Health Check:"
curl -s http://localhost:3001/health | jq '.'

echo ""
echo "📋 Recent Logs:"
docker logs futures-oracle --tail 30

echo ""
echo "🔍 WebSocket Status:"
docker logs futures-oracle --tail 100 | grep -i "websocket\|n8n\|trigger"
