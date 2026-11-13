import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { mediaSoupConfig } from '@/lib/mediasoup-client';

export async function POST(request: NextRequest) {
  try {
    const { roomId } = await request.json();
    
    const workerId = roomId;
    let config = mediaSoupConfig.get(workerId);
    
    if (!config) {
      const mediasoup = await import('mediasoup/node');
      const worker = new mediasoup.Worker({
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

      config = {
        worker,
        router,
        transports: new Map(),
      };
      mediaSoupConfig.set(workerId, config);
    }

    // Create WebRTC transport
    const transport = await config.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || 'localhost' }],
      initialAvailableOutgoingBitrate: 1000000,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    // Store transport
    const transportId = uuidv4();
    config.transports.set(transportId, transport);

    return NextResponse.json({
      transportId,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  } catch (error) {
    console.error('Error creating transport:', error);
    return NextResponse.json({ error: 'Failed to create transport' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');

  if (!roomId) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
  }

  return NextResponse.json({ roomId });
}
