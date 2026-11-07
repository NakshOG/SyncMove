"use client";

import { cn } from "@/lib/utils";

interface MemberListSkeletonProps {
  className?: string;
}

export function MemberListSkeleton({ className }: MemberListSkeletonProps) {
  return (
    <div className={cn("space-y-0.5", className)}>
      {/* Header placeholder */}
      <div className="mb-4 px-2">
        <div className="h-4 w-24 animate-pulse rounded bg-[#35373c]" />
      </div>
      
      {/* Member items */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md px-2 py-1.5"
        >
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[#35373c]" />
          <div className="flex-1 space-y-1">
            <div className="h-3 w-24 animate-pulse rounded bg-[#35373c]" />
            <div className="h-2.5 w-16 animate-pulse rounded bg-[#35373c]" />
          </div>
        </div>
      ))}
    </div>
  );
}
