import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { publishConversationEvent } from "@/lib/realtime";

type Context = { params: Promise<{ conversationID: string }> };

const getConversation = async (conversationID: string, profileId: string) => {
  const members = await db.member.findMany({ where: { profileId }, select: { id: true } });
  const ids = members.map((member) => member.id);
  return db.conversation.findFirst({ where: { id: conversationID, OR: [{ memberOneId: { in: ids } }, { memberTwoId: { in: ids } }] } });
};

export async function GET(_req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const conversation = await getConversation((await params).conversationID, profile.id);
  if (!conversation) return new NextResponse("Conversation not found", { status: 404 });
  return NextResponse.json(await db.directMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { CreatedAt: "asc" }, include: { member: { include: { profile: true } } } }));
}

export async function POST(req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const conversation = await getConversation((await params).conversationID, profile.id);
  if (!conversation) return new NextResponse("Conversation not found", { status: 404 });
  const member = await db.member.findFirst({ where: { profileId: profile.id, OR: [{ id: conversation.memberOneId }, { id: conversation.memberTwoId }] } });
  const { content, fileUrl } = await req.json();
  if (!member || (!content && !fileUrl)) return new NextResponse("Invalid message", { status: 400 });
  const message = await db.directMessage.create({ data: { content: content || "Attachment", fileUrl, conversationId: conversation.id, memberId: member.id }, include: { member: { include: { profile: true } } } });
  publishConversationEvent(conversation.id, { type: "created", message });
  return NextResponse.json(message, { status: 201 });
}
