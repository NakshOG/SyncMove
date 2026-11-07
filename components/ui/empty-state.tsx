"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      <div className="mb-4 rounded-full bg-[#5865f2]/15 p-4 text-[#a5b4fc]">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[#949ba4]">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-xl bg-[#5865f2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4752c4]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
