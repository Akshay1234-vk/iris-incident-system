@echo off
title IRIS - Intelligent Resolution Incident System
echo ========================================================
echo   IRIS: Intelligent Resolution Incident System
echo   DBMS Review 1 Prototype - Starting Server...
echo ========================================================
echo.
cd /d "%~dp0backend"
echo Launching server at http://127.0.0.1:8000 ...
python main.py
pause
