@echo off
title IRIS - Intelligent Resolution Incident System
echo ========================================================
echo   IRIS: Intelligent Resolution Incident System
echo   DBMS Review 1 Prototype - Starting Server...
echo ========================================================
echo.
cd /d "%~dp0backend"
python main.py
pause
