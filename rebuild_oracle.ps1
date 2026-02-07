# Rebuild Oracle Container
Write-Host "🔄 UPDATE: Starting Oracle V22 Rebuild..." -ForegroundColor Yellow

docker compose down oracle
docker compose up -d --build oracle

Write-Host "✅ UPDATE: Oracle V22 is LIVE!" -ForegroundColor Green
Write-Host "👻 Ghost Sniper Mode: ACTIVE" -ForegroundColor Cyan
Write-Host "📊 Monitoring: Bidirectional (Long/Short)" -ForegroundColor Cyan
