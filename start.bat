@echo off
title Profily – spouštěč

echo Spouštím AI proxy (port 3000)...
start "AI Proxy" cmd /k "cd /d "%~dp0ai-proxy" && node server.js"

echo Spouštím web server (port 5500)...
start "Web" cmd /k "cd /d "%~dp0web" && npx --yes http-server . -p 5500 --cors -o"

exit
