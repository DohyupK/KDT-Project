# Reverse-tunnel this PC's vLLM (:8001) onto the Lightsail loopback.
# vLLM runs only on this PC. Lightsail has no GPU — 127.0.0.1:8001 there is this pipe.
# Usage:
#   .\scripts\vllm-tunnel.ps1 -KeyPath "C:\Users\OWNER\Downloads\key.pem" -PublicHost "x.x.x.x"
# Keep this window open while the AWS app needs security-chat summaries.
# Server .env stays CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1

param(
  [Parameter(Mandatory = $true)][string]$KeyPath,
  [Parameter(Mandatory = $true)][string]$PublicHost,
  [string]$User = "ubuntu",
  [int]$ReconnectDelaySec = 5
)

if (-not (Test-Path -LiteralPath $KeyPath)) {
  Write-Error "Key file not found: $KeyPath"
  exit 1
}

Write-Host "Tunnel: Lightsail 127.0.0.1:8001 <- this PC 127.0.0.1:8001"
Write-Host "vLLM must already be listening on this PC :8001"
Write-Host "Keepalive on; reconnects if SSH drops. Ctrl+C to stop."

$sshArgs = @(
  '-i', $KeyPath,
  '-N',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'ExitOnForwardFailure=yes',
  '-R', '8001:127.0.0.1:8001',
  "${User}@${PublicHost}"
)

while ($true) {
  ssh @sshArgs
  $code = $LASTEXITCODE
  Write-Host "Tunnel exited (code=$code). Reconnecting in ${ReconnectDelaySec}s. Ctrl+C to stop."
  Start-Sleep -Seconds $ReconnectDelaySec
}
