"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Headphones,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Shield,
  ShieldCheck,
  Users,
  Video,
  VideoOff,
  VolumeX,
  Wifi,
} from "lucide-react";
import type { Socket } from "socket.io-client";
import { Device, types } from "mediasoup-client";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/components/providers/socket-provider";

type Participant = {
  id: string;
  name: string;
  imageUrl: string;
  socketId: string;
};

type TransportInfo = {
  id: string;
  iceParameters: types.IceParameters;
  iceCandidates: types.IceCandidate[];
  dtlsParameters: types.DtlsParameters;
};

type JoinResponse = {
  routerRtpCapabilities: types.RtpCapabilities;
  existingProducers: { producerId: string; kind: types.MediaKind; socketId: string }[];
};

type ConsumeResponse = {
  id: string;
  producerId: string;
  kind: types.MediaKind;
  rtpParameters: types.RtpParameters;
};

type RemoteStream = { socketId: string; stream: MediaStream };

const MAX_VISIBLE_AVATARS = 5;

const normalizeParticipant = (
  member: Partial<Participant> & { id: string; name: string; imageUrl: string; socketId?: string },
): Participant => ({ ...member, socketId: member.socketId ?? member.id });

const mergeParticipants = (members: Participant[]): Participant[] => {
  const bySocket = new Map<string, Participant>();
  for (const member of members) {
    const normalized = normalizeParticipant(member);
    bySocket.set(normalized.socketId, { ...bySocket.get(normalized.socketId), ...normalized });
  }
  return [...bySocket.values()];
};

function getICEServers(): RTCIceServer[] {
  // Mediasoup SFU handles media relay; no TURN server needed.
  // STUN servers are sufficient for NAT traversal to reach the SFU.
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
}

