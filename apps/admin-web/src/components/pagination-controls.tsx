import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";

import { Button } from "@/components/ui/button";

export function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 border-t px-5 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>共 {total} 条</span>
      <nav aria-label="分页" className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          aria-label="上一页"
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-20 text-center text-foreground">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages}
          aria-label="下一页"
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </nav>
    </div>
  );
}
