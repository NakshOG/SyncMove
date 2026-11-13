import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import * as mediasoup from "mediasoup";
import type { types } from "mediasoup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Participant = { id: string; name: string; imageUrl: string; socketId: string };

type Peer = {
  participant: Participant;
  transports: Map<string, types.WebRtcTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
};

type Room = {
  router: types.Router;
  peers: Map<string, Peer>; // keyed by socket.id
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = Number(process.env.MEDIASOUP_PORT ?? 3333);
const ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP ?? "127.0.0.1"; // your LAN/public IP when not on localhost
const RTC_MIN_PORT = Number(process.env.MEDIASOUP_RTC_MIN_PORT ?? 40000);
const RTC_MAX_PORT = Number(process.env.MEDIASOUP_RTC_MAX_PORT ?? 40100);

const mediaCodecs: types.RouterRtpCodecCapability[] = [
  { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
  { kind: "video", mimeType: "video/VP8", clockRate: 90000, parameters: { "x-google-start-bitrate": 1000 } },
];

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// One worker (one CPU core) is plenty for a class project; each room gets its own router.
let worker: types.Worker;
const rooms = new Map<string, Room>();
const roomPromises = new Map<string, Promise<Room>>();

async function getRoom(roomId: string): Promise<Room> {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  // De-dupe concurrent creations of the same room.
  let pending = roomPromises.get(roomId);
  if (!pending) {
    pending = worker.createRouter({ mediaCodecs }).then((router) => {
      const room: Room = { router, peers: new Map() };
      rooms.set(roomId, room);
      roomPromises.delete(roomId);
      return room;
    });
    roomPromises.set(roomId, pending);
  }
  return pending;
}

function requirePeer(socket: Socket): { roomId: string; room: Room; peer: Peer } {
  const roomId = socket.data.roomId as string | undefined;
  const room = roomId ? rooms.get(roomId) : undefined;
  const peer = room?.peers.get(socket.id);
  if (!roomId || !room || !peer) throw new Error("Not in a call");
  return { roomId, room, peer };
}

function broadcastPresence(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("call-presence", [...room.peers.values()].map((p) => p.participant));
}

function cleanupPeer(socket: Socket) {
  const roomId = socket.data.roomId as string | undefined;
  if (!roomId) return;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(socket.id);

  if (room && peer) {
    const producerIds = [...peer.producers.keys()];
    // Closing a transport closes its producers and consumers too.
    peer.transports.forEach((t) => t.close());
    room.peers.delete(socket.id);
    producerIds.forEach((producerId) => io.to(roomId).emit("producer-closed", { producerId }));

    if (room.peers.size === 0) {
      room.router.close();
      rooms.delete(roomId);
    } else {
      broadcastPresence(roomId);
    }
  }

  socket.leave(roomId);
  socket.data.roomId = undefined;
}

// Registers an event whose result is returned to the client through the socket.io ack callback.
function handle<T>(socket: Socket, event: string, fn: (data: T) => Promise<unknown> | unknown) {
  socket.on(event, async (data: T, ack?: (res: unknown) => void) => {
    try {
      const result = await fn(data);
      ack?.(result ?? {});
    } catch (error) {
      console.error(`[${event}]`, error);
      ack?.({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}

// ---------------------------------------------------------------------------
// Signaling
// ---------------------------------------------------------------------------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  handle<{ roomId: string; participant: Omit<Participant, "socketId"> }>(socket, "call:join", async ({ roomId, participant }) => {
    cleanupPeer(socket); // in case of a rejoin
    const room = await getRoom(roomId);

    socket.join(roomId);
    socket.data.roomId = roomId;
    room.peers.set(socket.id, {
      participant: { ...participant, socketId: socket.id },
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    });
    broadcastPresence(roomId);

    const existingProducers: { producerId: string; kind: types.MediaKind; socketId: string }[] = [];
    for (const [peerSocketId, other] of room.peers) {
      if (peerSocketId === socket.id) continue;
      for (const producer of other.producers.values()) {
        existingProducers.push({ producerId: producer.id, kind: producer.kind, socketId: peerSocketId });
      }
    }

    return { routerRtpCapabilities: room.router.rtpCapabilities, existingProducers };
  });

  handle<{ roomId: string }>(socket, "call:presence", ({ roomId }) => {
    const room = rooms.get(roomId);
    return room
      ? [...room.peers.values()].map((peer) => peer.participant)
      : [];
  });

  handle<{ roomId: string; direction: "send" | "recv" }>(socket, "call:create-transport", async ({ direction }) => {
    const { room, peer } = requirePeer(socket);

    const transport = await room.router.createWebRtcTransport({
      listenInfos: [
        { protocol: "udp", ip: "0.0.0.0", announcedAddress: ANNOUNCED_IP },
        { protocol: "tcp", ip: "0.0.0.0", announcedAddress: ANNOUNCED_IP },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1_000_000,
      appData: { direction },
    });

    peer.transports.set(transport.id, transport);
    transport.on("dtlsstatechange", (state) => {
      if (state === "closed" || state === "failed") transport.close();
    });
    transport.on("@close", () => peer.transports.delete(transport.id));

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  });

  // The client's transport "connect" event lands here; the server must call transport.connect().
  handle<{ transportId: string; dtlsParameters: types.DtlsParameters }>(socket, "call:connect-transport", async ({ transportId, dtlsParameters }) => {
    const { peer } = requirePeer(socket);
    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error("Transport not found");
    await transport.connect({ dtlsParameters });
    return {};
  });

  handle<{ transportId: string; kind: types.MediaKind; rtpParameters: types.RtpParameters; appData?: Record<string, unknown> }>(
    socket,
    "call:produce",
    async ({ transportId, kind, rtpParameters, appData }) => {
      const { roomId, peer } = requirePeer(socket);
      const transport = peer.transports.get(transportId);
      if (!transport) throw new Error("Transport not found");

      const producer = await transport.produce({ kind, rtpParameters, appData });
      peer.producers.set(producer.id, producer);
      producer.on("@close", () => peer.producers.delete(producer.id));

      socket.to(roomId).emit("new-producer", { producerId: producer.id, kind, socketId: socket.id });
      return { id: producer.id };
    },
  );

  handle<{ roomId: string; transportId: string; producerId: string; rtpCapabilities: types.RtpCapabilities }>(
    socket,
    "call:consume",
    async ({ transportId, producerId, rtpCapabilities }) => {
      const { room, peer } = requirePeer(socket);
      const transport = peer.transports.get(transportId);
      if (!transport) throw new Error("Transport not found");
      if (!room.router.canConsume({ producerId, rtpCapabilities })) throw new Error("Cannot consume this producer");

      // Start paused; the client resumes after it has attached the track.
      const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
      peer.consumers.set(consumer.id, consumer);
      consumer.on("@close", () => peer.consumers.delete(consumer.id));
      consumer.on("producerclose", () => {
        peer.consumers.delete(consumer.id);
        consumer.close();
      });

      return { id: consumer.id, producerId, kind: consumer.kind, rtpParameters: consumer.rtpParameters };
    },
  );

  handle<{ consumerId: string }>(socket, "call:resume-consumer", async ({ consumerId }) => {
    const { peer } = requirePeer(socket);
    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new Error("Consumer not found");
    await consumer.resume();
    return {};
  });

  socket.on("leave-call", () => cleanupPeer(socket));

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    cleanupPeer(socket);
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main() {
  worker = await mediasoup.createWorker({
    logLevel: "warn",
    rtcMinPort: RTC_MIN_PORT,
    rtcMaxPort: RTC_MAX_PORT,
  });
  worker.on("died", () => {
    console.error("mediasoup worker died, exiting");
    process.exit(1);
  });

  server.listen(PORT, () => console.log(`Mediasoup SFU server listening on port ${PORT}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
