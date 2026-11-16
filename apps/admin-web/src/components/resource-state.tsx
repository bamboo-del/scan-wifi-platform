import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert";
import Inbox from "lucide-react/dist/esm/icons/inbox";
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export function ResourceError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>加载失败</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{error.message}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw data-icon="inline-start" />
          重新加载
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function ResourceEmpty({
  title = "暂无数据",
  description = "当前筛选条件下没有可显示的内容。",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 p-5" aria-label="正在加载列表" aria-live="polite">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="grid grid-cols-5 gap-5">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className="h-5 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6" aria-label="页面加载中" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
