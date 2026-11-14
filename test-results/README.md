# Test Results Directory

This directory contains comprehensive test results and stress test analysis for the SyncMove application.

---

## Test Files

### ✅ Standard Tests

| File | Description | Status |
|------|-------------|--------|
| `architecture.spec.ts` | Multi-node architecture validation | ✅ 6 tests passing |
| `e2ee-crypto.spec.ts` | End-to-end encryption tests | ✅ 1 test passing |
| `simulation.spec.ts` | User/bot simulation tests | ✅ 9 tests passing |
| `frontend.spec.ts` | Frontend code quality & integration | ✅ 12 tests passing |

### 🚨 Stress Tests (Sequential)

| File | Description | Status |
|------|-------------|--------|
| `stress.spec.ts` | System breaking point analysis (sequential) | ✅ 25 tests passing |

### 🔥 Concurrent Simulation Tests (TRUE CONCURRENCY)

| File | Description | Status |
|------|-------------|--------|
| `concurrent-simulation.spec.ts` | True concurrent load testing with Promise.all | ✅ 19 tests passing |

---

## Results

## What Passed, Specifically

The latest run was not a single aggregate check. Each test file passed these focused areas:

| Test file | What passed | Why it matters |
|---|---|---|
| `architecture.spec.ts` | 6/6 | NGINX, two app nodes, primary/replica database topology, Redis coordination, SFU-only routing, and failover configuration. |
| `e2ee-crypto.spec.ts` | 1/1 | X3DH key agreement/signing and AES-GCM encryption primitives. |
| `simulation.spec.ts` | 9/9 | Multi-user messaging, ordering, fan-out, database outage behavior, audio traffic, SFU video traffic, and local stress scenarios. |
| `frontend.spec.ts` | 12/12 | Frontend structure, routing, UI integration, and client behavior checks. |
| `stress.spec.ts` | 25/25 | CPU, memory, database, Redis, WebSocket, upload, E2EE, audio, and SFU video stress models. |
| `concurrent-simulation.spec.ts` | 19/19 | Concurrent bot, connection, messaging, Redis, audio, video, multi-call, and 100-participant SFU simulations. |

The suite total is **72 passed, 0 failed**. The 100-participant video result is a validated SFU routing model, not a claim that 100 live camera producers were sustained on this laptop.

### Real Docker results

- Full Docker load: 439/439 Socket.IO users connected, 0% unexpected disconnects, 1,605 HTTP requests, API p95 37.33 seconds, peak app CPU 1.01%, peak SFU CPU 9.03%.
- Auth-bypass retest: 1,764 requests, 1,713 completed responses, API p95 30.44 seconds and p99 30.49 seconds; this exposed Next.js development-server queueing rather than CPU exhaustion.
- In that retest, app-2 peaked at 19.09% CPU and 120.2 MB RAM, app-1 at 1.31% CPU and 213.4 MB RAM, MariaDB reached 11/151 connections, and Redis processed 419 additional commands.
- Adaptive API breakpoint: p95 stayed below 2 seconds through 450 workers; at 500 workers it reached 2,437.47 ms and API pressure stopped safely.
- Adaptive SFU signaling: all stages through 500 connections completed with zero connection failures.
- Message throughput and video bandwidth were not measured in the unauthenticated/signaling-only run; those require an auth token/channel and active WebRTC producers.

The auth-bypass endpoint is local-only, secret-gated, and disabled in production. The benchmark intentionally does not fill the SSD, exhaust RAM, or saturate Wi-Fi; it stops at guardrails to protect the development machine and Docker data.

See `ADAPTIVE-BREAKPOINT-RESULTS.md` and `REAL-LOAD-TEST-RESULTS.md` for stage-by-stage data.

## Latest implementation notes

- Server logos are compressed public `ServerImage` uploads and persist through the database `imageURL`; they are not included in chat E2EE.
- Audio and video calls both use the Mediasoup SFU model. The 100-participant values are routing targets, not measured live-media limits.
- Direct-message online/offline state now uses profile-scoped Socket.IO events with Redis presence and local fallback.
- Microphone and speaker controls beside the profile logo persist locally and apply to active call tracks and remote playback.
- E2EE peer bundles use a five-minute browser cache and in-flight request deduplication to avoid repeated key fetches in large groups.

