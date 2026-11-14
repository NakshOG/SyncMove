# SyncMove Study Guide

This guide is written for someone seeing the project for the first time. It explains what happens when a user opens SyncMove, sends a message, uploads a file, joins a call, or opens the application over a LAN.

## Short visual study plan

Use these short YouTube resources before reading the matching section. Most are intended as approximately 4–8 minute visual introductions; YouTube runtimes and availability can change. The search links are deliberate: they keep the study material useful if a creator changes or removes a specific upload.

| Topic | Watch | Connect it to SyncMove |
|---|---|---|
| Docker and Compose | [Docker explained in 5 minutes](https://www.youtube.com/watch?v=mspEJzb8LC4) | Images, containers, Dockerfile, Compose services, and the local stack. |
| NGINX reverse proxy | [YouTube visual search: NGINX reverse proxy](https://www.youtube.com/results?search_query=NGINX+reverse+proxy+explained+animation+5+minutes) | TLS termination, LAN entry point, app load balancing, and WebSocket upgrade headers. |
| MariaDB replication | [YouTube visual search: MySQL/MariaDB replication](https://www.youtube.com/results?search_query=MySQL+MariaDB+replication+explained+animation+5+minutes) | Primary writes, replica reads, binary logs, and failover. |
| Redis pub/sub | [YouTube visual search: Redis pub/sub](https://www.youtube.com/results?search_query=Redis+pubsub+explained+visual+5+minutes) | Cross-process presence and realtime event fan-out between app nodes. |
| WebSockets | [YouTube visual search: WebSockets explained](https://www.youtube.com/results?search_query=WebSockets+explained+animation+5+minutes) | Persistent realtime connections, message events, online status, and reconnects. |
| Socket.IO | [YouTube visual search: Socket.IO explained](https://www.youtube.com/results?search_query=Socket.IO+explained+beginner+visual+5+minutes) | Rooms, acknowledgements, connection events, and server-side broadcasts. |
| WebRTC fundamentals | [YouTube visual search: WebRTC explained animation](https://www.youtube.com/results?search_query=WebRTC+explained+animation+5+minutes) | Browser media capture, transports, producers, consumers, and encrypted media. |
| SFU versus P2P | [YouTube visual search: SFU versus mesh WebRTC](https://www.youtube.com/results?search_query=WebRTC+SFU+versus+mesh+explained+animation) | Why SyncMove routes calls through Mediasoup and avoids browser-to-browser P2P. |
| End-to-end encryption | [YouTube visual search: end-to-end encryption animation](https://www.youtube.com/results?search_query=end+to+end+encryption+explained+animation+5+minutes) | Why the server stores ciphertext while clients encrypt and decrypt. |
| X25519 and X3DH | [YouTube visual search: X3DH and X25519 explained](https://www.youtube.com/results?search_query=X3DH+X25519+explained+visual) | Identity keys, signed pre-keys, one-time pre-keys, and session establishment. |
| Double Ratchet | [YouTube visual search: Signal Double Ratchet explained](https://www.youtube.com/results?search_query=Signal+Double+Ratchet+explained+animation) | Per-message key evolution, forward secrecy, and why sessions must persist. |
| AES-GCM | [YouTube visual search: AES GCM explained](https://www.youtube.com/results?search_query=AES-GCM+explained+visual+5+minutes) | Authenticated encryption for message and file payloads. |
| Compression | [YouTube visual search: lossless and lossy compression](https://www.youtube.com/results?search_query=lossless+lossy+compression+explained+animation+5+minutes) | Why text, images, audio, and video have different storage and bandwidth tradeoffs. |
| Load testing | [YouTube visual search: p95 p99 load testing](https://www.youtube.com/results?search_query=p95+p99+load+testing+explained+visual+5+minutes) | How to read the adaptive breakpoint results and latency percentiles. |

Suggested order: Docker → NGINX → database/Redis → WebSockets/Socket.IO → WebRTC/SFU → E2EE → compression → load testing.

The most useful way to study the project is to follow one request through the system:

```text
Browser
  -> HTTPS / WebSocket through NGINX
  -> Next.js application
  -> Prisma
  -> MariaDB

Realtime events: Next.js <-> Socket.IO <-> Redis pub/sub <-> other app nodes
Calls: Browser <-> NGINX signaling <-> Mediasoup SFU <-> Browser media
Files: Browser encrypts -> UploadThing stores ciphertext -> Browser decrypts
```

## 1. The vocabulary first

### Client and server

The **client** is the code running in the browser. It renders the interface, reads the camera and microphone, encrypts messages, decrypts messages, and holds private keys.

The **server** is the code running on the machine or in Docker. It authenticates requests, checks permissions, stores ciphertext and metadata, broadcasts events, and routes media. It should not need message plaintext for normal operation.

### HTTP request

HTTP is request/response communication:

```text
Browser: POST /api/messages
Server:  201 Created + saved message
```

It is good for loading history, creating database records, uploading metadata, and changing settings.

### WebSocket

A WebSocket is a long-lived two-way connection. After the initial HTTP upgrade, either side can send an event at any time:

```text
Browser ---------------- persistent connection ---------------- Server
        message-event, presence, typing, call signaling
```

SyncMove uses Socket.IO. Socket.IO provides rooms, acknowledgements, reconnection, event names, and a fallback transport. A Socket.IO connection usually starts with HTTP polling or WebSocket negotiation and can then use a WebSocket transport.

### API versus realtime event

The API is the durable operation; the socket is the fast notification.

For a message:

1. The browser sends the message to the API.
2. The API writes it to MariaDB.
3. Only after the write, the API publishes a realtime event.
4. Other browsers update their screens immediately.
5. A refresh reads the same message from MariaDB.

This prevents Redis or a temporary WebSocket connection from becoming the source of truth.

## 2. Why the stack is divided this way

| Technology | Responsibility | Why it is used |
|---|---|---|
| Next.js + React | UI, server rendering, API routes | One TypeScript application for frontend and backend endpoints |
| TypeScript | Types and contracts | Catches mismatched message, transport, and API shapes |
| Prisma | Database access | Typed queries and migrations for relational data |
| MariaDB | Durable data | Servers, members, channels, messages, conversations, and file metadata |
| Redis | Pub/sub and presence | Fast cross-process event fan-out and short-lived online state |
| Socket.IO | Realtime events | Rooms, reconnect behavior, acknowledgements, and browser delivery |
| NGINX | Reverse proxy and TLS | One LAN entry point, HTTPS, WebSockets, and load balancing |
| Mediasoup | SFU media routing | Server-routed audio/video without browser-to-browser P2P |
| UploadThing | Remote blob storage | Stores the already-encrypted file bytes |
| Clerk | Authentication | User identity and sign-in flow |
| IndexedDB | Browser key storage | Durable client-side private-key and session storage |

Server logos are intentionally different from chat files. A server logo is compressed in the browser, uploaded through the `ServerImage` route, and saved as a normal remote `imageURL` in MariaDB. It is public branding, not private communication, so it is not passed through E2EE. Chat files continue to use the encrypted file workflow.

### Realtime presence in servers and direct messages

Server member lists use server-scoped presence. Direct messages use profile-scoped presence: the client identifies its profile over the authenticated Socket.IO connection, requests the presence of its conversation partners, and receives online/offline updates. Redis stores the shared set of online profiles across app nodes; a local in-memory map is used when Redis is unavailable. Multiple tabs are tracked as separate sockets so one tab closing does not mark the user offline while another remains connected.

### Microphone, speaker, and settings controls

The microphone and speaker controls beside the profile logo publish a shared local browser preference. During a call, the call room applies that preference to the local microphone track/audio producer and to remote audio playback. The deafen control affects playback and also mutes the microphone while enabled. Browser echo cancellation, noise suppression, and automatic gain control are requested, but headphones are still the most reliable way to prevent acoustic echo.

### Key backup and public-key caching

The backup button exports the durable identity key, signed pre-key, and saved session state into a password-encrypted JSON file. PBKDF2 derives an AES-GCM backup-encryption key from the password; the server never receives this backup. Importing restores the keys and sessions into IndexedDB on a new device. A peer's public key bundle is cached locally for five minutes and simultaneous requests for the same peer are deduplicated. This prevents a large group from repeatedly fetching the same bundle while allowing periodic refreshes.

## 3. The complete message algorithm

### Sending a group message

The current group-message design is a versioned per-recipient envelope in `lib/e2ee/group.ts`.

Assume Alice sends `hello` to Alice, Bob, and Carol.

#### Step 1: obtain recipient public keys

Each user has a durable X25519 identity key pair:

```text
Private identity key: stays in the browser
Public identity key: can be uploaded to the key API
```

The server stores public keys and key-bundle metadata. A public key is safe to publish; it is not enough to decrypt a message without the matching private key.

#### Step 2: create one ephemeral X25519 key pair

Alice creates a fresh temporary key pair for this message:

```text
ephemeral private key: used only during encryption
ephemeral public key: included in each encrypted entry
```

Fresh ephemeral keys provide message-level separation. The ephemeral private key is not sent to the server.

#### Step 3: derive one shared secret per recipient

For Bob:

```text
sharedSecretBob = X25519(Alice ephemeral private, Bob identity public)
```

For Carol:

```text
sharedSecretCarol = X25519(Alice ephemeral private, Carol identity public)
```

X25519 is Diffie-Hellman key agreement. Alice and Bob independently arrive at the same 32-byte secret, but an observer who sees only the public keys cannot feasibly calculate it.

#### Step 4: derive an AES key with HKDF

The raw Diffie-Hellman result is not used directly as an AES key. HKDF extracts and expands it:

```text
AES key = HKDF(
  shared secret,
  context = "SyncMoveGroupMessageV2|recipientId|ephemeralPublicKey",
  output length = 32 bytes
)
```

The context is domain separation. A key derived for Bob's group message is not accidentally reused as a key for a different protocol purpose.

#### Step 5: encrypt with AES-256-GCM

AES-GCM provides two properties:

- **Confidentiality:** the plaintext is hidden.
- **Authentication/integrity:** modifying the ciphertext causes decryption to fail.

For each recipient, SyncMove creates a fresh 12-byte random IV and encrypts:

```text
ciphertext = AES-GCM-Encrypt(
  key,
  random 12-byte IV,
  plaintext = "hello",
  AAD = version | recipientId | ephemeralPublicKey
)
```

AAD means Additional Authenticated Data. It is not encrypted, but it is authenticated. If an attacker changes the recipient ID or ephemeral key in the envelope, the AES-GCM tag check fails.

#### Step 6: build the envelope

Conceptually the stored JSON looks like this:

```json
{
  "v": 2,
  "type": "group",
  "senderId": "alice",
  "encrypted": [
    {
      "userId": "alice",
      "ephemeralPublicKey": "...",
      "iv": "...",
      "ciphertext": "..."
    },
    {
      "userId": "bob",
      "ephemeralPublicKey": "...",
      "iv": "...",
      "ciphertext": "..."
    },
    {
      "userId": "carol",
      "ephemeralPublicKey": "...",
      "iv": "...",
      "ciphertext": "..."
    }
  ]
}
```

The server stores and forwards this envelope without understanding `hello`.

### Receiving a group message

Bob performs the reverse:

1. Parse the envelope.
2. Select the entry whose `userId` is Bob.
3. Decode the ephemeral public key and IV.
4. Calculate `X25519(Bob identity private, Alice ephemeral public)`.
5. Derive the same AES key with the same HKDF context.
6. Verify and decrypt AES-GCM using the same AAD.
7. Decode the resulting bytes as UTF-8.

If any byte, key, IV, recipient ID, or AAD value is wrong, AES-GCM rejects the message. This is why the UI must show a controlled decryption failure rather than raw ciphertext.

### Direct-message Double Ratchet path

Direct peer sessions also contain a Double Ratchet implementation. It is based on two cooperating ratchets:

#### Symmetric-key ratchet

Each direction has a chain key. For every message:

```text
messageKey = HMAC/HKDF(chainKey, "message")
nextChainKey = HMAC/HKDF(chainKey, "chain")
```

The message key is used once and the chain advances. If someone later obtains the current chain state, previously erased message keys are not automatically recovered. This is forward secrecy for the symmetric chain.

#### Diffie-Hellman ratchet

Participants periodically create fresh X25519 DH keys. A new DH result is combined with the root key to create a new root key and new sending/receiving chains:

```text
dhOutput = X25519(local new private, remote current public)
newRoot, newChain = HKDF(dhOutput, oldRoot, ratchet context)
```

This gives post-compromise recovery after a fresh DH exchange, assuming the attacker no longer controls the endpoint.

#### Message headers

The Double Ratchet header contains the current DH public key, previous chain length, and message number. The header is sent in the encrypted-message structure and is authenticated as AES-GCM AAD. It lets the receiver detect chain changes and message ordering.

#### Skipped messages

Networks can reorder packets. The receiver can derive and cache a bounded number of skipped message keys so a late message can still decrypt. SyncMove limits skipped-message recovery with `MAX_SKIP` to avoid unbounded memory use.

#### Why the group path is separate

The original group attempt tried to use independent Double Ratchet sessions before a complete handshake and session-delivery protocol existed. That caused missing sending chains, missing sessions after refresh, and AES-GCM failures. The current group v2 envelope is less bandwidth-efficient but easier to make deterministic: every recipient gets an explicit entry.

## 4. X3DH and key management

### X3DH purpose

X3DH creates an initial shared secret even when the other person is offline. A user publishes a bundle containing public material such as:

- Identity public key.
- Signed pre-key.
- Signature over the signed pre-key.
- Optional one-time pre-key.

The initiator fetches the bundle, verifies the signature, performs the required X25519 operations, and derives initial key material with HKDF.

### Why keys must persist

If a browser generates a new identity key after every refresh, old messages were encrypted to an identity that no longer exists locally. SyncMove therefore stores the identity key in IndexedDB and repairs disposable pre-key material without replacing the identity.

### Recovery

The server cannot restore a private key. An encrypted password-protected key backup can be exported and imported on another device. If IndexedDB is cleared and no backup exists, old ciphertext is intentionally unrecoverable.

## 5. AES-GCM in detail

AES is a symmetric block cipher. The same secret key is used to encrypt and decrypt. GCM turns AES into an authenticated encryption mode.

```text
plaintext + key + unique IV + AAD
        -> ciphertext + authentication tag
```

Important rules:

1. Use a strong random key.
2. Never reuse an IV with the same key.
3. Use a 12-byte IV for the standard Web Crypto AES-GCM path.
4. Verify the authentication tag before trusting plaintext.
5. Authenticate important unencrypted metadata with AAD.

SyncMove uses 256-bit AES keys. Web Crypto returns ciphertext with the GCM authentication tag attached. A changed ciphertext or wrong key results in an `OperationError`.

## 6. File encryption and compression

### Correct order: compress, then encrypt

The file path follows:

```text
Original file bytes
  -> gzip compression
  -> AES-GCM encryption
  -> UploadThing remote storage
```

Decryption reverses it:

```text
Encrypted blob
  -> AES-GCM decryption
  -> gzip decompression
  -> original file bytes
  -> browser download
```

Compression must happen before encryption because encryption makes data look random. Random-looking ciphertext has almost no repeated patterns, so gzip or Brotli cannot compress it effectively.

### Gzip

Gzip is a lossless compression format. It finds repeated byte sequences and represents them more compactly. It is useful for text, JSON, and many uncompressed documents. It usually helps less for JPEG, PNG, WebP, MP4, ZIP, and already-compressed formats.

### Brotli

Brotli is another lossless algorithm. It can be better than gzip for some text, but browser support is checked at runtime through `CompressionStream`. The generic compression utility falls back to gzip if Brotli is unavailable.

### Compression ratio

The guide uses:

```text
ratio = 1 - compressedSize / originalSize
```

For example, a 1000-byte file compressed to 600 bytes has a 40% reduction. A compressed file larger than the input should use the original bytes instead of pretending compression helped.

### File key wrapping

A file uses a random AES-GCM file key. That key must be shared with authorized recipients without exposing it to the storage provider. The file key is therefore wrapped/encrypted into the E2EE message metadata for the channel. The blob and the wrapped key are separate:

```text
UploadThing: encrypted file blob
Message: encrypted file metadata + recipient-specific wrapped file key
```

The download button fetches the encrypted blob, decrypts the wrapped key through the channel session, decrypts the file locally, decompresses it, and creates a browser download URL.

### What remains visible

Even with encrypted files, the storage service can usually see object size, upload time, URL/key, and traffic metadata. It cannot see the plaintext bytes if the client encryption is correct.

## 7. Database and Prisma

### Why MariaDB

SyncMove has relational data:

```text
Profile -> Member -> Server
Server -> Channel
Channel -> Message
Profile pairs -> Conversation -> DirectMessage
```

Foreign keys and relational queries are a natural fit. A document store would make membership and permission relationships harder to enforce consistently.

### Why Prisma

Prisma provides a typed client. Instead of constructing SQL strings manually, code uses operations such as:

```ts
db.message.findMany({ where: { channelId } })
db.message.create({ data: { content, channelId, memberId } })
```

The database still performs the query; Prisma generates and validates the SQL interaction.

### Primary and replica

The primary accepts writes. The replica replays changes for read scaling or failover demonstrations.

```text
Write -> primary -> replication log -> replica
Read  -> primary or replica depending on consistency requirement
```

A replica can lag. Immediately after a user sends a message, a read from the replica may not see it yet. That is why the primary remains the source of truth for write-after-read behavior.

### Message search

For non-encrypted content, the API can use a database substring filter. For encrypted content, the database sees ciphertext, not plaintext. The client fetches a recent window, establishes the E2EE session, decrypts locally, excludes deleted messages, and searches plaintext in memory.

## 8. Redis and presence

### Redis is not the message database

MariaDB stores durable messages. Redis handles fast, temporary coordination:

- Pub/sub between app processes.
- Presence and heartbeat TTL records.
- Cross-node realtime fan-out.

### Cross-node event flow

Suppose a user is connected to app node 1 and another user is connected to app node 2:

```text
API on node 1
  -> save message in MariaDB
  -> emit locally to node 1 sockets
  -> publish event to Redis
  -> node 2 Redis subscriber receives event
  -> node 2 emits to its sockets
```

The client de-duplicates by message ID because a local emit and a Redis-forwarded emit can otherwise represent the same logical event.

### Online status

The client sends heartbeat activity. The server stores a short-lived presence record. If heartbeats stop, the record expires, which prevents a crashed browser from remaining online forever.

Redis is fast but not the permanent audit trail. If a presence record expires, it can be recomputed from active sockets and heartbeats.

## 9. Socket.IO and WebSockets

### Rooms

The server places sockets into logical rooms:

```text
channel:<channelId>
conversation:<conversationId>
server:<serverId>
call:<roomId>
```

An event can then be emitted only to the people who should receive it.

### Acknowledgements

Call signaling uses request/ack events:

```text
client emits call:create-transport + payload
server performs async operation
server calls acknowledgement with result or error
client resolves or rejects a Promise
```

A timeout is important because a missing server response must not leave the UI waiting forever. The call UI now labels the event that timed out.

### Reconnect and resynchronization

Realtime events are not enough by themselves. A client can disconnect or miss an event during setup. Therefore the application combines:

1. Durable API loading after connection.
2. Live Socket.IO events.
3. Polling fallback in selected screens.
4. Producer resynchronization for calls.
5. Message-ID de-duplication.

This is a general realtime design principle: use events for speed and state synchronization for correctness.

## 10. NGINX

NGINX is the front door. The browser uses one origin:

```text
https://172.31.124.88
```

NGINX then routes internally:

```text
/                         -> Next.js app
/api/socket/io            -> Next.js Socket.IO endpoint
/sfu/socket.io            -> Mediasoup Socket.IO signaling
```

### TLS termination

The browser speaks HTTPS to NGINX. NGINX reads the local certificate and forwards traffic to the app. For a development LAN, mkcert creates a local CA and a certificate for the IP. Every client device must trust the CA or the browser will show certificate warnings and may treat the context as insecure.

### WebSocket proxying

WebSockets need upgrade headers:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

Without these, normal HTTP pages may work while Socket.IO and SFU signaling fail.

### One or two app instances

With one app instance, NGINX forwards everything to that instance. With two, it can load-balance. Shared Redis and MariaDB are required so both app nodes see the same events and durable data.

NGINX cannot make a stopped upstream healthy. Its upstream configuration must match the services that are actually running.

## 11. Mediasoup SFU calls

### Why an SFU instead of P2P

In P2P mesh video, every browser sends media to every other browser. With `n` participants, each client can require roughly `n - 1` outgoing media paths. Upload bandwidth grows quickly.

An SFU uses a hub:

```text
Alice -> SFU -> Bob
Alice -> SFU -> Carol
Bob   -> SFU -> Alice
```

The SFU forwards encoded RTP media. It does not normally transcode every stream, so it is cheaper than a full MCU, while avoiding browser mesh upload growth.

### Signaling versus media

Socket.IO signaling negotiates:

- Router RTP capabilities.
- Send and receive transports.
- DTLS parameters.
- Producers.
- Consumers.

The actual audio/video packets use WebRTC transports and the Mediasoup UDP port range. Signaling being connected does not guarantee media is flowing.

### Call sequence

1. Browser opens secure Socket.IO signaling through NGINX.
2. Client sends `call:join`.
3. Server returns router RTP capabilities and current producers.
4. Client loads a Mediasoup `Device`.
5. Client creates a send transport.
6. Client creates a receive transport.
7. Client publishes microphone and, in a video channel, camera producers.
8. Client consumes existing producers.
9. New producer events are queued if setup is still in progress.
10. Client calls `call:list-producers` after the receive transport is ready to close event-race gaps.
11. Consumers are resumed after their tracks are attached to a fresh `MediaStream`.

### Why the LAN IP matters

The SFU must advertise an address other devices can reach. If it advertises `localhost`, each browser tries to connect to itself. This caused call timeouts until `MEDIASOUP_ANNOUNCED_IP=172.31.124.88` was applied.

### Echo

The microphone requests echo cancellation, noise suppression, and automatic gain control. These are useful but not magic. If speakers are loud, the microphone can still capture the remote user. Headphones are the reliable physical solution; the deafen control can stop remote playback.

## 12. Authentication and authorization

Clerk identifies the signed-in user. Server routes still verify that the user belongs to the requested server, channel, or conversation.

Authentication asks:

```text
Who is this user?
```

Authorization asks:

```text
Is this user allowed to access this channel or message?
```

Both are needed. A valid Clerk session should not let a user read an arbitrary channel ID.

LAN note: `localhost` and `https://172.31.124.88` are different browser origins, so a user may need to sign in again on the LAN address.

## 13. UploadThing callback lesson

The browser upload and the server callback are different requests. The file could upload successfully while the callback failed because middleware redirected the callback to a sign-in page. The callback receiver expected JSON but received HTML, producing a decode error.

The fix was to exempt the UploadThing callback path from the generic page redirect while retaining UploadThing's own authentication and returning explicit JSON.

General lesson: when an external service calls a webhook, do not assume browser authentication middleware is appropriate for that server-to-server request.

## 14. Security model and limits

### Protected

- Message plaintext is encrypted in the browser.
- File bytes are compressed and encrypted before remote upload.
- Private identity keys remain client-side.
- AES-GCM detects tampering.
- X25519 prevents the server from deriving recipient shared secrets.

### Still visible to the server or infrastructure

- User and profile identifiers.
- Membership and channel relationships.
- Message timestamps and sizes.
- File object size and storage metadata.
- IP addresses and connection timing.
- Presence and call participation.

This is metadata privacy, not complete traffic-analysis resistance.

## 15. How to explain the design in a viva

Use this order:

1. Start with the user problem: realtime communication, durable messages, encrypted text/files, and group calls.
2. Explain the durable path: Next.js API -> Prisma -> MariaDB.
3. Explain the fast path: Socket.IO -> Redis pub/sub -> connected clients.
4. Explain encryption: X25519 key agreement -> HKDF -> AES-GCM envelope.
5. Explain media: Socket.IO signaling -> Mediasoup SFU, no P2P.
6. Explain deployment: NGINX HTTPS entry point, app nodes, Redis, database, SFU.
7. Explain the hardest failures and what evidence fixed them.
8. State tradeoffs and limitations honestly.

### One-minute answer

“SyncMove separates durable state from realtime delivery. MariaDB is the source of truth, Prisma provides typed access, Redis distributes events and presence across app nodes, and Socket.IO delivers them to room members. Text and files are encrypted in the browser: X25519 derives shared secrets, HKDF derives AES keys, and AES-GCM provides confidentiality and integrity. Group messages use a versioned per-recipient envelope so each member has an explicit ciphertext entry. Calls use Mediasoup as an SFU, with signaling through secure Socket.IO and media on the announced LAN address and restricted UDP range. NGINX terminates HTTPS and proxies both application and WebSocket traffic. The main tradeoffs are SFU bandwidth, per-recipient group ciphertext size, browser key recovery, and the visibility of metadata.”

## 16. Useful commands

```powershell
# Tests and build
npm test
npm run build

# Minimal development services
docker start syncmove-db-primary syncmove-redis syncmove-sfu
npm run dev -- --hostname 0.0.0.0

# LAN NGINX
$env:NGINX_CONFIG = "./nginx.lan.conf"
docker compose -f docker-compose.sfu.yml up -d --no-deps nginx

# Check the SFU LAN address
docker inspect syncmove-sfu --format '{{range .Config.Env}}{{println .}}{{end}}' | Select-String MEDIASOUP

# Open Prisma Studio
npx prisma studio
```

For the complete LAN sequence, see [`RUN-ON-LAN.md`](RUN-ON-LAN.md).
