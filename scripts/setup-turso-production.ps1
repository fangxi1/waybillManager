# 生产环境 Turso 数据库 + Vercel 环境变量配置脚本
# 用法：先完成 Turso 登录，再运行此脚本

$ErrorActionPreference = "Stop"
$TURSO = "D:\IdeaProjects\go-path\bin\turso.exe"
$DB_NAME = "waybill-v3"
$PROJECT_DIR = Split-Path $PSScriptRoot -Parent

Write-Host "=== Step 1: 检查 Turso 登录 ===" -ForegroundColor Cyan
& $TURSO auth whoami
if ($LASTEXITCODE -ne 0) {
    Write-Host "请先运行: $TURSO auth login" -ForegroundColor Yellow
    Write-Host "或访问: https://api.turso.tech?redirect=false" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== Step 2: 创建数据库 $DB_NAME ===" -ForegroundColor Cyan
$dbList = & $TURSO db list 2>&1 | Out-String
if ($dbList -notmatch $DB_NAME) {
    & $TURSO db create $DB_NAME --location aws-ap-northeast-1
}

Write-Host "`n=== Step 3: 获取连接信息 ===" -ForegroundColor Cyan
$dbUrl = (& $TURSO db show $DB_NAME --url).Trim()
$dbToken = (& $TURSO db tokens create $DB_NAME).Trim()
Write-Host "DATABASE_URL: $dbUrl"

Write-Host "`n=== Step 4: 写入 Vercel 环境变量 ===" -ForegroundColor Cyan
Set-Location $PROJECT_DIR
echo $dbUrl | npx vercel env add DATABASE_URL production --yes --force
echo $dbToken | npx vercel env add DATABASE_AUTH_TOKEN production --yes --force

Write-Host "`n=== Step 5: 重新部署 V3 ===" -ForegroundColor Cyan
npx vercel --yes --prod

Write-Host "`n=== Step 6: 初始化数据库（等待 30s 部署生效）===" -ForegroundColor Cyan
Start-Sleep -Seconds 30
$headers = @{ Authorization = "Bearer waybill-v3-cron-20260703" }
Invoke-RestMethod -Uri "https://waybill-manager-v3.vercel.app/api/admin/init-db" -Method POST -Headers $headers

Write-Host "`n✅ 完成！访问 https://waybill-manager-v3.vercel.app" -ForegroundColor Green
