# This PC only. Not started by AWS `npm run dev`.
# Optional ssh -L 3306 to Lightsail MariaDB (same pattern as security-pc).
# Starts local uvicorn :8800 if /health is down. Does not start vLLM.
# Then runs the lot-score worker (predict-voting → JUDGMENT/ANALYSIS).
#
# Usage (repo root):
#   npm run score-pc
#   npm run score-pc -- -KeyPath "키.pem" -PublicHost "<Lightsail공인IP>"
#
# Env: SECURITY_PC_KEY_PATH, SECURITY_PC_PUBLIC_HOST, SECURITY_PC_USER
# This PC .env while tunnel is up: DB_HOST=127.0.0.1
# Lightsail .env: LOT_SCORE_ON_AWS=0
#
# Ctrl+C stops the worker, uvicorn we started, and ssh forwards.

param(
  [string]$KeyPath = "",
  [string]$PublicHost = "",
  [string]$User = "ubuntu",
  [int]$AiPort = 8800,
  [int]$VllmPort = 8001,
  [int]$DbPort = 3306
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $KeyPath.Trim()) {
  $KeyPath = [string]$env:SECURITY_PC_KEY_PATH
}
if (-not $PublicHost.Trim()) {
  $PublicHost = [string]$env:SECURITY_PC_PUBLIC_HOST
}
if ($env:SECURITY_PC_USER -and $env:SECURITY_PC_USER.Trim() -ne "") {
  $User = $env:SECURITY_PC_USER.Trim()
}

$sshProc = $null
$aiProc = $null
$startedAi = $false

function Test-LocalPort([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(800)
    if ($ok -and $client.Connected) {
      $client.EndConnect($iar)
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

function Test-AiHealth {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$AiPort/health" -TimeoutSec 3 -UseBasicParsing
    return $r.StatusCode -ge 200 -and $r.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Stop-Children {
  if ($null -ne $script:sshProc -and -not $script:sshProc.HasExited) {
    Write-Host "Stopping ssh -L (pid $($script:sshProc.Id))"
    Stop-Process -Id $script:sshProc.Id -Force -ErrorAction SilentlyContinue
  }
  if ($script:startedAi -and $null -ne $script:aiProc -and -not $script:aiProc.HasExited) {
    Write-Host "Stopping local uvicorn (pid $($script:aiProc.Id))"
    Stop-Process -Id $script:aiProc.Id -Force -ErrorAction SilentlyContinue
  }
}

$wantForward = ($KeyPath.Trim() -ne "") -or ($PublicHost.Trim() -ne "")
if ($wantForward) {
  if ($KeyPath.Trim() -eq "" -or $PublicHost.Trim() -eq "") {
    Write-Error "Both -KeyPath and -PublicHost (or SECURITY_PC_KEY_PATH / SECURITY_PC_PUBLIC_HOST) are required for ssh -L."
    exit 2
  }
  if (-not (Test-Path -LiteralPath $KeyPath)) {
    Write-Error "Key file not found: $KeyPath"
    exit 2
  }
  if (Test-LocalPort $DbPort) {
    Write-Host "127.0.0.1:$DbPort already listening — skip ssh -L $DbPort"
  } else {
    Write-Host "MariaDB forward: this PC 127.0.0.1:$DbPort -> ${User}@${PublicHost} 127.0.0.1:$DbPort"
    $sshArgs = @(
      '-i', $KeyPath,
      '-N',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ExitOnForwardFailure=yes',
      '-L', "${DbPort}:127.0.0.1:${DbPort}",
      "${User}@${PublicHost}"
    )
    $sshProc = Start-Process -FilePath "ssh" -ArgumentList $sshArgs -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 1
    if ($sshProc.HasExited) {
      Write-Error "ssh -L exited immediately (code $($sshProc.ExitCode)). Check key, host, and that port $DbPort is free locally."
      exit 2
    }
  }
}

if (-not (Test-LocalPort $VllmPort)) {
  Write-Host "WARN vLLM not on 127.0.0.1:$VllmPort — risk_reason will use rule fallback"
} else {
  Write-Host "vLLM ok on 127.0.0.1:$VllmPort (not restarted)"
}

if (Test-AiHealth) {
  Write-Host "ai-service already up on 127.0.0.1:$AiPort"
} else {
  $py = Get-Command python -ErrorAction SilentlyContinue
  if (-not $py) {
    Stop-Children
    Write-Error "python not on PATH (needed for uvicorn :$AiPort)"
    exit 127
  }
  Write-Host "Starting local uvicorn app.main:app on 127.0.0.1:$AiPort"
  $aiProc = Start-Process -FilePath "python" -ArgumentList @(
    '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$AiPort"
  ) -WorkingDirectory (Join-Path $root 'ai-service') -PassThru -WindowStyle Hidden
  $startedAi = $true
  $ok = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    if (Test-AiHealth) { $ok = $true; break }
    if ($aiProc.HasExited) { break }
  }
  if (-not $ok) {
    Stop-Children
    Write-Error "ai-service /health not ready on 127.0.0.1:$AiPort"
    exit 2
  }
  Write-Host "ai-service ready on 127.0.0.1:$AiPort"
}

$env:SCORE_PROCESS = '1'
$env:AI_SERVICE_URL = "http://127.0.0.1:$AiPort"
Write-Host "Score PC launcher CWD=$root  (Ctrl+C stops worker + children)"
Write-Host "This PC .env should use DB_HOST=127.0.0.1 while the DB tunnel is up."
try {
  npx --yes tsx backend/scripts/run-score-worker.ts
  $code = $LASTEXITCODE
} finally {
  Stop-Children
}
exit $(if ($null -eq $code) { 0 } else { $code })
