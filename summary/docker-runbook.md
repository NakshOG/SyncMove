# Docker Runbook

## Start the full distributed stack

```bash
docker compose -f docker-compose.multi.yml up -d --build
```

## Service layout

- NGINX: http://localhost
- app-node-1: http://localhost:3001
- app-node-2: http://localhost:3002
- Redis: localhost:6379
- MariaDB primary: localhost:3307
- MariaDB replica: localhost:3308
- db-failover watcher: promotes the replica automatically if the primary becomes unavailable
- TURN: localhost:3478 (TCP/UDP), localhost:5349 (TCP/UDP)

## Automatic promotion and rejoin flow

The project now includes a failover watcher that:

1. monitors the primary DB health
2. promotes the replica to primary if the primary is unavailable
3. waits for the recovered old primary to come back
4. reconfigures it as a replica of the new primary

This is implemented via the scripts in the `scripts/` directory and the `db-failover` service in `docker-compose.multi.yml`.

## Stop the stack

```bash
docker compose -f docker-compose.multi.yml down
```

## Rebuild after code changes

```bash
docker compose -f docker-compose.multi.yml up -d --build
```

## If host MySQL is blocking Docker

Stop local MySQL services on Windows before starting Docker DB containers:

```powershell
Stop-Service MySQL80 -ErrorAction SilentlyContinue
Stop-Service MySQL267 -ErrorAction SilentlyContinue
```

## Simulation / load model

This project includes lightweight local simulation checks for:

- multi-user chat bursts
- room fan-out patterns
- bot + human user churn assumptions
- safe capacity boundaries for a 2-node app topology

These checks are meant to model realistic traffic without replacing full production load testing.

## Notes

- Primary DB is the write source
- Replica is for read scaling
- TURN is for WebRTC relay fallback
- Redis is used for realtime or broadcast coordination
