# Mediasoup SFU runtime

## What Changed

### SFU-only media

**Before (P2P Mesh):**
- Each user connects to every other user
- Bandwidth: O(N²) - 6 participants = 1.92 Mbps, 8 video = 84 Mbps
- Historical mesh rooms became expensive at small participant counts

**After (Mediasoup SFU):**
- Each user connects to SFU server
- Client upload is O(1) per producer; SFU egress grows with subscriptions
- Current simulation target: 100 participants; actual capacity depends on SFU CPU, bitrate, egress, and network

## Files Created

| File | Purpose |
|------|---------|
| `lib/mediasoup-client.ts` | Mediasoup client utilities |
| `lib/mediasoup.ts` | Mediasoup server utilities |
| `server/mediasoup-server.ts` | WebSocket signaling server for SFU |
| `app/api/calls/route.ts` | API routes for SFU transport creation |
| `docker-compose.sfu.yml` | Docker configuration with Mediasoup |

## Updated Files

| File | Changes |
|------|---------|
| `components/chat/call-room.tsx` | Converted to use `@mediasoup/client` |
| `.env.example` | Added `NEXT_PUBLIC_MEDIASOUP_URL` |

## How to Run

### Start SFU Architecture
```bash
docker compose -f docker-compose.sfu.yml up -d --build
```

### View Logs
```bash
docker-compose -f docker-compose.sfu.yml logs -f
```

### Stop
```bash
docker-compose -f docker-compose.sfu.yml down
```

## Architecture

```
User → NGINX (Port 80) → [App Node 1:3001, App Node 2:3002]
                                      ↓
                          Redis (Port 6379)
                                      ↓
                    [MariaDB Primary:3307] ↔ [MariaDB Replica:3308]
                                      ↓
                           Mediasoup SFU:3333
                                      ↓
                         WebSocket signaling
                                      ↓
                         WebRTC media via SFU
```

## SFU Server Configuration

The Mediasoup SFU server runs on port 3333 and handles:
- Transport creation (WebRTC connections)
- Producer/Consumer management (media streams)
- Signaling (offer/answer/candidate exchange)

## Scaling

### Current (Single SFU Node)
- **Audio Participants:** 100-participant simulation target
- **Video Participants:** 100-participant simulation target
- **Measured media capacity:** Requires active WebRTC producer load; signaling-only tests do not establish it

### For More Users
Add more SFU nodes behind a load balancer and configure Redis for session sharing.

## Migration Notes

1. **No TURN/P2P fallback:** the SFU is the only media route.
2. **WebRTC changed:** uses SFU signaling and producer/consumer transports.
3. **API Updated:** `/api/calls` endpoint for transport/producer management

## Troubleshooting

### SFU Server Not Starting
Check logs: `docker logs syncmove-sfu`

### Can't Connect to Call
1. Verify SFU is running: `docker ps | grep syncmove-sfu`
2. Check port 3333 and UDP ports `40000-40099` are accessible
3. Verify network: `docker network inspect syncmove-network`

### Media Not Working
1. Check browser console for WebRTC errors
2. Check `docker compose -f docker-compose.sfu.yml logs -f mediasoup-sfu`
3. Confirm `NEXT_PUBLIC_MEDIASOUP_URL=ws://localhost:3333` for browser access

## Benefits

1. **Scalability:** Support 100+ participants vs 6-8
2. **Bandwidth:** O(N) vs O(N²) complexity
3. **Reliability:** Centralized media routing
4. **Features:** Easier to add recording, streaming, etc.

## Next Steps

1. Test the call functionality
2. Monitor SFU server resources
3. Consider adding recording/streaming features
4. Plan horizontal scaling for 500+ users

## Current local configuration

- SFU endpoint: `ws://localhost:3333`
- RTP/RTCP UDP range: `40000-40099`
- No P2P, public STUN, TURN, or Coturn configuration
- Compose file: `docker-compose.sfu.yml`
