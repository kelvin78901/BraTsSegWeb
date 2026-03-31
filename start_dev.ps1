# start_dev.ps1 - Launcher for BraTS Web MedDemo

Write-Host ">>> MedDemo Launcher" -ForegroundColor Cyan

# 1. Extract API Key from launch.json
$launchFile = ".vscode/launch.json"
$apiKey = "AIzaSyDIDQ16D8s59FdcFCQTkPlRISsBgbhrIzM"

if (Test-Path $launchFile) {
    $content = Get-Content $launchFile -Raw
    if ($content -match '"GEMINI_API_KEY"\s*:\s*"([^"]+)"') {
        $apiKey = $matches[1]
    }
}

if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey -eq "INSERT_YOUR_GOOGLE_API_KEY_HERE") {
    Write-Host "ERROR: GEMINI_API_KEY not found or default value in $launchFile." -ForegroundColor Red
    Write-Host "Please edit .vscode/launch.json and paste your Gemini API Key."
    exit 1
}

$env:GEMINI_API_KEY = $apiKey
Write-Host ">>> Loaded GEMINI_API_KEY from config." -ForegroundColor Green

# 2. Start Python Sidecar
Write-Host ">>> Starting Sidecar (FastAPI)..." -ForegroundColor Cyan
# Stop existing instances if any
Write-Host ">>> Stopping existing Sidecar/Java processes..." -ForegroundColor Yellow
Get-Process python -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like "*sidecar*"} | Stop-Process -Force -ErrorAction SilentlyContinue

# Find any process on port 8080 (Windows only) and kill it
$tcp = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
if ($tcp) {
    echo "Killing process on port 8080 (PID $($tcp.OwningProcess))..."
    Stop-Process -Id $tcp.OwningProcess -Force -ErrorAction SilentlyContinue
}

# Start new background process (Sidecar)
$job = Start-Process -FilePath "python" -ArgumentList "-m", "uvicorn", "app:app", "--app-dir", "sidecar", "--host", "0.0.0.0", "--port", "8000" -PassThru -WindowStyle Minimized

Start-Sleep -Seconds 3

# Check if running
$check = Invoke-WebRequest "http://localhost:8000/health" -ErrorAction SilentlyContinue
if ($check.StatusCode -eq 200) {
    Write-Host ">>> Sidecar is Online (PID $($job.Id))" -ForegroundColor Green
} else {
    Write-Host ">>> Sidecar FAILED to start." -ForegroundColor Red
    exit 1
}

# 3. Start Spring Boot
Write-Host ">>> Starting Spring Boot..." -ForegroundColor Cyan
Set-Location "spring/demo"
./mvnw.cmd spring-boot:run
