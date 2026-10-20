"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Mic, MicOff, Phone, PhoneOff, Users, Video, VideoOff, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useSocket } from "@/components/providers/socket-provider";

type Participant = { id: string; name: string; imageUrl: string };
const MAX_PARTICIPANTS = 5;

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
};

const limitSenderBitrate = async (sender: RTCRtpSender, maxBitrate: number, maxFramerate?: number) => {
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) parameters.encodings = [{}];
  parameters.encodings = parameters.encodings.map((encoding) => ({
    ...encoding,
    maxBitrate,
    ...(maxFramerate ? { maxFramerate } : {}),
  }));
  try {
    await sender.setParameters(parameters);
  } catch {
    // Some browsers do not allow changing sender parameters immediately.
  }
};

export const CallRoom = ({ roomId, video, currentParticipant, participants }: { roomId: string; video: boolean; currentParticipant: Participant; participants: Participant[] }) => {
  const peer = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const lastSignal = useRef("");
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [present, setPresent] = useState<Participant[]>([]);
  const [duration, setDuration] = useState(0);
  const { socket, isConnected } = useSocket();

  const signal = useCallback(async (kind: string, payload: unknown) => { await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, kind, payload }) }); }, [roomId]);
  const stop = useCallback(() => { socket?.emit("leave-call", roomId); setPresent([]); setDuration(0); stream.current?.getTracks().forEach((track) => track.stop()); peer.current?.close(); peer.current = null; setActive(false); void signal("hangup", null); }, [roomId, signal, socket]);
  const start = async () => {
    const local = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      video: video ? { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 }, frameRate: { ideal: 24, max: 30 }, facingMode: "user" } : false,
    });
    stream.current = local;
    const localAudio = local.getAudioTracks()[0];
    if (localAudio) localAudio.enabled = !muted;
    if (localVideo.current) localVideo.current.srcObject = local;
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peer.current = connection;
    local.getTracks().forEach((track) => {
      const sender = connection.addTrack(track, local);
      void limitSenderBitrate(sender, track.kind === "video" ? 650_000 : 32_000, track.kind === "video" ? 24 : undefined);
    });
    connection.ontrack = (event) => { if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0]; };
    connection.onicecandidate = (event) => { if (event.candidate) void signal("candidate", event.candidate); };
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await signal("offer", offer);
    setActive(true);
  };
  useEffect(() => {
    const poll = window.setInterval(async () => {
      if (!active) return;
      const response = await fetch(`/api/calls?roomId=${roomId}&after=${encodeURIComponent(lastSignal.current)}`, { cache: "no-store" });
      if (!response.ok) return;
      const signals = await response.json() as { id: string; kind: string; payload: RTCSessionDescriptionInit | RTCIceCandidateInit }[];
      for (const item of signals) {
        lastSignal.current = item.id;
        if (item.kind === "offer" && peer.current) { await peer.current.setRemoteDescription(item.payload as RTCSessionDescriptionInit); const answer = await peer.current.createAnswer(); await peer.current.setLocalDescription(answer); await signal("answer", answer); }
        if (item.kind === "answer" && peer.current) await peer.current.setRemoteDescription(item.payload as RTCSessionDescriptionInit);
        if (item.kind === "candidate" && peer.current) await peer.current.addIceCandidate(item.payload as RTCIceCandidateInit);
        if (item.kind === "hangup") stop();
      }
    }, 1500);
    return () => window.clearInterval(poll);
  }, [active, roomId, signal, stop]);
  useEffect(() => {
    if (!active || !socket || !isConnected) return;
    // Keep every connected member in state. The five-member limit is display-only.
    const receivePresence = (members: Participant[]) => setPresent(members);
    socket.emit("join-call", { roomId, participant: currentParticipant });
    socket.on("call-presence", receivePresence);
    return () => { socket.emit("leave-call", roomId); socket.off("call-presence", receivePresence); };
  }, [active, currentParticipant, isConnected, roomId, socket]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setDuration((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => {
    const receiveAudioState = (event: Event) => {
      const detail = (event as CustomEvent<{ muted: boolean; deafened: boolean }>).detail;
      setMuted(detail.muted);
      setDeafened(detail.deafened);
      const localAudio = stream.current?.getAudioTracks()[0];
      if (localAudio) localAudio.enabled = !detail.muted;
      if (remoteVideo.current) remoteVideo.current.muted = detail.deafened;
    };
    window.addEventListener("syncmove:audio-controls", receiveAudioState);
    return () => window.removeEventListener("syncmove:audio-controls", receiveAudioState);
  }, []);
  const toggleMute = () => { const track = stream.current?.getAudioTracks()[0]; if (!track) return; track.enabled = !track.enabled; setMuted(!track.enabled); };
  const toggleVideo = () => { const track = stream.current?.getVideoTracks()[0]; if (!track) return; track.enabled = !track.enabled; setVideoEnabled(track.enabled); };
  const participantById = new Map(participants.map((member) => [member.id, member]));
  const visibleParticipants = active
    ? (present.length ? present : [currentParticipant])
        .slice(0, MAX_PARTICIPANTS)
        .map((member) => participantById.get(member.id) ?? member)
    : [];
  const callMemberCount = active ? (present.length || 1) : 0;
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-[#1e1f22] text-white">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#5865f2]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-[#8b5cf6]/10 blur-3xl" />
      <div className="relative flex items-center justify-between border-b border-white/5 bg-[#2b2d31]/80 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3"><div className="rounded-lg bg-[#5865f2]/20 p-2 text-[#a5b4fc]"><Activity className="h-5 w-5" /></div><div><h2 className="font-semibold tracking-tight">{video ? "Video call" : "Voice call"}</h2><div className="flex items-center gap-2 text-xs text-[#b5bac1]"><span className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-[#23a559]" : "bg-[#80848e]"}`} />{active ? "Connected" : "Ready to connect"}{active && <span className="text-[#80848e]">· {formatDuration(duration)}</span>}</div></div></div>
        <div className="flex items-center gap-3 text-xs text-[#b5bac1]"><span className="hidden items-center gap-1.5 sm:flex"><Wifi className="h-4 w-4 text-[#23a559]" /> {deafened ? "Audio muted" : "Low bandwidth mode"}</span><span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {callMemberCount} in call</span></div>
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-auto p-5 sm:p-8">
        <div className="w-full max-w-4xl rounded-2xl border border-white/5 bg-[#2b2d31]/90 p-4 shadow-2xl shadow-black/20 sm:p-6">
          <div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-medium text-[#dbdee1]">In this call</p><p className="text-xs text-[#949ba4]">{active ? `${visibleParticipants.length} member${visibleParticipants.length === 1 ? "" : "s"} present` : "Your call is waiting for you"}</p></div><div className="flex -space-x-2">{visibleParticipants.map((member, index) => <div key={member.id} title={member.name} className={`relative rounded-full border-2 border-[#2b2d31] ${index === 0 ? "animate-pulse" : ""}`}><Image src={member.imageUrl} alt={member.name} width={36} height={36} unoptimized className="h-9 w-9 rounded-full object-cover" /><span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#2b2d31] bg-[#23a559]" /></div>)}</div></div>
          <div className={`grid w-full gap-4 ${video ? "md:grid-cols-2" : "md:grid-cols-1"}`}><div className="group relative overflow-hidden rounded-xl border border-white/5 bg-[#1e1f22] shadow-lg"><video ref={localVideo} autoPlay muted playsInline style={{ transform: video ? "scaleX(-1)" : undefined }} className={`${video ? "aspect-video" : "h-24"} w-full object-cover ${!video ? "opacity-0" : ""}`} /><div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs backdrop-blur"><Image src={currentParticipant.imageUrl} alt={currentParticipant.name} width={20} height={20} unoptimized className="h-5 w-5 rounded-full" /><span>{currentParticipant.name} (You)</span>{muted && <MicOff className="h-3.5 w-3.5 text-[#f23f42]" />}</div>{!video && <div className="absolute inset-0 flex items-center justify-center"><Image src={currentParticipant.imageUrl} alt={currentParticipant.name} width={88} height={88} unoptimized className="h-20 w-20 rounded-full ring-4 ring-[#5865f2]/30" /></div>}</div><div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#1e1f22] shadow-lg"><video ref={remoteVideo} autoPlay playsInline className={`${video ? "aspect-video" : "h-24"} w-full object-cover ${!video ? "opacity-0" : ""}`} /><div className="absolute inset-0 flex items-center justify-center text-center text-sm text-[#949ba4]">{active ? "Waiting for another member…" : "Join to start talking"}</div></div></div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1e1f22]/90 p-2 shadow-xl backdrop-blur">{!active ? <Button onClick={start} className="h-11 rounded-xl bg-[#5865f2] px-5 font-semibold shadow-lg shadow-[#5865f2]/20 hover:bg-[#4752c4]"><Phone className="mr-2 h-4 w-4" />Join call</Button> : <><Button aria-label={muted ? "Unmute microphone" : "Mute microphone"} title={muted ? "Unmute microphone" : "Mute microphone"} variant="secondary" onClick={toggleMute} className="h-11 w-11 rounded-xl bg-[#2b2d31] hover:bg-[#404249]">{muted ? <MicOff className="text-[#f23f42]" /> : <Mic />}</Button>{video && <Button aria-label={videoEnabled ? "Turn off camera" : "Turn on camera"} title={videoEnabled ? "Turn off camera" : "Turn on camera"} variant="secondary" onClick={toggleVideo} className="h-11 w-11 rounded-xl bg-[#2b2d31] hover:bg-[#404249]">{videoEnabled ? <Video /> : <VideoOff className="text-[#f23f42]" />}</Button>}<Button aria-label="Leave call" title="Leave call" variant="destructive" onClick={stop} className="h-11 w-14 rounded-xl"><PhoneOff /></Button></>}</div>
        <p className="text-center text-xs text-[#949ba4]">Optimized for calls: 720p max · 24 FPS · adaptive audio · showing up to {MAX_PARTICIPANTS} avatars</p>
      </div>
    </div>
  );
};
