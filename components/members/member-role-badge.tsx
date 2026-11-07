"use client";

import { cn } from "@/lib/utils";
import { MemberRole } from "@/generated/prisma/enums";

const ROLE_LABELS: Record<MemberRole, string> = {
  [MemberRole.ADMIN]: "Admin",
  [MemberRole.MODERATOR]: "Moderator",
  [MemberRole.GUEST]: "Guest",
};

const ROLE_COLORS: Record<MemberRole, string> = {
  [MemberRole.ADMIN]: "bg-[#f23f42]/15 text-[#f23f42]",
  [MemberRole.MODERATOR]: "bg-[#f0b232]/15 text-[#f0b232]",
  [MemberRole.GUEST]: "bg-[#949ba4]/15 text-[#949ba4]",
};

interface MemberRoleBadgeProps {
  role: MemberRole;
  className?: string;
}

export function MemberRoleBadge({ role, className }: MemberRoleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        ROLE_COLORS[role] || ROLE_COLORS[MemberRole.GUEST],
        className
      )}
    >
      {ROLE_LABELS[role] || "Guest"}
    </span>
  );
}
