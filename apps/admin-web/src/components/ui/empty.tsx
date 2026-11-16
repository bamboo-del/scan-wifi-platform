import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function Empty({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-h-60 w-full flex-col items-center justify-center gap-6 p-8 text-center",
        className,
      )}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return <div className={cn("flex max-w-sm flex-col items-center gap-2", className)} {...props} />;
}

const emptyMediaVariants = cva("mb-2 flex items-center justify-center text-muted-foreground", {
  variants: {
    variant: {
      default: "",
      icon: "size-11 rounded-xl bg-muted [&_svg]:size-5 [&_svg]:stroke-[1.75]",
    },
  },
  defaultVariants: { variant: "default" },
});

function EmptyMedia({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>): React.JSX.Element {
  return <div className={cn(emptyMediaVariants({ variant }), className)} {...props} />;
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"h3">): React.JSX.Element {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />;
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">): React.JSX.Element {
  return (
    <p className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return <div className={cn("flex items-center gap-3", className)} {...props} />;
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
