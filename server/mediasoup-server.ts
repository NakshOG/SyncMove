import express from 'express';
import http from 'http';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Worker } from 'mediasoup';
import { v4 as uuidv4 } from 'uuid';

type MediasoupWorker = {
  worker: Worker;
  router: any;
  transports: Map<string, any>;
  producers: Map<string, any>;
};

const workers = new Map<string, MediasoupWorker>();

const app = express();
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Initialize Mediasoup worker for a room
async function initializeWorker(roomId: string) {
  const worker = await Worker.create({
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp'],
    rtcMinPort: 49152,
    rtcMaxPort: 65535,
  });

  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
    ],
  });

  workers.set(roomId, {
    worker,
    router,
    transports: new Map(),
    producers: new Map(),
  });

  return workers.get(roomId)!;
}

function getWorker(roomId: string) {
  let workerData = workers.get(roomId);
  if (!workerData) {
    workerData = initializeWorker(roomId);
  }
  return workerData;
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-room', async ({ roomId, peerId, displayName }) => {
    socket.join(roomId);
    
    socket.emit('joined-room', {
      roomId,
      peerId: socket.id,
      peers: Array.from(io.sockets.adapter.rooms.get(roomId)?.values() || []).filter(id => id !== socket.id),
    });
    
    // Notify others
    socket.to(roomId).emit('peer-joined', {
      peerId: socket.id,
      displayName: displayName || socket.id,
    });
  });

  socket.on('create-transport', async ({ roomId }) => {
    const worker = getWorker(roomId);
    
    const transport = await worker.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || 'localhost' }],
      initialAvailableOutgoingBitrate: 1000000,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    const transportId = uuidv4();
    worker.transports.set(transportId, transport);

    transport.on('connect', async ({ dtlsParameters }) => {
      try {
        await transport.connect(dtlsParameters);
      } catch (error) {
        console.error('Transport connect error:', error);
      }
    });

    transport.on('connectionstatechange', (state) => {
      console.log(`Transport ${transportId} state: ${state}`);
    });

    socket.emit('transport-created', {
      transportId,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  });

  socket.on('produce', async ({ roomId, transportId, kind, rtpParameters, appData }) => {
    const worker = getWorker(roomId);
    const transport = worker.transports.get(transportId);
    
    if (!transport) {
      socket.emit('produce-error', { error: 'Transport not found' });
      return;
    }

    try {
      const producer = await transport.produce({
        kind,
        rtpParameters,
        appData,
      });

      worker.producers.set(producer.id, {
        producer,
        roomId,
        socketId: socket.id,
      });

      socket.emit('producer-created', { id: producer.id });

      // Broadcast to all peers in room
      socket.to(roomId).emit('new-producer', {
        producerId: producer.id,
        kind,
        peerId: socket.id,
        rtpParameters,
        appData,
      });
    } catch (error) {
      console.error('Produce error:', error);
      socket.emit('produce-error', { error: String(error) });
    }
  });

  socket.on('consume', async ({ roomId, transportId, producerId }) => {
    const worker = getWorker(roomId);
    const transport = worker.transports.get(transportId);
    
    if (!transport) {
      socket.emit('consume-error', { error: 'Transport not found' });
      return;
    }

    try {
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities: worker.router.rtpCapabilities,
      });

      socket.emit('consumer-created', {
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
      });

      // Notify producer
      const producerInfo = worker.producers.get(producerId);
      if (producerInfo) {
        io.to(producerInfo.socketId).emit('consumer-created', {
          consumerId: consumer.id,
          producerId,
        });
      }
    } catch (error) {
      console.error('Consume error:', error);
      socket.emit('consume-error', { error: String(error) });
    }
  });

  socket.on('close-transport', async ({ roomId, transportId }) => {
    const worker = getWorker(roomId);
    const transport = worker.transports.get(transportId);
    
    if (transport) {
      await transport.close();
      worker.transports.delete(transportId);
    }
  });

  socket.on('close-producer', async ({ roomId, producerId }) => {
    const worker = getWorker(roomId);
    const producer = worker.producers.get(producerId);
    
    if (producer) {
      await producer.producer.close();
      worker.producers.delete(producerId);
    }

    // Notify others
    socket.to(roomId).emit('producer-closed', { producerId });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Cleanup all resources
    for (const [roomId, worker] of workers.entries()) {
      // Remove transports
      for (const [transportId, transport] of worker.transports.entries()) {
        if (transport.socketId === socket.id) {
          transport.close();
          worker.transports.delete(transportId);
        }
      }
      
      // Remove producers
      for (const [producerId, producer] of worker.producers.entries()) {
        if (producer.socketId === socket.id) {
          producer.producer.close();
          worker.producers.delete(producerId);
        }
      }
    }
  });
});

const PORT = process.env.MEDIASOUP_PORT || 3333;
server.listen(PORT, () => {
  console.log(`Mediasoup SFU server listening on port ${PORT}`);
});
