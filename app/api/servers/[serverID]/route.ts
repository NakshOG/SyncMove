import { currentProfile } from "@/lib/current-profile";
import { canAdministerServer, getServerMember } from "@/lib/server-access";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ serverID: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { serverID } = await params;
  const member = await getServerMember(serverID, profile.id);
  if (!member || !canAdministerServer(member.role)) return new NextResponse("Forbidden", { status: 403 });
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const imageURL = typeof body.imageURL === "string" ? body.imageURL : undefined;
  if (!name && !imageURL) return new NextResponse("Nothing to update", { status: 400 });
  return NextResponse.json(await db.server.update({ where: { id: serverID }, data: { ...(name ? { name } : {}), ...(imageURL ? { imageURL } : {}) } }));
}

export async function DELETE(_req: Request, { params }: Context) {
  const profile = await currentProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  const { serverID } = await params;
  const member = await getServerMember(serverID, profile.id);
  if (!member || !canAdministerServer(member.role)) return new NextResponse("Forbidden", { status: 403 });
  await db.server.delete({ where: { id: serverID } });
  return NextResponse.json({ ok: true });
}
