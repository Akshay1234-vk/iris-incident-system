Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  IRIS: Intelligent Resolution Incident System" -ForegroundColor Green
Write-Host "  DBMS Review 1 Prototype - Launching Server..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Set-Location -Path "$PSScriptRootackend"
python main.py
