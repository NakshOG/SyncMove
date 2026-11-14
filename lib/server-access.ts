import { MemberRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export const getServerMember = async (serverId: string, profileId: string) => {
  return db.member.findUnique({
    where: {
      profileId_serverId: { profileId, serverId },
    },
    include: { server: true, profile: true },
  });
};

export const canManageServer = (role: MemberRole) =>
  role === MemberRole.ADMIN || role === MemberRole.MODERATOR;

export const canAdministerServer = (role: MemberRole) =>
  role === MemberRole.ADMIN;
