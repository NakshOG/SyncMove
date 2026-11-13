import type { Worker, Router, WebRtcTransport } from 'mediasoup/node';

export type MediasoupWorker = {
  worker: Worker;
  router: Router;
};

export const mediasoupWorkers = new Map<string, MediasoupWorker>();

export async function createMediasoupWorker(workerId: string): Promise<MediasoupWorker> {
  const MediasoupWorker = (await import('mediasoup/node')).Worker;
  
  const worker = new MediasoupWorker({
    workerLogLevel: 'warn',
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

  const router = await worker.createRouter({
    mediaCodecs: worker.router.mediaCodecs,
  });

  mediasoupWorkers.set(workerId, { router, worker });

  return { router, worker };
}

export async function closeMediasoupWorker(workerId: string) {
  const worker = mediasoupWorkers.get(workerId);
  if (worker) {
    await worker.worker.close();
    mediasoupWorkers.delete(workerId);
  }
}

export async function createWebRtcTransport(workerId: string) {
  const { router } = mediasoupWorkers.get(workerId)!;
  
  return await router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || 'localhost' }],
    initialAvailableOutgoingBitrate: 1000000,
  });
}

export function getWorker(workerId: string) {
  return mediasoupWorkers.get(workerId);
}
