import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { publishServerEvent } from "@/lib/realtime";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ inviteCode: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { inviteCode } = await params;
  const server = await db.server.findUnique({ where: { inviteCode }, select: { id: true, name: true, imageURL: true } });
  if (!server) return new NextResponse("Invite not found", { status: 404 });
  return NextResponse.json(server);
}

export async function POST(_req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { inviteCode } = await params;
  const server = await db.server.findUnique({ where: { inviteCode } });
  if (!server) return new NextResponse("Invite not found", { status: 404 });
  await db.member.upsert({
    where: { profileId_serverId: { profileId: profile.id, serverId: server.id } },
    create: { profileId: profile.id, serverId: server.id },
    update: {},
  });
  publishServerEvent(server.id, { type: "member-joined", profileId: profile.id });
  return NextResponse.json({ serverId: server.id });
}
