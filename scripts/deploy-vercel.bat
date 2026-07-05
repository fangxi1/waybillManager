@echo off
echo === Deploy universal-import-v2 (V2) + waybillManager (V3) to Vercel ===
echo.
echo Step 1: Login (if not already)
call npx vercel login
echo.
echo Step 2: Deploy V2 (universal-import-v2)
cd /d "%~dp0..\..\universal-import-v2"
call npx vercel --prod
echo.
echo Ensure V2 env: POSTGRES_URL, INTEGRATION_API_KEY=waybill-v3-secret-key
echo Copy the V2 production URL above, set V3 V2_API_BASE_URL to https://^<v2-host^>/api/integration
echo.
echo Step 3: Deploy V3
cd /d "%~dp0.."
call npx vercel --prod
echo.
echo Step 4: Init V3 database (replace SECRET)
echo curl -X POST https://waybill-manager-v3.vercel.app/api/admin/init-db -H "Authorization: Bearer YOUR_CRON_SECRET"
pause
