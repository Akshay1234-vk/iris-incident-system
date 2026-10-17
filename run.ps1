Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  IRIS: Intelligent Resolution Incident System" -ForegroundColor Green
Write-Host "  DBMS Review 1 Prototype - Launching Server..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$BackendDir = Join-Path $PSScriptRoot "backend"
if (-not (Test-Path $BackendDir)) {
    Write-Host "Error: Backend directory not found at $BackendDir" -ForegroundColor Red
    Exit 1
}

Set-Location -Path $BackendDir
Write-Host "Starting IRIS backend on http://127.0.0.1:8000" -ForegroundColor Green
python main.py
