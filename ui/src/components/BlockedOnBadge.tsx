import { useState } from "react";
import { User, Bot, Globe, Ban } from "lucide-react";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { BlockedOnKind } from "@paperclipai/shared";

const blockedOnConfig: Record<string, { icon: typeof User; label: string; color: string }> = {
  board: { icon: User, label: "Board", color: "text-orange-600 dark:text-orange-400" },
  agent: { icon: Bot, label: "Agent", color: "text-amber-600 dark:text-amber-400" },
  external: { icon: Globe, label: "External", color: "text-red-600 dark:text-red-400" },
};

const allBlockedOnKinds: BlockedOnKind[] = ["board", "agent", "external"];

interface BlockedOnBadgeProps {
  blockedOn: BlockedOnKind | null;
  onChange?: (blockedOn: BlockedOnKind | null) => void;
  showLabel?: boolean;
}

export function BlockedOnBadge({ blockedOn, onChange, showLabel }: BlockedOnBadgeProps) {
  const [open, setOpen] = useState(false);

  const config = blockedOn ? blockedOnConfig[blockedOn] : null;
  const Icon = config?.icon ?? Ban;
  const label = config?.label ?? "Not set";
  const color = config?.color ?? "text-muted-foreground";

  const icon = (
    <span className={cn("inline-flex items-center justify-center shrink-0", color)}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );

  if (!onChange) {
    return showLabel ? (
      <span className="inline-flex items-center gap-1.5">{icon}<span className="text-sm">{label}</span></span>
    ) : icon;
  }

  const trigger = showLabel ? (
    <button className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors">
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  ) : icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full justify-start gap-2 text-xs", !blockedOn && "bg-accent")}
          onClick={() => { onChange(null); setOpen(false); }}
        >
          <Ban className="h-3.5 w-3.5 text-muted-foreground" />
          Not set
        </Button>
        {allBlockedOnKinds.map((kind) => {
          const c = blockedOnConfig[kind]!;
          const KIcon = c.icon;
          return (
            <Button
              key={kind}
              variant="ghost"
              size="sm"
              className={cn("w-full justify-start gap-2 text-xs", kind === blockedOn && "bg-accent")}
              onClick={() => { onChange(kind); setOpen(false); }}
            >
              <KIcon className={cn("h-3.5 w-3.5", c.color)} />
              {c.label}
            </Button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
