import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const members = await db.member.findMany({ where: { profileId: profile.id }, select: { id: true } });
  const ids = members.map((member) => member.id);
  return NextResponse.json(await db.conversation.findMany({
    where: { OR: [{ memberOneId: { in: ids } }, { memberTwoId: { in: ids } }] },
    include: { memberOne: { include: { profile: true } }, memberTwo: { include: { profile: true } } },
  }));
}

export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { memberId } = await req.json();
  const current = await db.member.findFirst({ where: { id: memberId } });
  const mine = await db.member.findMany({ where: { profileId: profile.id } });
  const own = mine.find((member) => member.serverId === current?.serverId);
  if (!current || !own || current.id === own.id) return new NextResponse("Member not found", { status: 404 });
  const existing = await db.conversation.findFirst({ where: { OR: [{ memberOneId: own.id, memberTwoId: current.id }, { memberOneId: current.id, memberTwoId: own.id }] } });
  const conversation = existing ?? await db.conversation.create({ data: { memberOneId: own.id, memberTwoId: current.id } });
  return NextResponse.json(conversation, { status: existing ? 200 : 201 });
}
