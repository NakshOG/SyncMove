# SyncMove

A desktop-first, zero-knowledge E2EE video chat and messaging platform built with Next.js 16, WebRTC, and Signal Protocol.

## Features

- **End-to-End Encryption** - All messages, calls, and files are encrypted client-side. Private keys never leave the device.
- **Signal Protocol** - X3DH key exchange + Double Ratchet for forward secrecy
- **Group Encryption** - Sender Keys for efficient O(1) group messaging
- **Secure File Sharing** - Compress-then-encrypt workflow before upload
- **WebRTC Video/Audio Calls** - DTLS-SRTP enforced, TURN support for NAT traversal
- **Socket Security** - Clerk authentication, heartbeat, rate limiting, flood detection
- **Zero-Knowledge Architecture** - Server cannot decrypt any user communications

## Tech Stack

- **Frontend**: Next.js 16, React, TailwindCSS, Lucide Icons
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: MariaDB
- **Auth**: Clerk
- **File Storage**: UploadThing
- **Real-time**: Socket.IO
- **WebRTC**: Native browser APIs with Coturn TURN server
- **Encryption**: Web Crypto API (X3DH, Double Ratchet, AES-GCM)

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design documentation.

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Docker Deployment (Recommended)

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Configure your environment variables in .env
#    - Database credentials
#    - Clerk authentication keys
#    - UploadThing credentials
#    - TURN server credentials

# 3. Start all services (app, database, TURN server)
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d

# 4. Access the application
#    http://localhost:3000
```

### Manual Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start database (MariaDB)
docker run -d --name syncmove-db \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=syncmove \
  mariadb:10.11

# Run database migrations
npx prisma db push

# Start development server
npm run dev
```

### TURN Server Setup

For WebRTC calls to work behind firewalls/NAT:

```bash
# Coturn is included in docker-compose.override.yml
# Just ensure NEXT_PUBLIC_TURN_* variables are set in .env

# Or run standalone:
docker-compose -f docker-compose.coturn.yml up -d
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | MySQL connection string | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key | Yes |
| `CLERK_SECRET_KEY` | Clerk secret key | Yes |
| `UPLOADTHING_SECRET` | UploadThing secret key | Yes |
| `UPLOADTHING_APP_ID` | UploadThing app ID | Yes |
| `UPLOADTHING_TOKEN` | UploadThing API token | Yes |
| `NEXT_PUBLIC_TURN_SERVER_URL` | TURN server URL | No |
| `NEXT_PUBLIC_TURN_USERNAME` | TURN username | No |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | TURN credential | No |

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── keys/          # E2EE key bundle endpoints
│   │   ├── messages/      # Message API
│   │   ├── files/         # Encrypted file uploads
│   │   └── socket/        # Socket.IO server
│   └── (routes)/          # Page routes
├── components/
│   ├── chat/              # Call room, chat UI
│   ├── providers/         # Socket, E2EE contexts
│   ├── modals/            # UI modals
│   └── navigation/        # Navigation components
├── lib/
│   ├── e2ee/              # Encryption implementations
│   │   ├── x3dh.ts        # Key exchange
│   │   ├── double-ratchet.ts
│   │   ├── sender-key.ts  # Group encryption
│   │   └── key-storage.ts # IndexedDB storage
│   └── *.ts               # Utility libraries
├── prisma/
│   └── schema.prisma      # Database schema
├── docker-compose.yml     # Main compose (app + db)
├── docker-compose.override.yml  # App + Coturn
├── docker-compose.coturn.yml    # Coturn TURN server
└── Dockerfile             # Application container
```

## Security Model

### End-to-End Encryption

```
Alice → Bob: Encrypted with Bob's public key
Server: Cannot decrypt (no access to private keys)
```

### Key Storage

- Identity keys: IndexedDB (never localStorage)
- Session state: Encrypted, stored locally
- Private keys: Never transmitted, generated client-side

### Protocol Stack

1. **Key Exchange**: X3DH (Extended Triple Diffie-Hellman)
2. **Message Encryption**: Double Ratchet Algorithm
3. **Group Encryption**: Sender Key distribution
4. **File Encryption**: AES-GCM-256 (after compression)
5. **Transport**: WebRTC DTLS-SRTP, HTTPS/TLS

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [TODO.md](TODO.md) - Development tracking
- [papers/ZeroKnowledgeE2EEArchitecture.md](papers/ZeroKnowledgeE2EEArchitecture.md) - E2EE design reference

## License

MIT