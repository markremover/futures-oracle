#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

clear
echo "════════════════════════════════════════════"
echo "   FUTURES ORACLE - SYSTEM STATUS"
echo "════════════════════════════════════════════"
echo ""

# 1. ORACLE CONTAINER
echo -e "${BLUE}[1/6] Oracle Container...${NC}"
if docker ps --filter "name=futures-oracle" --format "{{.Status}}" | grep -q "Up"; then
    UPTIME=$(docker ps --filter "name=futures-oracle" --format "{{.Status}}")
    echo -e "  ${GREEN}✅ ACTIVE${NC} ($UPTIME)"
else
    echo -e "  ${RED}❌ STOPPED${NC}"
fi
echo ""

# 2. WEBSOCKET
echo -e "${BLUE}[2/6] WebSocket (Market Data)...${NC}"
WS_COUNT=$(docker logs futures-oracle --tail 100 2>/dev/null | grep -c "WS DEBUG")
if [ "$WS_COUNT" -gt 0 ]; then
    echo -e "  ${GREEN}✅ RECEIVING DATA${NC} ($WS_COUNT messages)"
else
    echo -e "  ${RED}❌ NO DATA${NC}"
fi
echo ""

# 3. N8N CONNECTION
echo -e "${BLUE}[3/6] N8N Connection...${NC}"
N8N_URL=$(docker exec futures-oracle grep "N8N_WEBHOOK_BASE" /app/oracle.ts 2>/dev/null | grep -o "http://[^']*")
if echo "$N8N_URL" | grep -q "172.17.0.1"; then
    echo -e "  ${GREEN}✅ CORRECT URL${NC} ($N8N_URL)"
else
    echo -e "  ${RED}❌ WRONG URL${NC} ($N8N_URL)"
fi
echo ""

# 4. COOLDOWN
echo -e "${BLUE}[4/6] Cooldown...${NC}"
if docker exec futures-oracle grep "COOLDOWN_MS" /app/oracle.ts 2>/dev/null | grep -q "15 \* 60 \* 1000"; then
    echo -e "  ${GREEN}✅ 15 MINUTES${NC}"
elif docker exec futures-oracle grep "COOLDOWN_MS" /app/oracle.ts 2>/dev/null | grep -q "3 \* 60 \* 60"; then
    echo -e "  ${RED}❌ 3 HOURS (TOO LONG!)${NC}"
else
    echo -e "  ${YELLOW}⚠️  UNKNOWN${NC}"
fi
echo ""

# 5. TREND FILTER
echo -e "${BLUE}[5/6] Trend Filter...${NC}"
if docker logs futures-oracle --tail 50 2>/dev/null | grep "TREND WARNING" | grep -q "ALLOWING"; then
    echo -e "  ${GREEN}✅ NON-BLOCKING${NC}"
elif docker logs futures-oracle --tail 50 2>/dev/null | grep "TREND WARNING" | grep -q "BLOCKING"; then
    echo -e "  ${RED}❌ BLOCKING SIGNALS${NC}"
else
    echo -e "  ${GREEN}✅ NO ISSUES${NC}"
fi
echo ""

# 6. ACTIVITY
echo -e "${BLUE}[6/6] Activity (Last 5min)...${NC}"
VELOCITY=$(docker logs futures-oracle --since 5m 2>/dev/null | grep -c "VELOCITY")
ALERT=$(docker logs futures-oracle --since 5m 2>/dev/null | grep -c "ALERT")
echo -e "  - Checks: ${GREEN}$VELOCITY${NC}"
echo -e "  - Alerts: ${GREEN}$ALERT${NC}"
echo ""

echo "════════════════════════════════════════════"
echo -e "${GREEN}LIVE MONITORING:${NC}"
docker logs futures-oracle --tail 3 2>/dev/null | grep "VELOCITY CHECK" | sed 's/^/  /'
echo "════════════════════════════════════════════"
