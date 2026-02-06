#!/bin/bash
# Futures Oracle V22.6 - Direct Launch (No Docker)
# This runs oracle.ts directly via ts-node, showing logs in terminal like Momentum Sniper

echo "🚀 Starting Futures Oracle V22.6 (Direct Mode)..."
echo "📊 Logs will be visible in this terminal."
echo ""

# Ensure we're in the right directory
cd ~/futures-oracle

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run oracle.ts directly with ts-node
npx ts-node oracle.ts
