"use client";

export function DMListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md px-2 py-2"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[#35373c]" />
          <div className="flex-1 space-y-1">
            <div className="h-3.5 w-24 animate-pulse rounded bg-[#35373c]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[#35373c]" />
          </div>
        </div>
      ))}
    </div>
  );
}
