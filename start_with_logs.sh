#!/bin/bash
# Futures Oracle - Start with visible logs (like Momentum Sniper)

echo "🚀 Starting Futures Oracle with visible logs..."

# Stop existing containers
docker-compose down

# Start in foreground (logs will be visible)
docker-compose up
