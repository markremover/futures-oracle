#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

clear
echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}       🚀 ANTIGRAVITY COMMAND CENTER 🚀       ${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""

# 1. CHECK MOMENTUM SNIPER
echo -e "${YELLOW}[ Checking Momentum Sniper... ]${NC}"
if docker ps | grep -q "momentum-brain"; then
    echo -e "${GREEN}✅ ACTIVE${NC} (Container: momentum-brain)"
else
    echo -e "${RED}❌ OFFLINE${NC} (Check Momentum Sniper folder)"
fi
echo ""

# 2. CHECK FUTURES ORACLE
echo -e "${YELLOW}[ Checking Futures Oracle... ]${NC}"
if docker ps | grep -q "futures-oracle"; then
    echo -e "${GREEN}✅ ACTIVE${NC} (Container: futures-oracle)"
    echo -e "   Status: $(docker ps --filter "name=futures-oracle" --format "{{.Status}}")"
    echo -e "   ${BLUE}Recent Logs:${NC}" 
    docker logs --tail 3 futures-oracle | sed 's/^/   / '
else
    echo -e "${RED}❌ OFFLINE${NC}"
fi

echo ""
echo -e "${BLUE}=================================================${NC}"
echo -e "💡 To update Oracle:  git pull && docker-compose up -d --build"
echo -e "💡 To view full logs: docker logs -f futures-oracle"
echo -e "${BLUE}=================================================${NC}"
