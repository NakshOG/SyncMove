import { MemberRole } from "@/generated/prisma/enums";
import { currentProfile } from "@/lib/current-profile";
import { canAdministerServer, canManageServer, getServerMember } from "@/lib/server-access";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { publishServerEvent } from "@/lib/realtime";

type Context = { params: Promise<{ serverID: string; memberID: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { serverID, memberID } = await params;
  const actor = await getServerMember(serverID, profile.id);
  if (!actor || !canManageServer(actor.role)) return new NextResponse("Forbidden", { status: 403 });
  const body = await req.json();
  const role = body.role as MemberRole;
  if (role !== MemberRole.GUEST && role !== MemberRole.MODERATOR) {
    return new NextResponse("Invalid role", { status: 400 });
  }
  const target = await db.member.findUnique({ where: { id: memberID } });
  if (!target || target.serverId !== serverID) return new NextResponse("Member not found", { status: 404 });
  if (target.role === MemberRole.ADMIN || (actor.role !== MemberRole.ADMIN && role === MemberRole.MODERATOR)) {
    return new NextResponse("Only the server owner can manage this member", { status: 403 });
  }
  const member = await db.member.update({ where: { id: memberID }, data: { role } });
  publishServerEvent(serverID, { type: "member-role-updated", memberId: memberID, role });
  return NextResponse.json(member);
}

export async function DELETE(_req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { serverID, memberID } = await params;
  const actor = await getServerMember(serverID, profile.id);
  if (!actor || !canAdministerServer(actor.role)) return new NextResponse("Forbidden", { status: 403 });
  const target = await db.member.findUnique({ where: { id: memberID } });
  if (!target || target.serverId !== serverID || target.role === MemberRole.ADMIN) {
    return new NextResponse("Member cannot be removed", { status: 400 });
  }
  await db.member.delete({ where: { id: memberID } });
  publishServerEvent(serverID, { type: "member-left", memberId: memberID });
  return NextResponse.json({ ok: true });
}
