@echo off
title Push IRIS to GitHub
echo ========================================================
echo   Pushing IRIS to GitHub:
echo   https://github.com/Akshay1234-vk/iris-incident-system
echo ========================================================
echo.
cd /d "%~dp0"
git push -u origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo  [SUCCESS] Code successfully pushed to GitHub!
    echo  Your repository link:
    echo  https://github.com/Akshay1234-vk/iris-incident-system
    echo ========================================================
) else (
    echo [ERROR] Push encountered an issue. Please check the message above.
)
echo.
pause
