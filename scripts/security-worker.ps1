# Worker only. Prefer `npm run security-pc` (vLLM check + ssh -L 3306/6333 + worker).
# AWS npm run dev does not start this.
# Usage (repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\security-worker.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host "Security worker CWD=$root  (Ctrl+C to stop)"
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
  Write-Error "python not on PATH"
  exit 127
}
python ai-service/scripts/run_security_worker.py
