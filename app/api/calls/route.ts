import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

const authorized = async (roomId: string, profileId: string) => db.channel.findFirst({ where: { id: roomId, server: { members: { some: { profileId } } } } });

export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");
  const after = searchParams.get("after");
  if (!roomId || !(await authorized(roomId, profile.id))) return new NextResponse("Forbidden", { status: 403 });
  const signals = await db.callSignal.findMany({ where: { roomId, ...(after ? { id: { gt: after } } : {}) }, orderBy: { CreatedAt: "asc" }, take: 100 });
  return NextResponse.json(signals.filter((signal) => signal.senderId !== profile.id).map((signal) => ({ ...signal, payload: JSON.parse(signal.payload) })));
}

export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { roomId, kind, payload } = await req.json();
  if (!roomId || !["offer", "answer", "candidate", "hangup"].includes(kind) || !(await authorized(roomId, profile.id))) return new NextResponse("Invalid call signal", { status: 400 });
  const signal = await db.callSignal.create({ data: { roomId, senderId: profile.id, kind, payload: JSON.stringify(payload) } });
  return NextResponse.json({ ...signal, payload }, { status: 201 });
}
