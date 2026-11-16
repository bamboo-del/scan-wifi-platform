import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Map from "lucide-react/dist/esm/icons/map";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function NotFoundPage(): React.JSX.Element {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Map />
        </EmptyMedia>
        <EmptyTitle>页面不存在</EmptyTitle>
        <EmptyDescription>这个管理页面可能已移动，或地址输入有误。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/">
            <ArrowLeft data-icon="inline-start" />
            返回仪表盘
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
