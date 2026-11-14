# SyncMove Viva Preparation

This document is based on the current implementation and Git history up to November 14, 2026. Explain what was built, why it was chosen, what failed, and which tradeoff was accepted.

## 30-second summary

SyncMove is a Discord-style real-time communication platform with servers, channels, direct messages, encrypted group messages, encrypted file uploads, presence, audio/video rooms, and a Docker deployment. Text and files are encrypted in the browser before storage. Audio/video uses a Mediasoup SFU rather than browser-to-browser P2P. MariaDB stores durable data, Redis coordinates realtime events and presence, Socket.IO delivers live updates, and NGINX fronts multiple app instances.

## Important presentation rule

Distinguish the target architecture from the measured local prototype. The current run passed 72/72 Vitest tests and the production build. Full lint still reports four `no-explicit-any` errors in stress-test fixtures, so that is an honest limitation to mention.

## Likely viva questions and answers

### What did you build?

I built the pipeline from authentication and server management to realtime messaging, E2EE, encrypted files, presence, and SFU calls. I also created a local Docker topology with NGINX, two app nodes, MariaDB primary and replica services, a failover watcher, Redis, and a Mediasoup SFU.

### Why this technology stack?

Next.js provides the full-stack React application and API routes. TypeScript reduces integration mistakes. Prisma gives typed database access. MariaDB fits relational servers, memberships, channels, and messages. Redis provides shared pub/sub and presence. Socket.IO gives authenticated rooms and reconnect behavior. Mediasoup provides server-routed media without every browser uploading to every other browser. UploadThing provides remote object storage, while encryption happens before upload.

### Why not P2P calls?

P2P upload and connection cost grows with participant count and introduces ICE, STUN, TURN, NAT, and browser compatibility problems. The requirement was no P2P anywhere, so media is routed through the Mediasoup SFU. The current local UDP range is `40000-40099`; no public STUN, TURN, or Coturn path is configured.

### What is the Docker architecture?

```text
Browser
  -> NGINX :80
      -> app-node-1 :3000
      -> app-node-2 :3000
           -> MariaDB primary :3306 for writes
           -> MariaDB replica :3306 for read scaling
           -> Redis :6379 for pub/sub and presence
           -> Mediasoup SFU :3333 + UDP 40000-40099
```

The primary is the source of truth. The replica is for read scaling and failover demonstration; replication lag makes it unsafe as a write source.

### What does Redis do?

Redis is not the permanent message store. MariaDB stores messages. Redis coordinates Socket.IO fan-out between app nodes and tracks online presence with TTL records. The local process emits immediately and Redis forwards to other app nodes. Clients de-duplicate by message ID.

### How does a message reach another user?

The sender encrypts text in the browser and sends the encrypted envelope to `POST /api/messages`. The API stores it in MariaDB and publishes a channel event. Socket.IO sends it to authenticated channel members. The receiver updates local state and decrypts only its recipient entry. Refresh is not required.

### How does group encryption work?

The v2 group envelope creates a fresh X25519 ephemeral key per message. The sender derives a separate shared secret with each member identity key, derives an AES-GCM key with HKDF, and stores one ciphertext entry per profile ID. The receiver selects only its own entry. This avoids mutating unrelated Double Ratchet sessions.

### Why use a separate group envelope?

The original implementation used one-to-one Double Ratchet sessions for a group before a complete handshake delivery protocol existed. That caused missing sending chains, AES-GCM failures, and refresh issues. The group envelope is simpler and reliable for this MVP, but creates one ciphertext per recipient and is not a complete Signal Sender-Key implementation.

### What does zero knowledge mean here?

The server stores public key bundles and encrypted message/file data. Private identity keys stay in browser IndexedDB. The server can route and store ciphertext but does not receive plaintext or private keys. Metadata such as sender, channel, timestamps, file size, and recipient identifiers remains visible.

### What happens after refresh or a year offline?

The durable identity key is loaded from IndexedDB. The app never replaces a valid identity merely because a pre-key is missing; it repairs only the disposable signed pre-key. Sessions are persisted locally and password-protected export/import is available. If site data is cleared or the device changes, the encrypted backup is required. Without the original private key, old ciphertext cannot be recovered by design.

### How are files protected?

The browser encrypts the file with AES-GCM and uploads only the encrypted blob to UploadThing. The file key is encrypted into the group message envelope. Download fetches the encrypted blob, decrypts the wrapped key, decrypts locally, and saves the plaintext file. UploadThing stores ciphertext.

### What UploadThing issue did you solve?

The upload succeeded, but Clerk middleware redirected UploadThing's server callback to `/sign-in`. UploadThing received HTML instead of callback JSON and reported a decode error. The fix exempts only `/api/uploadthing` from the page-level redirect; the UploadThing router still authenticates its own middleware and returns explicit JSON.

### What was the most difficult technology?

E2EE was hardest because key agreement, ratchet state, browser persistence, group fan-out, and realtime timing interact. The lessons were to persist identity keys before publishing public material, never replace them silently, select only the current user's group ciphertext, and separate transport delivery from cryptographic state.

### How did you run the project over a LAN?

Next.js listens on `0.0.0.0:3000`, while NGINX terminates local HTTPS on ports 80 and 443 and proxies the app and `/sfu/socket.io` signaling path. A mkcert certificate covers the LAN IP, and the root CA must be trusted on every client device. Mediasoup advertises the host LAN address instead of `localhost`, exposes signaling on TCP `3333`, and uses UDP `40000-40099` for media. The repeatable commands are documented in `RUN-ON-LAN.md`.