// socket.io request/response helper (server must call the ack callback).
function request<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    socket.timeout(10000).emit(event, payload, (err: Error | null, res: T & { error?: string }) => {
      if (err) return reject(err);
      if (res && typeof res === "object" && "error" in res && res.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
}

const RemoteTile = ({
  stream,
  participant,
  deafened,
}: {
  stream: MediaStream;
  participant: Participant;
  deafened: boolean;
}) => {
  const element = useRef<HTMLVideoElement>(null);
  const hasVideo = stream.getVideoTracks().length > 0;

  useEffect(() => {
    if (element.current) element.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#111214] shadow-lg">
      {/* A <video> element also plays audio-only streams. */}
      <video
        ref={element}
        autoPlay
        playsInline
        muted={deafened}
        className={`w-full object-cover ${hasVideo ? "aspect-video" : "h-24"}`}
      />
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs backdrop-blur">
        {participant.imageUrl && (
          <Image src={participant.imageUrl} alt={participant.name} width={20} height={20} unoptimized className="h-5 w-5 rounded-full" />
        )}
        <span>{participant.name}</span>
      </div>
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          {participant.imageUrl ? (
            <Image src={participant.imageUrl} alt={participant.name} width={72} height={72} unoptimized className="h-16 w-16 rounded-full ring-4 ring-[#5865f2]/30" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#5865f2] text-xl font-semibold ring-4 ring-[#5865f2]/30">
              {participant.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const CallRoom = ({
  roomId,
  video,
  currentParticipant,
}: {
  roomId: string;
  video: boolean;
  currentParticipant: Omit<Participant, "socketId">;
  participants: Omit<Participant, "socketId">[];
}) => {
  const { socket, isConnected } = useSocket();

  // Mediasoup objects live in refs so changing them never re-runs effects or cleanup.
  const socketRef = useRef<Socket | null>(null);
  socketRef.current = socket as Socket | null;
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<types.Transport | null>(null);
  const recvTransportRef = useRef<types.Transport | null>(null);
  const producersRef = useRef<Map<string, types.Producer>>(new Map()); // kind -> producer
  const consumersRef = useRef<Map<string, types.Consumer>>(new Map()); // producerId -> consumer
  const remoteTracksRef = useRef<Map<string, { socketId: string; track: MediaStreamTrack }>>(new Map());
  const remoteMediaRef = useRef<Map<string, MediaStream>>(new Map()); // socketId -> stream
  const listenersRef = useRef<{
    onNewProducer: (p: { producerId: string; socketId: string }) => void;
    onProducerClosed: (p: { producerId: string }) => void;
    onPresence: (members: Participant[]) => void;
  } | null>(null);

  const localStream = useRef<MediaStream | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);

  const [joining, setJoining] = useState(false);
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [camera, setCamera] = useState(video);
  const [speaking, setSpeaking] = useState(false);
  const [duration, setDuration] = useState(0);
  const [present, setPresent] = useState<Participant[]>([]);
  const [connectionQuality, setConnectionQuality] = useState<"excellent" | "good" | "fair" | "poor">("good");
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);

  const encrypted = active; // WebRTC media is always DTLS-SRTP encrypted once connected.

  const publishRemoteStreams = useCallback(() => {
    setRemoteStreams([...remoteMediaRef.current.entries()].map(([socketId, stream]) => ({ socketId, stream })));
  }, []);

  const removeRemoteTrack = useCallback(
    (producerId: string) => {
      const entry = remoteTracksRef.current.get(producerId);
      if (!entry) return;
      remoteTracksRef.current.delete(producerId);
      consumersRef.current.get(producerId)?.close();
      consumersRef.current.delete(producerId);
      const stream = remoteMediaRef.current.get(entry.socketId);
      if (stream) {
        stream.removeTrack(entry.track);
        if (stream.getTracks().length === 0) remoteMediaRef.current.delete(entry.socketId);
      }
      publishRemoteStreams();
    },
    [publishRemoteStreams],
  );

  // Tear everything down. Depends only on roomId so it is stable (safe to use in an unmount effect).
  const cleanup = useCallback(
    (notify: boolean) => {
      const sock = socketRef.current;
      if (sock) {
        if (notify) sock.emit("leave-call", roomId);
        const l = listenersRef.current;
        if (l) {
          sock.off("new-producer", l.onNewProducer);
          sock.off("producer-closed", l.onProducerClosed);
          sock.off("call-presence", l.onPresence);
        }
      }
      listenersRef.current = null;

      producersRef.current.forEach((p) => p.close());
      producersRef.current.clear();
      consumersRef.current.forEach((c) => c.close());
      consumersRef.current.clear();
      remoteTracksRef.current.clear();
      remoteMediaRef.current.clear();
      sendTransportRef.current?.close();
      recvTransportRef.current?.close();
      sendTransportRef.current = null;
      recvTransportRef.current = null;
      deviceRef.current = null;

      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;

      setSpeaking(false);
      setMuted(false);
      setCamera(video);
      setRemoteStreams([]);
      setPresent([]);
      setDuration(0);
      setActive(false);
      setJoining(false);
      setConnectionQuality("good");
    },
    [roomId, video],
  );

  const stop = useCallback(() => cleanup(true), [cleanup]);

  // Leave when the component unmounts.
  useEffect(() => () => cleanup(true), [cleanup]);

  // Drop the call if the socket connection is lost.
  useEffect(() => {
    if (active && !isConnected) cleanup(false);
  }, [active, isConnected, cleanup]);

  const consumeProducer = useCallback(
    async (producerId: string, socketId: string) => {
      const sock = socketRef.current;
      const device = deviceRef.current;
      const recv = recvTransportRef.current;
      if (!sock || !device || !recv || consumersRef.current.has(producerId)) return;
      try {
        const info = await request<ConsumeResponse>(sock, "call:consume", {
          roomId,
          producerId,
          transportId: recv.id,
          rtpCapabilities: device.rtpCapabilities,
        });
        const consumer = await recv.consume({
          id: info.id,
          producerId: info.producerId,
          kind: info.kind,
          rtpParameters: info.rtpParameters,
        });
        consumersRef.current.set(producerId, consumer);
        remoteTracksRef.current.set(producerId, { socketId, track: consumer.track });

        const stream = remoteMediaRef.current.get(socketId) ?? new MediaStream();
        stream.addTrack(consumer.track);
        remoteMediaRef.current.set(socketId, stream);
        publishRemoteStreams();

        consumer.on("transportclose", () => removeRemoteTrack(producerId));
        // The client-side Consumer has no "producerclose" event; the server's "producer-closed"
        // socket event (handled in start) plus "trackended" cover that case.
        consumer.on("trackended", () => removeRemoteTrack(producerId));

        // Consumers are created paused on the server; resume once the track is wired up.
        await request(sock, "call:resume-consumer", { consumerId: consumer.id });
      } catch (error) {
        console.error("Failed to consume producer:", producerId, error);
      }
    },
    [roomId, publishRemoteStreams, removeRemoteTrack],
  );

  const start = async () => {
    const sock = socketRef.current;
    if (!sock || !isConnected || joining || active) return;
    setJoining(true);

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: video
          ? { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 }, frameRate: { ideal: 24, max: 30 } }
          : false,
      });
      localStream.current = media;

      // Register listeners BEFORE joining so no event is missed.
      const self = normalizeParticipant({ ...currentParticipant, socketId: `local:${currentParticipant.id}` });
      listenersRef.current = {
        onNewProducer: ({ producerId, socketId }) => void consumeProducer(producerId, socketId),
        onProducerClosed: ({ producerId }) => removeRemoteTrack(producerId),
        onPresence: (members) => {
          const others = members.filter((m) => m.id !== self.id && m.socketId !== self.socketId);
          setPresent(mergeParticipants([self, ...others]));
        },
      };
      sock.on("new-producer", listenersRef.current.onNewProducer);
      sock.on("producer-closed", listenersRef.current.onProducerClosed);
      sock.on("call-presence", listenersRef.current.onPresence);

      // 1. Join the room and get the router's real RTP capabilities.
      const joined = await request<JoinResponse>(sock, "call:join", { roomId, participant: currentParticipant });

      // 2. Load the device with those capabilities.
      const device = new Device();
      await device.load({ routerRtpCapabilities: joined.routerRtpCapabilities });
      deviceRef.current = device;
      const iceServers = getICEServers();

      // 3. Send transport (publishing our mic/camera).
      const sendInfo = await request<TransportInfo>(sock, "call:create-transport", { roomId, direction: "send" });
      const send = device.createSendTransport({ ...sendInfo, iceServers });
      send.on("connect", ({ dtlsParameters }, callback, errback) => {
        request(sock, "call:connect-transport", { transportId: send.id, dtlsParameters })
          .then(() => callback())
          .catch(errback);
      });
      send.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
        request<{ id: string }>(sock, "call:produce", { transportId: send.id, kind, rtpParameters, appData })
          .then(({ id }) => callback({ id }))
          .catch(errback);
      });
      send.on("connectionstatechange", (state) => {
        setConnectionQuality(state === "connected" ? "good" : state === "failed" ? "poor" : "fair");
      });
      sendTransportRef.current = send;

      // 4. Receive transport (consuming others). A send transport cannot consume.
      const recvInfo = await request<TransportInfo>(sock, "call:create-transport", { roomId, direction: "recv" });
      const recv = device.createRecvTransport({ ...recvInfo, iceServers });
      recv.on("connect", ({ dtlsParameters }, callback, errback) => {
        request(sock, "call:connect-transport", { transportId: recv.id, dtlsParameters })
          .then(() => callback())
          .catch(errback);
      });
      recvTransportRef.current = recv;

      // 5. Publish local tracks.
      const audioTrack = media.getAudioTracks()[0];
      if (audioTrack) {
        producersRef.current.set("audio", await send.produce({ track: audioTrack, codecOptions: { opusDtx: true } }));
      }
      const videoTrack = media.getVideoTracks()[0];
      if (video && videoTrack) {
        producersRef.current.set("video", await send.produce({ track: videoTrack }));
      }

      // 6. Consume everyone already in the call.
      for (const p of joined.existingProducers) await consumeProducer(p.producerId, p.socketId);

      setActive(true);
      setJoining(false);
    } catch (error) {
      console.error("Unable to start call:", error);
      cleanup(true);
    }
  };

  // Attach the local stream once the <video> element exists (it only renders while active).
  useEffect(() => {
    if (active && localVideo.current) localVideo.current.srcObject = localStream.current;
  }, [active, camera]);

  // Real speaking detection from the mic level.
  useEffect(() => {
    if (!active) return;
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) {
        const n = (v - 128) / 128;
        sum += n * n;
      }
      setSpeaking(Math.sqrt(sum / data.length) > 0.02);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      void ctx.close();
      setSpeaking(false);
    };
  }, [active]);

  // Timer
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setDuration((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  // Controls
  const toggleMute = () => {
    const track = localStream.current?.getAudioTracks()[0];
    const producer = producersRef.current.get("audio");
    if (!track) return;
    track.enabled = !track.enabled;
    if (producer) {
      if (track.enabled) producer.resume();
      else producer.pause();
    }
    setMuted(!track.enabled);
  };

  const toggleDeafen = () => {
    const nextDeafened = !deafened;
    setDeafened(nextDeafened);
    window.dispatchEvent(
      new CustomEvent("syncmove:audio-controls", {
        detail: { muted: nextDeafened ? true : muted, deafened: nextDeafened },
      }),
    );
  };

  const toggleCamera = () => {
    const track = localStream.current?.getVideoTracks()[0];
    const producer = producersRef.current.get("video");
    if (!track) return;
    track.enabled = !track.enabled;
    if (producer) {
      if (track.enabled) producer.resume();
      else producer.pause();
    }
    setCamera(track.enabled);
  };

  const durationText = `${Math.floor(duration / 60).toString().padStart(2, "0")}:${(duration % 60).toString().padStart(2, "0")}`;
  const qualityColor =
    connectionQuality === "excellent" || connectionQuality === "good" ? "#23a559" : connectionQuality === "fair" ? "#f0b232" : "#f04142";
  const remoteParticipants = present.filter((p) => !p.socketId.startsWith("local:"));
  const showLocalAvatar = !video || !camera;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-[#1e1f22] text-white">
      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-white/5 bg-[#2b2d31]/80 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[#5865f2]/20 p-2 text-[#a5b4fc]">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">{video ? "Video call" : "Voice call"}</h2>
            <p className="text-xs text-[#949ba4]">
              {active ? `Connected · ${durationText}` : joining ? "Connecting..." : "Ready to connect"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#b5bac1]">
          <span className="flex items-center gap-1.5">
            {encrypted ? <ShieldCheck className="h-4 w-4 text-[#23a559]" /> : <Shield className="h-4 w-4 text-[#f0b232]" />}
            {encrypted ? "Encrypted" : "Not connected"}
          </span>
          <span className="flex items-center gap-1.5">
            <Wifi className="h-4 w-4" style={{ color: qualityColor }} />
            {connectionQuality}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {active ? `${remoteParticipants.length} participant${remoteParticipants.length !== 1 ? "s" : ""}` : "Not in call"}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-auto p-6">
        <div className="w-full max-w-5xl rounded-2xl border border-white/5 bg-[#2b2d31]/90 p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">In this call</p>
              <p className="text-xs text-[#949ba4]">
                {active
                  ? `${remoteParticipants.length} participant${remoteParticipants.length !== 1 ? "s" : ""} connected`
                  : "Waiting for others to join"}
              </p>
            </div>
            {remoteParticipants.length > 0 && (
              <div className="flex -space-x-2">
                {remoteParticipants.slice(0, MAX_VISIBLE_AVATARS).map((member) => (
                  <div key={member.socketId} className="relative overflow-hidden rounded-full border-2 border-[#2b2d31] bg-[#111214] ring-2 ring-[#2b2d31]">
                    <Image src={member.imageUrl} alt={member.name} title={member.name} width={36} height={36} unoptimized className="h-9 w-9 rounded-full object-cover" />
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#2b2d31] bg-[#23a559]" />
                  </div>
                ))}
                {remoteParticipants.length > MAX_VISIBLE_AVATARS && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#2b2d31] bg-[#2b2d31] text-xs font-medium text-[#b5bac1]">
                    +{remoteParticipants.length - MAX_VISIBLE_AVATARS}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`grid gap-4 ${video ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
            {/* Local video */}
            {active ? (
              <div className={`relative overflow-hidden rounded-xl border bg-[#111214] ${speaking && !muted ? "border-[#23a559]" : "border-white/5"}`}>
                <video
                  ref={localVideo}
                  autoPlay
                  muted
                  playsInline
                  style={{ transform: video ? "scaleX(-1)" : undefined }}
                  className={`${video ? "aspect-video" : "h-24"} w-full object-cover ${showLocalAvatar ? "opacity-0" : ""}`}
                />
                {showLocalAvatar && (
                  <Image
                    src={currentParticipant.imageUrl}
                    alt={currentParticipant.name}
                    width={80}
                    height={80}
                    unoptimized
                    className="absolute inset-0 m-auto h-20 w-20 rounded-full ring-4 ring-[#5865f2]/30"
                  />
                )}
                <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1.5 text-xs">
                  {currentParticipant.name} (You){muted ? " · muted" : ""}
                </span>
              </div>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#404249] bg-[#111214]">
                <p className="text-sm text-[#949ba4]">You are not in this call.</p>
              </div>
            )}

            {/* Remote streams */}
            {remoteStreams.map(({ socketId, stream }) => {
              const participant =
                present.find((p) => p.socketId === socketId) ?? { id: socketId, name: "Participant", imageUrl: "", socketId };
              return <RemoteTile key={socketId} stream={stream} participant={participant} deafened={deafened} />;
            })}

            {/* Waiting / Empty state */}
            {active && remoteStreams.length === 0 && (
              <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#404249]">
                <p className="text-sm text-[#949ba4]">Waiting for others to join...</p>
                {remoteParticipants.length > 0 && (
                  <div className="flex -space-x-3">
                    {remoteParticipants.map((member) => (
                      <div key={member.socketId} className="relative overflow-hidden rounded-full border-2 border-[#2b2d31] ring-2 ring-[#2b2d31]">
                        <Image src={member.imageUrl} alt={member.name} width={40} height={40} unoptimized className="h-10 w-10 rounded-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111214]/95 p-2 shadow-xl backdrop-blur">
          {!active ? (
            <Button
              onClick={() => void start()}
              disabled={joining || !isConnected}
              className="h-11 rounded-xl bg-[#5865f2] px-5 transition-colors hover:bg-[#4752c4]"
            >
              <Phone className="mr-2 h-4 w-4" />
              {joining ? "Joining..." : "Join call"}
            </Button>
          ) : (
            <>
              <Button title={muted ? "Unmute microphone" : "Mute microphone"} onClick={toggleMute} className={`rounded-lg p-1.5 transition-all hover:bg-[#35373c] ${muted ? "text-[#f23f42]" : "text-[#b5bac1] hover:text-white"}`}>
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button title={deafened ? "Undeafen" : "Deafen"} onClick={toggleDeafen} className={`rounded-lg p-1.5 transition-all hover:bg-[#35373c] ${deafened ? "text-[#f23f42]" : "text-[#b5bac1] hover:text-white"}`}>
                {deafened ? <VolumeX className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
              </Button>
              {video && (
                <Button title={camera ? "Stop video" : "Start video"} onClick={toggleCamera} className={`rounded-lg p-1.5 transition-all hover:bg-[#35373c] ${camera ? "text-[#23a559]" : "text-[#b5bac1] hover:text-white"}`}>
                  {camera ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                </Button>
              )}
              <Button title="Leave call" onClick={stop} className="rounded-lg bg-[#f23f42] p-1.5 text-white transition-colors hover:bg-[#e0373f]">
                <PhoneOff className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};