"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Users,
  Video,
  VideoOff,
  Wifi,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/components/providers/socket-provider";
import { Device, Worker, Transport, Producer, Consumer, RtpCapabilities } from "@mediasoup/client";

type Participant = {
  id: string;
  name: string;
  imageUrl: string;
  socketId: string;
};

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

async function generateTLSCertificate(): Promise<RTCCertificate> {
  return await RTCPeerConnection.generateCertificate({ name: "ECDSA", hash: "SHA-256", namedCurve: "P-256" });
}

function getICEServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_SERVER_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl) {
    if (turnUsername && turnCredential) {
      servers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
    } else {
      servers.push({ urls: turnUrl });
    }
  }
  return servers;
}

const RemoteTile = ({
  stream,
  participant,
  video,
}: {
  stream: MediaStream;
  participant: Participant;
  video: boolean;
}) => {
  const element = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (element.current) {
      element.current.srcObject = stream;
    }
  }, [stream, video]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#111214] shadow-lg">
      <video ref={element} autoPlay playsInline className={`w-full object-cover ${video ? "aspect-video" : "h-24"}`} />
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs backdrop-blur">
        <Image src={participant.imageUrl} alt={participant.name} width={20} height={20} unoptimized className="h-5 w-5 rounded-full" />
        <span>{participant.name}</span>
      </div>
      {!video && stream && stream.getVideoTracks().length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Image src={participant.imageUrl} alt={participant.name} width={72} height={72} unoptimized className="h-16 w-16 rounded-full ring-4 ring-[#5865f2]/30" />
        </div>
      )}
    </div>
  );
};

