# Run SyncMove on the LAN

Run these commands from the project directory in PowerShell. Replace `172.31.124.88` if your Wi-Fi IP changes.

## 1. Configure the LAN address

```powershell
$env:NEXT_PUBLIC_LAN_IP = "172.31.124.88"
$env:NGINX_CONFIG = "./nginx.lan.conf"
```

## 2. Generate the HTTPS certificate

```powershell
$mkcert = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter mkcert.exe -Recurse | Select-Object -First 1 -ExpandProperty FullName
& $mkcert -install
& .\scripts\generate-local-cert.ps1 -LanIp 172.31.124.88
```

Install the generated mkcert root CA on every device that opens the LAN URL. Never share `rootCA-key.pem`.

## 3. Start the database, Redis, and SFU

```powershell
docker start syncmove-db-primary syncmove-redis
docker compose -f docker-compose.sfu.yml up -d --no-deps --force-recreate mediasoup-sfu
```

Verify that the SFU advertises the LAN IP:

```powershell
docker inspect syncmove-sfu --format '{{range .Config.Env}}{{println .}}{{end}}' | Select-String MEDIASOUP_ANNOUNCED_IP
```

## 4. Start Prisma and Next.js

```powershell
npx prisma studio

npm run dev -- --hostname 0.0.0.0
```

## 5. Start NGINX and open the app

Run this in a second PowerShell window:

```powershell
$env:NGINX_CONFIG = "./nginx.lan.conf"
docker compose -f docker-compose.sfu.yml up -d --no-deps --force-recreate nginx
```

Open `https://172.31.124.88` and sign in again on the LAN address. `localhost` and the LAN address have separate browser sessions.

## Firewall rules

Run once as Administrator if calls cannot connect:

```powershell
New-NetFirewallRule -DisplayName "SyncMove SFU TCP" -Direction Inbound -Protocol TCP -LocalPort 3333 -Action Allow
New-NetFirewallRule -DisplayName "SyncMove SFU UDP" -Direction Inbound -Protocol UDP -LocalPort 40000-40099 -Action Allow
```

Calls use the Mediasoup SFU only