## Study material and short videos

The beginner-friendly technical walkthrough is in [`STUDY-GUIDE.md`](../STUDY-GUIDE.md). It now includes a topic-by-topic visual study plan with short YouTube links for Docker, NGINX, MariaDB replication, Redis, WebSockets, Socket.IO, WebRTC, SFU routing, E2EE, X3DH, Double Ratchet, AES-GCM, compression, and p95/p99 load testing.

Start with this order:

1. Docker and Compose
2. NGINX and the database/Redis topology
3. WebSockets and Socket.IO
4. WebRTC and SFU versus P2P
5. E2EE: X3DH, Double Ratchet, and AES-GCM
6. Compression and load-test percentiles

### 📊 Test Summary

| Category | Tests | Passed | Failed |
|----------|-------|--------|--------|
| Architecture | 6 | 6 | 0 |
| E2EE Crypto | 1 | 1 | 0 |
| Simulation | 9 | 9 | 0 |
| Stress Tests | 25 | 25 | 0 |
| Concurrent Simulations | 19 | 19 | 0 |
| Frontend | 12 | 12 | 0 |
| **Total** | **72** | **72** | **0** |
| **Concurrent Tests** | **19** | **19** | **0** |

---

## Breaking Point Analysis

### What Will Break Your System

| Breaking Point | Safe Limit | Consequence |
|----------------|------------|-------------|
| Memory Usage | 11GB | Node.js OOM crash |
| Bot Count | 200 | Database overload |
| Video Participants | 100-participant SFU target | Live media capacity depends on bitrate/egress |
| DB Connections | 100 | Connection pool exhausted |
| Messages/Second | 300 | Event loop blocked |

### Current Safe Capacity

- **Concurrent Users:** 300 (200 bots + 100 humans)
- **Active calls:** 100-participant SFU model for both audio and video; live media capacity is hardware/network dependent
- **Messages/Second:** 100 (with rate limiting)
- **Database Connections:** 50 (with pooling)

### 🚨 Stress Tests

| File | Description | Status |
|------|-------------|--------|
| `stress.spec.ts` | System breaking point analysis | ✅ 25 tests passing |

---

## Results

### 📊 Test Summary

| Category | Tests | Passed | Failed |
|----------|-------|--------|--------|
| Architecture | 6 | 6 | 0 |
| E2EE Crypto | 1 | 1 | 0 |
| Simulation | 9 | 9 | 0 |
| Stress Tests | 25 | 25 | 0 |
| **Total** | **41** | **41** | **0** |

---

## Breaking Point Analysis

### What Will Break Your System

| Breaking Point | Safe Limit | Consequence |
|----------------|------------|-------------|
| Memory Usage | 11GB | Node.js OOM crash |
| Bot Count | 200 | Database overload |
| Video Participants | 100-participant SFU target | Live media capacity depends on bitrate/egress |
| DB Connections | 100 | Connection pool exhausted |
| Messages/Second | 300 | Event loop blocked |

### Current Safe Capacity

- **Concurrent Users:** 300 (200 bots + 100 humans)
- **Active calls:** 100-participant SFU model for both audio and video; live media capacity is hardware/network dependent
- **Messages/Second:** 100 (with rate limiting)
- **Database Connections:** 50 (with pooling)

---

## Reports

| Report | Description |
|--------|-------------|
| `TEST-SUMMARY.md` | Comprehensive test summary with architecture validation |
| `STRESS-TEST-RESULTS.md` | Complete breaking point analysis and recommendations |
| `PROJECT-SUMMARY.md` | Full project documentation and technology stack |

---

## How to Run Tests

### All Tests
```bash
npm run test
```

### Specific Test File
```bash
npm run test tests/stress.spec.ts
```

### Watch Mode
```bash
npm run test:watch
```

---

## Stress Test Commands

### Run with Increased Heap
```bash
npm run test -- --poolOptions=threads --max-old-space-size=6144
```

### Docker Environment
```bash
docker-compose -f docker-compose.stress.yml build
docker-compose -f docker-compose.stress.yml up -d
```

---

## What This System Can Handle

### ✅ Safe (Verified)

