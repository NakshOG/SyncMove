import { currentProfile } from "@/lib/current-profile";
import { canManageServer, getServerMember } from "@/lib/server-access";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ channelID: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { channelID } = await params;
  const channel = await db.channel.findUnique({ where: { id: channelID } });
  if (!channel) return new NextResponse("Channel not found", { status: 404 });
  const member = await getServerMember(channel.serverId, profile.id);
  if (!member || !canManageServer(member.role)) return new NextResponse("Forbidden", { status: 403 });
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return new NextResponse("Name is required", { status: 400 });
  return NextResponse.json(await db.channel.update({ where: { id: channelID }, data: { name } }));
}

export async function DELETE(_req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { channelID } = await params;
  const channel = await db.channel.findUnique({ where: { id: channelID } });
  if (!channel) return new NextResponse("Channel not found", { status: 404 });
  const member = await getServerMember(channel.serverId, profile.id);
  if (!member || !canManageServer(member.role)) return new NextResponse("Forbidden", { status: 403 });
  if (channel.type === "TEXT") {
    const count = await db.channel.count({ where: { serverId: channel.serverId, type: "TEXT" } });
    if (count <= 1) return new NextResponse("A server must keep one text channel", { status: 400 });
  }
  await db.channel.delete({ where: { id: channelID } });
  return NextResponse.json({ ok: true });
}
