# Real Load Test Results

## Auth-bypass retest

This run used the secret-gated local-only `/api/load-test` endpoint. It bypassed Clerk redirect work for the benchmark, while normal routes and production mode remained protected. The endpoint performs one MariaDB `SELECT 1` and one Redis increment per request.

It did **not** bypass the Next.js development server, Turbopack, or the dev proxy. Therefore this is a development-server saturation result, not a production `next start` result.

Run: 2026-11-14T01:42:04.867Z -> 2026-11-14T01:43:03.831Z

## Configuration

- Virtual users: 439
- Duration: 30s
- Base URL: http://localhost:3000
- Authenticated message load: not measured: set LOAD_AUTH_TOKEN and LOAD_CHANNEL_ID

## Observed metrics

| Metric | Result |
|---|---:|
| API requests | 1765 |
| API throughput | 57.1/s |
| API p95 | 30435.01 ms |
| API p99 | 30486.04 ms |
| WebSocket connected | 439/439 |
| WebSocket connection failure rate | 0% |
| Unexpected WebSocket disconnect rate | 0% |
| DB connections after run | 11/151 |
| Redis command delta | 419 |
| Messages/s | not measured |
| Video bandwidth | Not measured without active WebRTC producers |
| Recovery HTTP status | 307 (3xx means auth redirect) |

## Peak container CPU and RAM

| Container | Peak CPU | Peak RAM |
|---|---:|---:|
| syncmove-nginx | 0.00% | 13.26 MB |
| syncmove-app-2 | 19.09% | 120.20 MB |
| syncmove-app-1 | 1.31% | 213.40 MB |
| syncmove-sfu | 10.50% | 136.10 MB |
| syncmove-db-failover | 0.96% | 1.40 MB |
| syncmove-db-replica | 0.03% | 79.95 MB |
| syncmove-redis | 1.57% | 7.17 MB |
| syncmove-db-primary | 1.81% | 105.00 MB |

Raw samples are in REAL-LOAD-TEST-RESULTS.json. These are measurements of this machine and this run, not production capacity guarantees.

## Detailed interpretation

- The run generated 1,764 requests and 1,713 completed responses. The 51 errors were requests still pending when the 30-second user window ended, not reported HTTP 5xx responses.
- API p95/p99 were approximately 30.44/30.49 seconds. The Next.js dev log showed requests queued around 1.8–2.3 seconds initially and then delayed as the dev server handled hundreds of concurrent requests; the harness records the full client-observed wait.
- The app containers did not approach CPU saturation: `syncmove-app-2` peaked at 19.09% and `syncmove-app-1` at 1.31%. This means the bottleneck was queueing/dev-server scheduling and I/O wait, not available CPU.
- Database connections reached 11/151 and Redis processed 419 additional commands, so neither reached its configured limit.
- SFU signaling connected 439/439 sockets with no unexpected disconnects. No camera/microphone producers were created, so this remains a signaling test, not a video-bandwidth test.

## Resource safety boundary

The harness records Docker CPU, memory, and network counters. It does not intentionally fill the SSD, exhaust RAM, or saturate the Wi-Fi adapter: those actions can destabilize Windows and corrupt Docker/database state. A safe capacity test increases pressure until a latency/error/resource guardrail trips, then stops and verifies recovery. Disk and Wi-Fi capacity should be tested with bounded quotas and an isolated network target, not by forcing them to 100%.