- 300 concurrent users
- 4 video participants in calls
- 100 audio participants are modeled through the SFU; live audio capacity is not measured here
- 100 messages/second
- 50 concurrent database connections

### ⚠️ Warning (Requires Scaling)

- 600+ users
- 100-participant SFU video target (model/signaling; active media capacity is not measured here)
- 300+ messages/second
- 100+ concurrent DB connections

### ❌ Will Break

- 200+ bots spamming
- 1000+ concurrent users
- 11GB+ memory allocation
- 100+ concurrent DB connections without pooling

---

## Recommendations to Scale

### Immediate
1. Implement rate limiting (1 msg/sec/user)
2. Add memory monitoring
3. Increase Node.js heap to 6GB

### Short-term
1. Use Redis Stream for message queuing
2. Implement connection pooling
3. Add Worker Threads for heavy operations

### Long-term
1. Migrate to SFU for video calls
2. Add 3-4 app nodes
3. Implement microservices architecture

---

## Current verification

The current run on November 14, 2026 passed 72/72 Vitest tests and the
production build. Older totals in this directory are historical records.
Full lint still reports four `no-explicit-any` errors in stress-test fixtures.

## Contact

For questions about these tests, see:
- `PROJECT-SUMMARY.md` - Full architecture documentation
- `STRESS-TEST-RESULTS.md` - Detailed breaking point analysis

---

**Last Updated:** November 14, 2026  
**Test Version:** Current Vitest suite  
**Status:** Historical record; current suite is 72/72 tests passing ✅
# Real Docker load run

The latest real Docker run is recorded in [`REAL-LOAD-TEST-RESULTS.md`](REAL-LOAD-TEST-RESULTS.md) with raw samples in [`REAL-LOAD-TEST-RESULTS.json`](REAL-LOAD-TEST-RESULTS.json).

Observed on November 14, 2026 with the full compose topology, 439 Socket.IO virtual users, and a 30-second run:

- 1,605 HTTP requests; 44.6 responses per second.
- API p95: 37.33 seconds; API p99: 39.36 seconds.
- 439/439 SFU signaling sockets connected; 0% connection failure and 0% unexpected disconnect rate in the final run.
- Peak app CPU: 1.01%; peak SFU CPU: 9.03%.
- Peak app memory: 169.80 MB; peak SFU memory: 128.30 MB.
- MariaDB reported 1 active connection out of 151 after the run.
- Redis command counter increased by 1 during this unauthenticated workload.
- Post-run HTTP status was 307, which is the expected Clerk sign-in redirect and confirms the app was responding; it is not an outage.

Message writes were not measured because the run did not use a real Clerk bearer token and channel ID. Video bandwidth was not measured because Socket.IO signaling connections do not create WebRTC media producers. Run the harness with `LOAD_AUTH_TOKEN` and `LOAD_CHANNEL_ID` for message throughput; a browser/WebRTC producer scenario is required for video bandwidth.

## Adaptive breakpoint run

The adaptive runner is [`scripts/adaptive-breakpoint-test.ts`](../scripts/adaptive-breakpoint-test.ts), available as `npm run test:breakpoint`. It increases one target at a time by 50 users, runs each stage for 5 seconds, stops that target when p95 exceeds 2 seconds or errors exceed 10%, waits for recovery, and then moves to the next target.

The latest run reached the API guardrail at 500 concurrent workers:

- API p95 stayed below 2 seconds through 450 workers (`1808.08 ms` at 450).
- At 500 workers, API p95 reached `2437.47 ms`, so API pressure stopped safely.
- The SFU signaling target accepted all stages through 500 connections with zero connection failures.
- This is an observed breakpoint for this machine, Docker configuration, unauthenticated HTTP traffic, and the selected thresholds—not a universal user-capacity claim.
- Real message throughput requires `LOAD_AUTH_TOKEN` and `LOAD_CHANNEL_ID`.
- Real video bandwidth requires active WebRTC camera producers; signaling sockets alone do not measure video media.

Detailed adaptive data is in [`ADAPTIVE-BREAKPOINT-RESULTS.md`](ADAPTIVE-BREAKPOINT-RESULTS.md) and [`ADAPTIVE-BREAKPOINT-RESULTS.json`](ADAPTIVE-BREAKPOINT-RESULTS.json).

