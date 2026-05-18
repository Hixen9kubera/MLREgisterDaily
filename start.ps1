$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venvActivate = Join-Path $backend ".venv\Scripts\Activate.ps1"

if (-not (Test-Path $venvActivate)) {
    Write-Host "Falta el venv. Corre primero:" -ForegroundColor Red
    Write-Host "  cd backend; python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "Instalando dependencias del frontend..." -ForegroundColor Cyan
    Push-Location $frontend
    npm install
    Pop-Location
}

Write-Host "Compilando frontend (vite build)..." -ForegroundColor Cyan
Push-Location $frontend
npm run build
$buildExit = $LASTEXITCODE
Pop-Location
if ($buildExit -ne 0) {
    Write-Host "Build del frontend fallo (exit $buildExit). Aborto." -ForegroundColor Red
    exit $buildExit
}

Write-Host ""
Write-Host "Arrancando servidor unico en http://localhost:8000" -ForegroundColor Green
Write-Host "  UI:    http://localhost:8000" -ForegroundColor Green
Write-Host "  API:   http://localhost:8000/dashboard/summary" -ForegroundColor Green
Write-Host "  Docs:  http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""

Push-Location $backend
& $venvActivate
uvicorn app.main:app --port 8000
Pop-Location
