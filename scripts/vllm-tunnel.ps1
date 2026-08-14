# Reverse-tunnel this PC's vLLM (:8001) onto the Lightsail loopback.
# Usage:
#   .\scripts\vllm-tunnel.ps1 -KeyPath "C:\Users\OWNER\Downloads\key.pem" -PublicHost "x.x.x.x"
# Keep this window open while the AWS app needs security-chat summaries.
# Server .env stays CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1

param(
  [Parameter(Mandatory = $true)][string]$KeyPath,
  [Parameter(Mandatory = $true)][string]$PublicHost,
  [string]$User = "ubuntu"
)

if (-not (Test-Path -LiteralPath $KeyPath)) {
  Write-Error "Key file not found: $KeyPath"
  exit 1
}

Write-Host "Tunnel: Lightsail 127.0.0.1:8001 <- this PC 127.0.0.1:8001"
Write-Host "vLLM must already be listening on this PC :8001"
ssh -i $KeyPath -N -R 8001:127.0.0.1:8001 "${User}@${PublicHost}"
