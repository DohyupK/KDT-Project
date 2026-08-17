# This PC only. Not started by AWS `npm run dev`.
# Checks local vLLM :8001 (does not start/restart the model).
# Optional: ssh -L 6333 (Qdrant) and ssh -L 3306 (MariaDB) so this PC
# can search AWS Qdrant and watch USER_SECURITY_MESSAGES without opening
# those ports on the Lightsail firewall.
# Then runs the security worker.
#
# Usage (repo root):
#   npm run security-pc
#   npm run security-pc -- -KeyPath "C:\Users\OWNER\Downloads\key.pem" -PublicHost "3.38.135.192"
#   powershell -ExecutionPolicy Bypass -File .\scripts\security-pc.ps1 -KeyPath "..." -PublicHost "..."
#
# Env fallbacks: SECURITY_PC_KEY_PATH, SECURITY_PC_PUBLIC_HOST, SECURITY_PC_USER
# This PC .env while tunnels are up: DB_HOST=127.0.0.1, QDRANT_URL=http://127.0.0.1:6333
#
# Ctrl+C stops the worker and the ssh forwards.

param(
  [string]$KeyPath = "",
  [string]$PublicHost = "",
  [string]$User = "ubuntu",
  [int]$VllmPort = 8001,
  [int]$QdrantPort = 6333,
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

function Stop-SshForward {
  if ($null -ne $script:sshProc -and -not $script:sshProc.HasExited) {
    Write-Host "Stopping ssh -L (pid $($script:sshProc.Id))"
    Stop-Process -Id $script:sshProc.Id -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-LocalPort $VllmPort)) {
  Write-Error @"
vLLM is not listening on 127.0.0.1:$VllmPort.
Start the model server first (this script does not launch vLLM).
Then re-run: npm run security-pc
"@
  exit 2
}
Write-Host "vLLM ok on 127.0.0.1:$VllmPort (not restarted)"

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

  $forwardArgs = @()
  if (Test-LocalPort $QdrantPort) {
    Write-Host "127.0.0.1:$QdrantPort already listening — skip ssh -L $QdrantPort"
  } else {
    Write-Host "Qdrant forward: this PC 127.0.0.1:$QdrantPort -> ${User}@${PublicHost} 127.0.0.1:$QdrantPort"
    $forwardArgs += @('-L', "${QdrantPort}:127.0.0.1:${QdrantPort}")
  }
  if (Test-LocalPort $DbPort) {
    Write-Host "127.0.0.1:$DbPort already listening — skip ssh -L $DbPort (worker uses existing local MariaDB)"
  } else {
    Write-Host "MariaDB forward: this PC 127.0.0.1:$DbPort -> ${User}@${PublicHost} 127.0.0.1:$DbPort"
    $forwardArgs += @('-L', "${DbPort}:127.0.0.1:${DbPort}")
  }

  if ($forwardArgs.Count -gt 0) {
    $sshArgs = @(
      '-i', $KeyPath,
      '-N',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ExitOnForwardFailure=yes'
    ) + $forwardArgs + @("${User}@${PublicHost}")
    $sshProc = Start-Process -FilePath "ssh" -ArgumentList $sshArgs -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 1
    if ($sshProc.HasExited) {
      Write-Error "ssh -L exited immediately (code $($sshProc.ExitCode)). Check key, host, and that forwarded ports are free locally."
      exit 2
    }
  }
}

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
  Stop-SshForward
  Write-Error "python not on PATH"
  exit 127
}

Write-Host "Security PC launcher CWD=$root  (Ctrl+C stops worker + ssh forwards)"
Write-Host "This PC .env should use DB_HOST=127.0.0.1 and QDRANT_URL=http://127.0.0.1:6333 while tunnels are up."
try {
  python ai-service/scripts/run_security_worker.py
  $code = $LASTEXITCODE
} finally {
  Stop-SshForward
}
exit $(if ($null -eq $code) { 0 } else { $code })
