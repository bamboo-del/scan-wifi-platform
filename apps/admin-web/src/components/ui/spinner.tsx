import LoaderCircle from "lucide-react/dist/esm/icons/loader-circle";

import { cn } from "@/lib/utils";

function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof LoaderCircle>): React.JSX.Element {
  return (
    <LoaderCircle
      role="status"
      aria-label="加载中"
      className={cn("animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