### What LAN problems did you solve?

The main LAN failures were browser certificate trust, Next.js development-origin protection for HMR, Clerk sessions being origin-specific, NGINX pointing at unavailable app upstreams, and the SFU container retaining an old `localhost` environment value. HTTPS also required same-origin WSS signaling through NGINX; otherwise an HTTPS page attempted insecure `ws://` access. The final solution uses `nginx.lan.conf`, `allowedDevOrigins`, the LAN IP in `MEDIASOUP_ANNOUNCED_IP`, and a rebuild when SFU server code changes.

### Why did one video direction fail while audio worked?

The media transport itself was healthy, but producer announcements could race with receive-transport setup. A client could consume audio while missing a later video producer. I fixed this with queued producer announcements, an explicit `call:list-producers` resynchronization after the receive transport is ready, and fresh `MediaStream` objects when tracks are added. This is a good example of why realtime systems need both event delivery and state resynchronization.

### What search limitation did you have to handle?

The server cannot search plaintext inside encrypted messages. Channel search therefore fetches recent messages, establishes the E2EE session, decrypts locally, excludes deleted messages, and matches the plaintext in the browser. Direct-message search is different: it searches only the other participant's profile name, not the current user's name, so every conversation is not accidentally returned.

### How did you make notification controls correct?

Browser permission and an application preference are different states. The bell now stores a local preference and controls both desktop notifications and the incoming-message sound. Disabling the bell works even when the browser permission had previously been granted; the app cannot revoke OS permission programmatically, but it can stop using it.

### What would you say if asked about remaining limitations?

The LAN certificate is local trust infrastructure, not a public production certificate. E2EE metadata remains visible, encrypted search currently covers the fetched recent-message window, and large groups duplicate ciphertext per recipient. The stress numbers are simulations rather than capacity guarantees. Lint still reports four `no-explicit-any` errors in stress fixtures, although the test suite and production build pass.

## Tradeoffs

| Decision | Benefit | Cost |
|---|---|---|
| SFU instead of P2P | Predictable group media routing | SFU bandwidth and CPU |
| Per-recipient group envelope | Simple receiver decryption | Ciphertext grows with members |
| IndexedDB private keys | Refresh and offline persistence | Clearing site data loses access |
| Password backup | Device recovery without server plaintext | User must protect the password |
| Redis pub/sub | Cross-node realtime delivery | Additional service and failure mode |
| MariaDB replica | Read scaling demonstration | Replica lag and failover complexity |
| UploadThing | Managed remote storage | External dependency and callback contract |

## Compute, storage, and improvement

The test environment had 16 logical CPU processors and about 15.64 GB RAM. The stress suite measured approximately 28,334 E2EE operations per second in its crypto benchmark. The concurrent suite included a 60-second simulation, 1,000 WebSocket connections, 100 concurrent database queries, 100 concurrent uploads, and SFU audio/video scenarios.

These are simulation measurements, not production capacity guarantees. Actual limits depend on payload size, browser hardware, network, database configuration, SFU bitrate, and Redis latency. Encryption and file processing are mostly client-side; the server stores ciphertext and routes events/media.

Future improvements are Web Workers for large-file encryption, chunked/resumable encryption, a fully reviewed Sender-Key protocol for large groups, database pool metrics, durable Redis Streams for burst queues, and horizontally scaled SFU workers.

## Testing and viva workflow

Run:

```powershell
npm test
npm run lint
npm run build
```

Current result: 6 Vitest files and 72 tests passed; production build passed; lint has four existing test-fixture errors.

For a minimal demonstration, use one terminal for the app and another for Prisma Studio:

```powershell
# Terminal 1
npm run dev

# Terminal 2
npx prisma studio
```

Start required backing services separately if stopped:

```powershell
docker start syncmove-db-primary syncmove-redis syncmove-sfu
```

For the full topology:

```powershell
docker compose -f docker-compose.sfu.yml up -d --build
```

To show resource usage, sample Windows processes every five seconds:

```powershell
Get-Process node,docker -ErrorAction SilentlyContinue |
  Select-Object Name,Id,CPU,WorkingSet64
```

Export samples to CSV and graph CPU seconds and working-set MB. Label it “local simulation resource usage,” not system capacity. The existing tests print throughput and duration; OS sampling adds the CPU/RAM graph.

## Git-history narrative

1. The database and NGINX topology was restored and documented.
2. Docker startup and failover scripts were checked.
3. The call path was migrated to Mediasoup SFU.
4. File upload, preview, server-image, and message UI issues were fixed.
5. E2EE key bundles, group envelopes, key persistence, and backups were hardened after browser failures.
6. Realtime fan-out was corrected for authenticated channel joins and local plus Redis delivery.
7. Documentation and test results were updated to match the current implementation.

## Closing answer

“The main engineering goal was to keep the user experience realtime while ensuring message and file plaintext never leaves the browser. The biggest tradeoff was replacing fragile group Double Ratchet setup with a versioned per-recipient group envelope, which is less bandwidth-efficient but reliable for this prototype. I preserved durable identity keys locally, used encrypted backups for recovery, routed calls through an SFU, and used Redis for coordination rather than as the message source of truth.”

