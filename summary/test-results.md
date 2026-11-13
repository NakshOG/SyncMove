# Test Results Summary

## Automated verification

Executed:

```bash
npm test
```

Result:

- 3 test files passed
- 14 tests passed
- 0 failed
- exit code 0

## Test breakdown

- architecture.spec.ts: 5 tests passed
- simulation.spec.ts: 8 tests passed
- e2ee-crypto.spec.ts: 1 test passed

## Stress and simulation metrics

These are the concrete values enforced by the current simulation logic, including the audio/video checks now covered in Vitest:

- shared-room burst: 12 users × 8 messages = 96 unique message events
- room ordering check: 4 users × 25 rounds = 100 messages in one channel
- active-user model: 60 bots + 150 humans = 210 active users
- fan-out model: 3 rooms × 7 senders = 21 unique fan-out events
- target burst model: 50 users × 60 messages in 5 seconds = 3,000 total messages
- average target throughput: 3,000 / 5 = 600 messages/sec
- audio mesh model: 2/4/8/12 peers = 128/768/3,584/8,448 kbps total traffic
- video mesh model: 2/4/8/12 peers = 3/18/84/198 Mbps total traffic

## Audio / video benchmark model

This is a media-room simulation model for the current local deployment, not a live browser benchmark:

- audio model: 64 kbps per participant, mesh topology
- video model: 1.5 Mbps per participant, mesh topology
- 2 audio participants: 128 kbps total mesh traffic
- 4 audio participants: 768 kbps total mesh traffic
- 8 audio participants: 3.584 Mbps total mesh traffic
- 12 audio participants: 8.448 Mbps total mesh traffic
- 2 video participants: 3 Mbps total mesh traffic
- 4 video participants: 18 Mbps total mesh traffic
- 8 video participants: 84 Mbps total mesh traffic
- 12 video participants: 198 Mbps total mesh traffic

Media transport behavior:

- the current WebRTC audio/video path is encrypted in the transport layer using browser-native DTLS-SRTP
- the browser compresses media with codecs such as Opus for audio and VP8/H.264 for video, depending on browser support and hardware negotiation
- this is the correct WebRTC pattern and is the standard way media is protected in transit
- a strict custom app-layer "encrypt media before transport" pipeline is not implemented today; that would be a different architecture that encrypts the media stream itself before it leaves the browser, requiring a dedicated media-encryption layer and key-distribution flow
- the app-level encryption model in this project is applied to text and file payloads, while live WebRTC media uses the standard browser transport security model

Per-payload compression and encryption model:

- text payloads: UTF-8 encoding + optional gzip/brotli compression + AES-GCM encryption via Web Crypto + X3DH/double-ratchet key negotiation
- file payloads: gzip compression via CompressionStream + AES-GCM with random IV + file key wrapped for recipient delivery
- audio payloads: browser Opus codec compression + DTLS-SRTP protection inside WebRTC
- video payloads: browser VP8/H.264 codec compression + DTLS-SRTP protection inside WebRTC

Practical recommendation:

- audio room: safe for small groups, roughly 2–6 peers
- video room: realistic for roughly 2–8 peers on a local staging setup
- beyond that, actual browser/WebRTC benchmarking is required

## Failure-mode expectations

These are projected from the 2-node + DB + Redis topology and the required HA model, not from live injected-downtime tests:

- one app node down: ~50% of app capacity remains available
- primary DB down: write availability = 0% because there is no automatic promotion in the current stack; writes resume only after manual promotion or failover automation is added
- replica promotion: in a proper failover design, the replica should become primary so writes can continue after a brief recovery window
- replica DB down: read throughput falls by roughly 50%; writes continue on primary
- Redis outage: realtime pub/sub throughput degrades sharply and can approach 0 under burst traffic

## Failover rule

The correct operational rule is:

- without automatic promotion, primary outage = write blocked
- with promotion, writes recover gradually from a degraded state rather than immediately at full capacity

This is the conservative model for the current project until full HA automation and promotion logic are implemented.

## Capacity assumptions for the current system

Host profile:

- 16 GB RAM
- 4–8 CPU cores
- 2 app nodes behind NGINX
- primary + replica MariaDB
- Redis + TURN + app services

Practical limits:

- safe steady-state load: ~200 active users with moderate message traffic
- practical burst ceiling: ~2,000–3,000 messages/sec for short periods
- not recommended: sustained large-scale fan-out or global multi-region scale

## Peak local stress model on this machine

This is a conservative max-use model for a single developer machine running the full local stack under heavy load.

Busy / stressed profile:

- 200 rooms with 20 channels each = 4,000 channels total
- active users capped by the real machine core count and a 210-user local-load model
- 40 DM threads per user = 8,400 DM edges in the modeled active-user set
- 30 concurrent file uploads at medium size
- burst chat traffic: ~3,000 messages/sec across rooms, DMs, and channel fan-out
- Redis pub/sub and Socket.IO fan-out under heavy traffic become the main bottleneck before DB saturation
- media rooms: 2–6 audio peers and 2–8 video peers are the realistic local ceiling

Practical max-use estimate:

- chat + rooms + channels: ~150–200 active users at steady state, 2,000–3,000 messages/sec during short bursts
- direct messages: very good at a few thousand concurrent DM operations per second if Redis and app nodes stay healthy
- uploads: ~20–30 concurrent medium uploads before storage and CPU begin to lag
- rooms/channels: ~200 rooms and ~4,000 total channels is feasible for a local staging setup, but not for global production-scale traffic
- under extreme spam / fan-out: latency rises rapidly, message queues back up, and Redis becomes the first resource to bottleneck
- the repo’s stress test now reads the real local CPU count with `os.cpus().length` so the max-load model follows the actual host rather than a fixed 8-core assumption

This is a max-use model, not a guarantee. The safe target is to operate below the ceiling to leave headroom for CPU spikes, file I/O, and reconnect storms.

## Notes

The current suite is lightweight but meaningful for project-level architecture validation without requiring a full end-to-end backend spin-up.
The simulation layer models realistic message bursts, multiple room fan-out, and conservative server capacity assumptions for staging evaluation.
