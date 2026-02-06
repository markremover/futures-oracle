#!/bin/bash
# Auto-import N8N Workflows from GitHub
# Run this on VM after 'git pull'

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🔄 Updating N8N Workflows from GitHub...${NC}"

# 1. Pull latest from GitHub
cd ~/futures-oracle || exit
git pull

# 2. Copy workflows to N8N container
echo -e "${YELLOW}📤 Importing workflows to N8N...${NC}"

WORKFLOWS=(
  "(ETH) Market_V21_GHOST-SNIPER.json"
  "(SOL) Market_V21_GHOST-SNIPER.json"
  "(XRP) Market_V21_GHOST-SNIPER.json"
  "(SUI) Market_V21_GHOST-SNIPER.json"
  "(DOGE) Market_V21_GHOST-SNIPER.json"
)

for workflow in "${WORKFLOWS[@]}"; do
  if [ -f "$workflow" ]; then
    docker cp "$workflow" n8n:/tmp/
    echo -e "${GREEN}✅ Copied: $workflow${NC}"
  else
    echo -e "${YELLOW}⚠️  Not found: $workflow${NC}"
  fi
done

echo ""
echo -e "${GREEN}✅ All workflows copied to N8N container!${NC}"
echo ""
echo -e "${YELLOW}📝 NEXT STEP:${NC}"
echo "1. Open N8N: http://172.17.0.1:5678"
echo "2. Go to: Workflows → Import from File"
echo "3. In N8N container terminal, workflows are in: /tmp/"
echo ""
echo -e "${YELLOW}Or use N8N CLI (if available):${NC}"
echo "docker exec n8n n8n import:workflow --input=/tmp/*.json"
