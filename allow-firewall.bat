@echo off
chcp 65001 >nul
title 配置防火墙 — 校园招聘面试分析工具
echo.
echo ══════════════════════════════════════════════
echo   正在配置 Windows 防火墙...
echo ══════════════════════════════════════════════
echo.

netsh advfirewall firewall add rule name="AI Interview Tool (Port 3000)" dir=in action=allow protocol=TCP localport=3000

if %errorlevel% equ 0 (
  echo ✅ 防火墙规则已添加成功！
  echo.
  echo 其他设备现在可以通过 http://10.17.169.182:3000 访问此工具
) else (
  echo ❌ 配置失败，请右键本文件选择「以管理员身份运行」
)

echo.
pause
