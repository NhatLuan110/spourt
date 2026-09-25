@echo off
setlocal
cd /d "%~dp0apps\web"
set "NODE_ENV=production"
set "API_ORIGIN=http://127.0.0.1:4000"
set "NEXT_PUBLIC_API_URL=/api/v1"
echo Dang bat lai web. Giu cua so nay mo de tiep tuc su dung.
node node_modules\next\dist\bin\next start --port 3000 --hostname 127.0.0.1
pause
