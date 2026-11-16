import Wifi from "lucide-react/dist/esm/icons/wifi";

import { cn } from "@/lib/utils";

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("flex items-center gap-3", className)} aria-label="轻连 WiFi">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Wifi className="size-6 stroke-[1.75]" aria-hidden="true" />
      </span>
      {compact ? null : (
        <span className="text-xl font-semibold tracking-tight">
          轻连 <span className="text-primary">WiFi</span>
        </span>
      )}
    </div>
  );
}
