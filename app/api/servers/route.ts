import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { MemberRole } from "@/generated/prisma/enums";

export async function POST(req: Request) {
  try {
    const { name, imageUrl } = await req.json();
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (typeof name !== "string" || !name.trim()) {
      return new NextResponse("Server name is required", { status: 400 });
    }

    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
      return new NextResponse("Upload a server image before creating the server", { status: 400 });
    }

    const server = await db.server.create({
      data: {
        profileId: profile.id,
        name: name.trim(),
        imageURL: imageUrl.trim(),
        inviteCode: uuidv4(),
        channels: {
          create: [{ name: "general", profileId: profile.id }],
        },
        members: {
          create: [{ profileId: profile.id, role: MemberRole.ADMIN }],
        },
      },
    });

    return NextResponse.json(server);
  } catch (err) {
    console.error("[SERVERS_POST] Error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
