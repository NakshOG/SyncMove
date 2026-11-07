import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { publishChannelEvent } from "@/lib/realtime";

export async function GET(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  const before = searchParams.get("before");
  const query = searchParams.get("q")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 10), 50);

  if (!channelId) return new NextResponse("Channel ID is required", { status: 400 });

  const channel = await db.channel.findFirst({
    where: { id: channelId, server: { members: { some: { profileId: profile.id } } } },
  });

  if (!channel) return new NextResponse("Channel not found", { status: 404 });

  const messages = await db.message.findMany({
    where: {
      channelId,
      ...(before ? { CreatedAt: { lt: new Date(before) } } : {}),
      ...(query ? { content: { contains: query } } : {}),
    },
    orderBy: { CreatedAt: "desc" },
    take: limit,
    include: { member: { include: { profile: true } } },
  });

  return NextResponse.json({ messages: messages.reverse(), hasMore: messages.length === limit, query: query ?? null });
}

export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : null;
  const channelId = typeof body.channelId === "string" ? body.channelId : "";
  const isEncrypted = body.encrypted === true;

  if (!channelId || (!content && !fileUrl)) {
    return new NextResponse("Message content or attachment is required", { status: 400 });
  }

  const channel = await db.channel.findFirst({
    where: { id: channelId, server: { members: { some: { profileId: profile.id } } } },
    include: { server: { include: { members: true } } },
  });

  if (!channel) return new NextResponse("Channel not found", { status: 404 });

  const member = channel.server.members.find((item) => item.profileId === profile.id);
  if (!member) return new NextResponse("Member not found", { status: 404 });

  const message = await db.message.create({
    data: { 
      content: content || "Attachment", 
      fileUrl, 
      channelId, 
      memberId: member.id,
    },
    include: { member: { include: { profile: true } } },
  });

  // Publish real-time event
  publishChannelEvent(channelId, { type: "created", message });

  return NextResponse.json(message, { status: 201 });
}