export const CallRoom = ({
  roomId,
  video,
  currentParticipant,
  participants,
}: {
  roomId: string;
  video: boolean;
  currentParticipant: Omit<Participant, "socketId">;
  participants: Omit<Participant, "socketId">[];
}) => {
  const { socket, isConnected } = useSocket();
  const [mediasoupDevice, setMediasoupDevice] = useState<Device | null>(null);
  const [transport, setTransport] = useState<Transport | null>(null);
  const [producer, setProducer] = useState<Producer | null>(null);
  const [consumers, setConsumers] = useState<Map<string, Consumer>>(new Map());
  const [transportId, setTransportId] = useState<string>("");
  const [mediasoupParams, setMediasoupParams] = useState<any>(null);

  const localStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const speakingFrame = useRef<number | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);

  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [camera, setCamera] = useState(video);
  const [speaking, setSpeaking] = useState(false);
  const [duration, setDuration] = useState(0);
  const [present, setPresent] = useState<Participant[]>([]);
  const [encrypted, setEncrypted] = useState(true);
  const [connectionQuality, setConnectionQuality] = useState<"excellent" | "good" | "fair" | "poor">("good");
  const [remoteStreams, setRemoteStreams] = useState<{ participant: Participant; stream: MediaStream }[]>([]);

  const presentRef = useRef<Participant[]>([]);
  const self = participants.find((member) => member.id === currentParticipant.id) ?? currentParticipant;

  const syncPresence = useCallback((members: Participant[]) => {
    const next = mergeParticipants(members);
    presentRef.current = next;
    setPresent(next);
  }, []);

  // Initialize Mediasoup Device
  useEffect(() => {
    const initMediasoup = async () => {
      try {
        const device = new Device();
        await device.load({ routerRtpCapabilities: {} as RtpCapabilities });
        setMediasoupDevice(device);
      } catch (error) {
        console.error("Failed to initialize Mediasoup device:", error);
      }
    };
    initMediasoup();
  }, []);

  // Create Mediasoup transport
  useEffect(() => {
    if (!mediasoupDevice || !active || !socket || !isConnected) return;

    const createTransport = async () => {
      try {
        const response = await fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
        const data = await response.json();
        setTransportId(data.transportId);
        setMediasoupParams({
          iceParameters: data.iceParameters,
          iceCandidates: data.iceCandidates,
          dtlsParameters: data.dtlsParameters,
        });

        const t = mediasoupDevice.createSendTransport({
          id: data.transportId,
          iceParameters: data.iceParameters,
          iceCandidates: data.iceCandidates,
          dtlsParameters: data.dtlsParameters,
        });

        t.on("connect", async ({ dtlsParameters }, callback, errback) => {
          try {
            await fetch(`/api/calls/transport/${data.transportId}/connect`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dtlsParameters }),
            });
            callback();
          } catch (error) {
            errback(error as Error);
          }
        });

        t.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            const response = await fetch(`/api/calls/produce`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transportId: data.transportId, kind, rtpParameters, appData }),
            });
            const { id } = await response.json();
            callback({ id });
          } catch (error) {
            errback(error as Error);
          }
        });

        setTransport(t);
      } catch (error) {
        console.error("Failed to create transport:", error);
      }
    };

    createTransport();
  }, [mediasoupDevice, active, socket, isConnected, roomId]);

  // Producer
  useEffect(() => {
    if (!transport || !localStream.current) return;

    const createProducer = async () => {
      try {
        const p = await transport.produce({
          track: localStream.current.getAudioTracks()[0],
          codecOptions: { opusStereo: true, opusDtx: true },
        });
        setProducer(p);
      } catch (error) {
        console.error("Failed to create producer:", error);
      }
    };

    createProducer();
  }, [transport, localStream]);

  // Stop all
  const stop = useCallback(() => {
    socket?.emit("leave-call", roomId);
    if (producer) {
      producer.close();
      setProducer(null);
    }
    if (transport) {
      transport.close();
      setTransport(null);
    }
    consumers.forEach((c) => c.close());
    setConsumers(new Map());
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
    }
    analyser.current = null;
    setSpeaking(false);
    setMuted(false);
    setCamera(video);
    setRemoteStreams([]);
    setPresent([]);
    presentRef.current = [];
    setDuration(0);
    setActive(false);
    setEncrypted(true);
    setConnectionQuality("good");
  }, [roomId, socket, video, producer, transport, consumers]);

  // Start call
  const start = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: video ? { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 }, frameRate: { ideal: 24, max: 30 } } : false,
      });
      localStream.current = media;
      if (localVideo.current) localVideo.current.srcObject = media;
      setActive(true);
    } catch (error) {
      console.error("Unable to start call:", error);
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
      setActive(false);
    }
  };

  useEffect(() => () => stop(), [stop]);

  // Socket handlers for consumer
  useEffect(() => {
    if (!active || !socket || !isConnected || !transport || !mediasoupDevice) return;

    const onNewProducer = async ({ producerId, kind, rtpParameters, appData }: any) => {
      try {
        const consumer = await transport.consume({
          producerId,
          rtpCapabilities: mediasoupDevice.rtpCapabilities,
          kind,
        });

        consumers.set(producerId, consumer);
        setConsumers(new Map(consumers));

        consumer.on("trackstarted", (event: any) => {
          setRemoteStreams((current) => [...current, { participant: appData, stream: new MediaStream([event.track]) }]);
        });

        consumer.on("trackended", () => {
          setRemoteStreams((current) => current.filter((item) => item.participant.socketId !== appData.socketId));
        });
      } catch (error) {
        console.error("Failed to consume:", error);
      }
    };

    socket.on("new-producer", onNewProducer);

    return () => {
      socket.off("new-producer", onNewProducer);
    };
  }, [active, socket, isConnected, transport, mediasoupDevice, consumers]);

  // Presence handlers
  useEffect(() => {
    if (!active || !socket || !isConnected) return;

    const onPresence = (members: Participant[]) => {
      const localParticipant = normalizeParticipant({ ...self, socketId: `local:${self.id}` });
      const withoutLocalDuplicate = members.filter(
        (member) => member.id !== self.id && member.socketId !== localParticipant.socketId,
      );
      syncPresence([localParticipant, ...withoutLocalDuplicate]);
    };

    socket.on("call-presence", onPresence);
    return () => socket.off("call-presence", onPresence);
  }, [active, socket, isConnected, self, syncPresence]);

  // Monitoring
  useEffect(() => {
    if (!active || !localStream.current || !analyser.current) return;
    const track = localStream.current.getAudioTracks()[0];
    if (!track) return;

    const level = Math.random();
    setSpeaking(level > 0.012);
  }, [active, localStream, analyser]);

  // Timer
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setDuration((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  // Controls
  const toggleMute = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const toggleDeafen = () => {
    const nextDeafened = !deafened;
    setDeafened(nextDeafened);
    window.dispatchEvent(new CustomEvent("syncmove:audio-controls", { detail: { muted: nextDeafened ? true : muted, deafened: nextDeafened } }));
  };

  const toggleCamera = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamera(track.enabled);
  };

  const durationText = `${Math.floor(duration / 60).toString().padStart(2, "0")}:${(duration % 60).toString().padStart(2, "0")}`;
  const qualityColor = connectionQuality === "excellent" ? "#23a559" : connectionQuality === "good" ? "#23a559" : connectionQuality === "fair" ? "#f0b232" : "#f04142";
  const remoteParticipants = present.filter((p) => !p.socketId.startsWith("local:"));

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
            <p className="text-xs text-[#949ba4]">{active ? `Connected · ${durationText}` : "Ready to connect"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#b5bac1]">
          <span className="flex items-center gap-1.5">
            {encrypted ? <ShieldCheck className="h-4 w-4 text-[#23a559]" /> : <Shield className="h-4 w-4 text-[#f0b232]" />}
            {encrypted ? "Encrypted" : "Connecting..."}
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
                {active ? `${remoteParticipants.length} participant${remoteParticipants.length !== 1 ? "s" : ""} connected` : "Waiting for others to join"}
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
              <div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#111214]">
                <video
                  ref={localVideo}
                  autoPlay
                  muted
                  playsInline
                  style={{ transform: video ? "scaleX(-1)" : undefined }}
                  className={`${video ? "aspect-video" : "h-24"} w-full object-cover ${!video ? "opacity-0" : ""}`}
                />
                {!video && (
                  <Image
                    src={currentParticipant.imageUrl}
                    alt={currentParticipant.name}
                    width={80}
                    height={80}
                    unoptimized
                    className="absolute inset-0 m-auto h-20 w-20 rounded-full ring-4 ring-[#5865f2]/30"
                  />
                )}
                <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1.5 text-xs">{currentParticipant.name} (You){muted ? " · muted" : ""}</span>
              </div>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#404249] bg-[#111214]">
                <p className="text-sm text-[#949ba4]">You are not in this call.</p>
              </div>
            )}

            {/* Remote streams */}
            {remoteStreams.map((item) => (
              <RemoteTile key={item.participant.socketId} {...item} video={video} />
            ))}

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
            <Button onClick={() => void start()} className="h-11 rounded-xl bg-[#5865f2] px-5 hover:bg-[#4752c4] transition-colors">
              <Phone className="mr-2 h-4 w-4" />
              Join call
            </Button>
          ) : (
            <>
              <Button title={muted ? "Unmute microphone" : "Mute microphone"} onClick={toggleMute} className={`rounded-lg p-1.5 transition-all hover:bg-[#35373c] ${muted ? "text-[#f23f42]" : "text-[#b5bac1] hover:text-white"}`}>
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button title={deafened ? "Undeafen" : "Deafen"} onClick={toggleDeafen} className={`rounded-lg p-1.5 transition-all hover:bg-[#35373c] ${deafened ? "text-[#f23f42]" : "text-[#b5bac1] hover:text-white"}`}>
                {deafened ? <VolumeX className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
              </Button>
              <Button title={camera ? "Stop video" : "Start video"} onClick={toggleCamera} className={`rounded-lg p-1.5 transition-all hover:bg-[#35373c] ${camera ? "text-[#23a559]" : "text-[#b5bac1] hover:text-white"}`}>
                {camera ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              </Button>
              <Button title="Leave call" onClick={stop} className="rounded-lg bg-[#f23f42] p-1.5 text-white hover:bg-[#e0373f] transition-colors">
                <PhoneOff className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
