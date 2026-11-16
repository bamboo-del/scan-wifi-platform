import Circle from "lucide-react/dist/esm/icons/circle";

import { Badge } from "@/components/ui/badge";
import type { StoreStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: StoreStatus | null }): React.JSX.Element {
  if (status === "active") {
    return (
      <Badge variant="success">
        <Circle className="fill-current" aria-hidden="true" />
        启用
      </Badge>
    );
  }
  if (status === "disabled") {
    return (
      <Badge variant="secondary">
        <Circle className="fill-current" aria-hidden="true" />
        停用
      </Badge>
    );
  }
  return <Badge variant="outline">未生成</Badge>;
}
