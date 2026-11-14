import { MemberRole } from "@/generated/prisma/enums";
import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { publishChannelEvent } from "@/lib/realtime";

type Context = { params: Promise<{ messageID: string }> };

export async function PATCH(req: Request, { params }: Context) {
  return updateMessage(req, await params);
}

export async function DELETE(_req: Request, { params }: Context) {
  return updateMessage(null, await params, true);
}

async function updateMessage(req: Request | null, { messageID }: { messageID: string }, deleted = false) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });

  const message = await db.message.findUnique({
    where: { id: messageID },
    include: { member: true, channel: { include: { server: { include: { members: true } } } } },
  });
  if (!message) return new NextResponse("Message not found", { status: 404 });
  const member = message.channel.server.members.find((item) => item.profileId === profile.id);
  if (!member) return new NextResponse("Unauthorized", { status: 401 });

  const canModerate = member.role === MemberRole.ADMIN || member.role === MemberRole.MODERATOR;
  if (message.member.profileId !== profile.id && !canModerate) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  if (deleted) {
    const deletedMessage = await db.message.update({
      where: { id: messageID },
      data: { content: "This message has been deleted.", fileUrl: null, deleted: true },
      include: { member: { include: { profile: true } } },
    });
    publishChannelEvent(message.channelId, { type: "deleted", message: deletedMessage });
    return NextResponse.json(deletedMessage);
  }

  const body = await req!.json();
  if (typeof body.pinned === "boolean") {
    const pinnedMessage = await db.message.update({
      where: { id: messageID },
      data: { pinned: body.pinned },
      include: { member: { include: { profile: true } } },
    });
    publishChannelEvent(message.channelId, { type: "updated", message: pinnedMessage });
    return NextResponse.json(pinnedMessage);
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return new NextResponse("Content is required", { status: 400 });
  const updatedMessage = await db.message.update({
    where: { id: messageID },
    data: { content },
    include: { member: { include: { profile: true } } },
  });
  publishChannelEvent(message.channelId, { type: "updated", message: updatedMessage });
  return NextResponse.json(updatedMessage);
}
