"use client";

export function ChatMessagesSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 animate-pulse"
        >
          <div className="h-10 w-10 shrink-0 rounded-full bg-[#35373c]" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-24 rounded bg-[#35373c]" />
              <div className="h-3 w-16 rounded bg-[#35373c]" />
            </div>
            <div className="h-4 w-3/4 rounded bg-[#35373c]" />
            <div className="h-4 w-1/2 rounded bg-[#35373c]" />
          </div>
        </div>
      ))}
    </div>
  );
}
