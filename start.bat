@echo off
chcp 65001 >nul
title 校园招聘面试智能分析工具

echo.
echo ══════════════════════════════════════════════
echo   校园招聘面试智能分析工具 v1.0
echo ══════════════════════════════════════════════
echo.
echo   正在启动服务...
echo.

node "%~dp0server.js"

pause
