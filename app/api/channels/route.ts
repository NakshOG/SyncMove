import { ChannelType } from "@/generated/prisma/enums";
import { currentProfile } from "@/lib/current-profile";
import { canManageServer, getServerMember } from "@/lib/server-access";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json();
  const serverId = typeof body.serverId === "string" ? body.serverId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type as ChannelType;
  if (!serverId || !name || !Object.values(ChannelType).includes(type)) {
    return new NextResponse("Invalid channel", { status: 400 });
  }
  const member = await getServerMember(serverId, profile.id);
  if (!member || !canManageServer(member.role)) return new NextResponse("Forbidden", { status: 403 });
  return NextResponse.json(await db.channel.create({
    data: { name, type, serverId, profileId: profile.id },
  }), { status: 201 });
}
