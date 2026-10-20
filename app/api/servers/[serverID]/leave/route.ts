import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ serverID: string }> };

export async function POST(_req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { serverID } = await params;
  const member = await db.member.findUnique({ where: { profileId_serverId: { profileId: profile.id, serverId: serverID } } });
  if (!member) return new NextResponse("Membership not found", { status: 404 });
  if (member.role === "ADMIN") return new NextResponse("The server owner must delete the server", { status: 400 });
  await db.member.delete({ where: { id: member.id } });
  return NextResponse.json({ ok: true });
}
