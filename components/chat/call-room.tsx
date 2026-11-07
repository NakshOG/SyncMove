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

type Participant = {
  id: string;
  name: string;
  imageUrl: string;
  socketId: string;
};

type Signal = {
  kind: "offer" | "answer" | "candidate";
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

const MAX_VISIBLE_AVATARS = 5;

const normalizeParticipant = (
  member: Partial<Participant> & {
    id: string;
    name: string;
    imageUrl: string;
    socketId?: string;
  },
): Participant => ({
  ...member,
  socketId: member.socketId ?? member.id,
});

/**
 * Deduplicate by socket ID, not by user ID.
 * A single user can have multiple sessions, but each socket
 * should appear only once in the call presence list.
 */
const mergeParticipants = (members: Participant[]): Participant[] => {
  const bySocket = new Map<string, Participant>();

  for (const member of members) {
    const normalized = normalizeParticipant(member);

    bySocket.set(normalized.socketId, {
      ...bySocket.get(normalized.socketId),
      ...normalized,
    });
  }

  return [...bySocket.values()];
};

/**
 * Generate TLS certificate for DTLS
 */
async function generateTLSCertificate(): Promise<RTCCertificate> {
  return await RTCPeerConnection.generateCertificate({
    name: "ECDSA",
    hash: "SHA-256",
    namedCurve: "P-256",
  });
}

/**
 * Get ICE server configuration with STUN and TURN
 */
function getICEServers(): RTCIceServer[] {
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Add your TURN server here for NAT traversal:
    // {
    //   urls: "turn:your-turn-server.com:3478",
    //   username: process.env.TURN_USERNAME,
    //   credential: process.env.TURN_PASSWORD,
    // },
  ];
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
  }, [stream]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#111214] shadow-lg">
      <video
        ref={element}
        autoPlay
        playsInline
        className={`${video ? "aspect-video" : "h-24"} w-full object-cover ${!video ? "opacity-0" : ""}`}
      />

      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs backdrop-blur">
        <Image
          src={participant.imageUrl}
          alt={participant.name}
          width={20}
          height={20}
          unoptimized
          className="h-5 w-5 rounded-full"
        />
        <span>{participant.name}</span>
      </div>

      {!video && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src={participant.imageUrl}
            alt={participant.name}
            width={72}
            height={72}
            unoptimized
            className="h-16 w-16 rounded-full ring-4 ring-[#5865f2]/30"
          />
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

  const localStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const speakingFrame = useRef<number | null>(null);
  const certificateRef = useRef<Promise<RTCCertificate> | null>(null);

  const peers = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const peerConnectionsRef = useRef(new Map<string, { offerSent: boolean; remoteDescriptionSet: boolean }>());

  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [camera, setCamera] = useState(video);
  const [speaking, setSpeaking] = useState(false);
  const [duration, setDuration] = useState(0);
  const [present, setPresent] = useState<Participant[]>([]);
  const [encrypted, setEncrypted] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<"excellent" | "good" | "fair" | "poor">("good");

  const presentRef = useRef<Participant[]>([]);

  const [remoteStreams, setRemoteStreams] = useState<
    { participant: Participant; stream: MediaStream }[]
  >([]);

  const localVideo = useRef<HTMLVideoElement>(null);

  const self =
    participants.find((member) => member.id === currentParticipant.id) ??
    currentParticipant;

  const syncPresence = useCallback((members: Participant[]) => {
    const next = mergeParticipants(members);
    presentRef.current = next;
    setPresent(next);
  }, []);

  const getConnectionQuality = useCallback((pc: RTCPeerConnection): "excellent" | "good" | "fair" | "poor" => {
    try {
      const stats = pc.getStats();
      let packetLoss = 0;
      let jitter = 0;
      let roundTripTime = 0;

      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          packetLoss = report.packetsLost / (report.packetsReceived + report.packetsLost) * 100;
          jitter = report.jitter;
        }
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          roundTripTime = report.currentRoundTripTime * 1000;
        }
      });

      if (packetLoss < 0.5 && jitter < 30 && roundTripTime < 100) return "excellent";
      if (packetLoss < 1 && jitter < 50 && roundTripTime < 200) return "good";
      if (packetLoss < 3 && jitter < 100 && roundTripTime < 400) return "fair";
      return "poor";
    } catch {
      return "good";
    }
  }, []);

  const updateConnectionQuality = useCallback(() => {
    peers.current.forEach((pc) => {
      const quality = getConnectionQuality(pc);
      setConnectionQuality(quality);
    });
  }, [getConnectionQuality]);

  void deafened;

  const sendSignal = useCallback(
    (targetId: string, signal: Signal) =>
      socket?.emit("call-signal", { targetId, signal }),
    [socket],
  );

  const closePeer = useCallback((socketId: string) => {
    peers.current.get(socketId)?.close();
    peers.current.delete(socketId);
    pendingCandidates.current.delete(socketId);
    peerConnectionsRef.current.delete(socketId);

    setRemoteStreams((current) =>
      current.filter(
        (item) => item.participant.socketId !== socketId,
      ),
    );

    setPresent((current) =>
      current.filter((member) => member.socketId !== socketId),
    );

    presentRef.current = presentRef.current.filter(
      (member) => member.socketId !== socketId,
    );
  }, []);

  const createPeer = useCallback(
    async (participant: Participant, offer: boolean) => {
      if (
        !socket ||
        peers.current.has(participant.socketId) ||
        !localStream.current
      ) {
        return peers.current.get(participant.socketId);
      }

      // Generate TLS certificate for DTLS (lazy, cached)
      if (!certificateRef.current) {
        certificateRef.current = generateTLSCertificate();
      }
      const certificate = await certificateRef.current;

      const connection = new RTCPeerConnection({
        iceServers: getICEServers(),
        // DTLS-SRTp is enforced by default in modern browsers
        // Setting bundlePolicy and rtcpMuxPolicy for optimal encryption
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        certificates: [certificate],
      });

      peers.current.set(participant.socketId, connection);
      peerConnectionsRef.current.set(participant.socketId, {
        offerSent: false,
        remoteDescriptionSet: false,
      });

      localStream.current.getTracks().forEach((track) => {
        connection.addTrack(track, localStream.current as MediaStream);
      });

      connection.getSenders().forEach((sender) => {
        if (!sender.track) return;

        const parameters = sender.getParameters();
        const encodings = parameters.encodings ?? [{}];

        encodings[0].maxBitrate =
          sender.track.kind === "video" ? 900_000 : 64_000;

        if (sender.track.kind === "video") {
          encodings[0].maxFramerate = 24;
        }

        parameters.encodings = encodings;

        void sender.setParameters(parameters).catch(() => undefined);
      });

      connection.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(participant.socketId, {
            kind: "candidate",
            payload: event.candidate.toJSON(),
          });
        }
      };

      connection.oniceconnectionstatechange = () => {
        const state = connection.iceConnectionState;
        if (state === "connected" || state === "completed") {
          setEncrypted(true);
          updateConnectionQuality();
        }
      };

      connection.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;

        setRemoteStreams((current) => {
          const existingIndex = current.findIndex(
            (item) =>
              item.participant.socketId === participant.socketId,
          );

          if (existingIndex !== -1) {
            const next = [...current];
            next[existingIndex] = { participant, stream };
            return next;
          }

          return [...current, { participant, stream }];
        });
      };

      if (offer) {
        void connection
          .createOffer()
          .then((description) =>
            connection.setLocalDescription(description).then(() => {
              const peerData = peerConnectionsRef.current.get(participant.socketId);
              if (peerData) peerData.offerSent = true;
              sendSignal(participant.socketId, {
                kind: "offer",
                payload: description,
              });
            }),
          )
          .catch((error) => {
            console.error("Failed to create call offer:", error);
          });
      }

      return connection;
    },
    [sendSignal, socket, updateConnectionQuality],
  );

  const stop = useCallback(() => {
    socket?.emit("leave-call", roomId);

    peers.current.forEach((connection) => connection.close());
    peers.current.clear();
    pendingCandidates.current.clear();
    peerConnectionsRef.current.clear();

    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;

    if (localVideo.current) {
      localVideo.current.srcObject = null;
    }

    if (speakingFrame.current !== null) {
      cancelAnimationFrame(speakingFrame.current);
    }

    speakingFrame.current = null;

    void audioContext.current?.close();
    audioContext.current = null;
    analyser.current = null;

    setSpeaking(false);
    setMuted(false);
    setCamera(video);
    setRemoteStreams([]);
    setPresent([]);
    presentRef.current = [];
    setDuration(0);
    setActive(false);
    setEncrypted(false);
    setConnectionQuality("good");
  }, [roomId, socket, video]);

  const start = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: video
          ? {
              width: { ideal: 640, max: 1280 },
              height: { ideal: 360, max: 720 },
              frameRate: { ideal: 24, max: 30 },
            }
          : false,
      });

      localStream.current = media;

      if (localVideo.current) {
        localVideo.current.srcObject = media;
      }

      const context = new AudioContext();
      await context.resume();

      const source = context.createMediaStreamSource(media);
      const meter = context.createAnalyser();

      meter.fftSize = 512;
      source.connect(meter);

      audioContext.current = context;
      analyser.current = meter;

      const samples = new Uint8Array(meter.fftSize);

      const monitor = () => {
        if (!localStream.current || !analyser.current) return;

        const track = localStream.current.getAudioTracks()[0];

        meter.getByteTimeDomainData(samples);

        const level = Math.sqrt(
          samples.reduce(
            (sum, sample) =>
              sum + ((sample - 128) / 128) ** 2,
            0,
          ) / samples.length,
        );

        setSpeaking(Boolean(track?.enabled && level > 0.012));
        speakingFrame.current = requestAnimationFrame(monitor);
      };

      monitor();

      const localParticipant = normalizeParticipant({
        ...self,
        socketId: `local:${self.id}`,
      });

      setPresent((current) =>
        mergeParticipants([localParticipant, ...current]),
      );

      setActive(true);
    } catch (error) {
      console.error("Unable to start call:", error);
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
      setActive(false);
    }
  };

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!active || !socket || !isConnected || !localStream.current) {
      return;
    }

    const participantBySocket = (socketId: string): Participant => {
      const known = presentRef.current.find(
        (item) => item.socketId === socketId,
      );

      return known ?? { ...self, socketId };
    };

    const onExistingPeers = (members: Participant[]) => {
      members.forEach((member) => {
        const participant = normalizeParticipant(member);
        void createPeer(participant, true);
      });
    };

    const onPresence = (members: Participant[]) => {
      const localParticipant = normalizeParticipant({
        ...self,
        socketId: `local:${self.id}`,
      });

      const withoutLocalDuplicate = members.filter(
        (member) =>
          member.id !== self.id &&
          member.socketId !== localParticipant.socketId,
      );

      syncPresence([localParticipant, ...withoutLocalDuplicate]);
    };

    const onPeerLeft = ({ socketId }: { socketId: string }) => {
      closePeer(socketId);
    };

    const onSignal = async ({
      fromId,
      participant: signalParticipant,
      signal,
    }: {
      fromId: string;
      participant?: Participant;
      signal: Signal;
    }) => {
      const participant = normalizeParticipant(
        signalParticipant ?? participantBySocket(fromId),
      );

      // Fix ICE candidate race: use fromId consistently as the key
      const connection = await createPeer(participant, false);
      if (!connection) return;

      try {
        if (signal.kind === "offer") {
          await connection.setRemoteDescription(
            signal.payload as RTCSessionDescriptionInit,
          );

          // Mark remote description as set
          const peerData = peerConnectionsRef.current.get(fromId);
          if (peerData) peerData.remoteDescriptionSet = true;

          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);

          sendSignal(fromId, {
            kind: "answer",
            payload: answer,
          });

          // Process any pending ICE candidates
          const candidates = pendingCandidates.current.get(fromId) ?? [];
          for (const candidate of candidates) {
            await connection.addIceCandidate(candidate);
          }
          pendingCandidates.current.delete(fromId);
        } else if (signal.kind === "answer") {
          await connection.setRemoteDescription(
            signal.payload as RTCSessionDescriptionInit,
          );

          // Mark remote description as set
          const peerData = peerConnectionsRef.current.get(fromId);
          if (peerData) peerData.remoteDescriptionSet = true;

          // Process any pending ICE candidates
          const candidates = pendingCandidates.current.get(fromId) ?? [];
          for (const candidate of candidates) {
            await connection.addIceCandidate(candidate);
          }
          pendingCandidates.current.delete(fromId);
        } else {
          const candidate = signal.payload as RTCIceCandidateInit;

          // If remote description is set, add candidate immediately
          // Otherwise, queue it for later (fixes race condition)
          const peerData = peerConnectionsRef.current.get(fromId);
          if (peerData?.remoteDescriptionSet) {
            await connection.addIceCandidate(candidate);
          } else {
            // Queue candidate for when remote description arrives
            const existing = pendingCandidates.current.get(fromId) ?? [];
            pendingCandidates.current.set(fromId, [...existing, candidate]);
          }
        }
      } catch (error) {
        console.error("Call signaling failed:", error);
      }
    };

    socket.on("call-existing-peers", onExistingPeers);
    socket.on("call-presence", onPresence);
    socket.on("call-peer-left", onPeerLeft);
    socket.on("call-signal", onSignal);

    socket.emit("join-call", {
      roomId,
      participant: currentParticipant,
    });

    return () => {
      socket.emit("leave-call", roomId);
      socket.off("call-existing-peers", onExistingPeers);
      socket.off("call-presence", onPresence);
      socket.off("call-peer-left", onPeerLeft);
      socket.off("call-signal", onSignal);
    };
  }, [
    active,
    closePeer,
    createPeer,
    currentParticipant,
    isConnected,
    roomId,
    self,
    sendSignal,
    socket,
    syncPresence,
  ]);

  useEffect(() => {
    if (!active) return;

    const timer = window.setInterval(
      () => setDuration((value) => value + 1),
      1000,
    );

    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    document.body.classList.toggle("call-room-inactive", !active);
    return () => {
      document.body.classList.remove("call-room-inactive");
    };
  }, [active]);

  useEffect(() => {
    document.body.classList.toggle("call-room-speaking", speaking);
    return () => {
      document.body.classList.remove("call-room-speaking");
    };
  }, [speaking]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (
        event as CustomEvent<{ muted: boolean; deafened: boolean }>
      ).detail;

      setMuted(detail.muted);
      setDeafened(detail.deafened);

      const track = localStream.current?.getAudioTracks()[0];

      if (track) {
        track.enabled = !detail.muted;
      }
    };

    window.addEventListener("syncmove:audio-controls", receive);

    return () => {
      window.removeEventListener("syncmove:audio-controls", receive);
    };
  }, []);

  const toggleMute = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const toggleCamera = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setCamera(track.enabled);
  };

  const visible = present.slice(0, MAX_VISIBLE_AVATARS);

  const durationText = `${Math.floor(duration / 60)
    .toString()
    .padStart(2, "0")}:${(duration % 60)
    .toString()
    .padStart(2, "0")}`;

  const stageMembers = present.length
    ? present
    : [normalizeParticipant({ ...self, socketId: `local:${self.id}` })];

  const qualityColor =
    connectionQuality === "excellent"
      ? "#23a559"
      : connectionQuality === "good"
        ? "#23a559"
        : connectionQuality === "fair"
          ? "#f0b232"
          : "#f04142";

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-[#1e1f22] text-white">
      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-white/5 bg-[#2b2d31]/80 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[#5865f2]/20 p-2 text-[#a5b4fc]">
            <Activity className="h-5 w-5" />
          </div>

          <div>
            <h2 className="font-semibold">
              {video ? "Video call" : "Voice call"}
            </h2>
            <p className="text-xs text-[#949ba4]">
              {active
                ? `Connected · ${durationText}`
                : "Ready to connect"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#b5bac1]">
          {/* Encryption indicator */}
          <span className="flex items-center gap-1.5">
            {encrypted ? (
              <ShieldCheck className="h-4 w-4 text-[#23a559]" />
            ) : (
              <Shield className="h-4 w-4 text-[#f0b232]" />
            )}
            {encrypted ? "Encrypted" : "Connecting..."}
          </span>

          {/* Connection quality */}
          <span className="flex items-center gap-1.5">
            <Wifi
              className="h-4 w-4"
              style={{ color: qualityColor }}
            />
            {connectionQuality}
          </span>

          {/* Participant count */}
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {present.length || 1} in call
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
                  ? `${present.length || 1} connected · ${visible.length} avatars shown`
                  : `${stageMembers.length} in this call`}
              </p>
            </div>

            <div className="flex -space-x-2">
              {stageMembers
                .slice(0, MAX_VISIBLE_AVATARS)
                .map((member) => (
                  <div
                    key={member.socketId}
                    className="relative overflow-hidden rounded-full border-2 border-[#2b2d31] bg-[#111214] ring-2 ring-[#2b2d31]"
                  >
                    <Image
                      src={member.imageUrl}
                      alt={member.name}
                      title={member.name}
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  </div>
                ))}
            </div>
          </div>

          <div
            className={`grid gap-4 ${
              video ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {/* Local video */}
            <div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#111214]">
              <video
                ref={localVideo}
                autoPlay
                muted
                playsInline
                style={{
                  transform: video ? "scaleX(-1)" : undefined,
                }}
                className={`${
                  video ? "aspect-video" : "h-24"
                } w-full object-cover ${!video ? "opacity-0" : ""}`}
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

              <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1.5 text-xs">
                {currentParticipant.name} (You)
                {muted ? " · muted" : ""}
              </span>
            </div>

            {/* Remote streams */}
            {remoteStreams.map((item) => (
              <RemoteTile
                key={item.participant.socketId}
                {...item}
                video={video}
              />
            ))}

            {/* Waiting state */}
            {active && !remoteStreams.length && (
              <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-[#404249] text-sm text-[#949ba4]">
                Waiting for other members to join...
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111214]/95 p-2 shadow-xl backdrop-blur">
          {!active ? (
            <Button
              onClick={() => void start()}
              className="h-11 rounded-xl bg-[#5865f2] px-5 hover:bg-[#4752c4] transition-colors"
            >
              <Phone className="mr-2 h-4 w-4" />
              Join call
            </Button>
          ) : (
            <>
              <Button
                title={muted ? "Unmute microphone" : "Mute microphone"}
                onClick={toggleMute}
                className="h-11 w-11 rounded-xl bg-[#2b2d31] hover:bg-[#404249] transition-colors"
              >
                {muted ? <MicOff /> : <Mic />}
              </Button>

              {video && (
                <Button
                  title={camera ? "Turn off camera" : "Turn on camera"}
                  onClick={toggleCamera}
                  className="h-11 w-11 rounded-xl bg-[#2b2d31] hover:bg-[#404249] transition-colors"
                >
                  {camera ? <Video /> : <VideoOff />}
                </Button>
              )}

              <Button
                title="Leave call"
                variant="destructive"
                onClick={stop}
                className="h-11 w-14 rounded-xl transition-colors"
              >
                <PhoneOff />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};