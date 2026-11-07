@echo off
title SH12 Pro - Subscription Server & Telegram Bot
cd /d "%~dp0"
echo ====================================================
echo   Starting SH12 Pro Subscription Server ^& Bot...
echo   Dashboard URL: http://localhost:3000
echo ====================================================
start "" "http://localhost:3000"
node server.js
pause
