import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:translate-y-0.5 [&>svg]:stroke-[1.75]",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive: "border-destructive/25 bg-destructive/5 text-destructive",
        success: "border-success/25 bg-success/5 text-foreground",
        warning: "border-warning/30 bg-warning/5 text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>): React.JSX.Element {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">): React.JSX.Element {
  return <h5 className={cn("col-start-2 font-medium leading-none", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      className={cn("col-start-2 text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
