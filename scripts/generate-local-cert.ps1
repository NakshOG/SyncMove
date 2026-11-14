param(
  [string]$LanIp = "172.31.124.88"
)

$ErrorActionPreference = "Stop"
$certDir = Join-Path $PSScriptRoot "..\certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  Write-Error "mkcert is required. Install it with: winget install FiloSottile.mkcert"
}

mkcert -install
mkcert -cert-file (Join-Path $certDir "syncmove.crt") `
  -key-file (Join-Path $certDir "syncmove.key") `
  $LanIp localhost 127.0.0.1

Write-Host "Created local certificate for https://$LanIp"
Write-Host "Install the mkcert root CA on every LAN device that will access SyncMove."
