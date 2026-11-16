import * as React from "react";

import { cn } from "@/lib/utils";

function FieldGroup({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="field-group"
      className={cn("flex w-full flex-col gap-5", className)}
      {...props}
    />
  );
}

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }): React.JSX.Element {
  return (
    <div
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "group/field flex w-full gap-2 data-[disabled=true]:opacity-60 data-[invalid=true]:text-destructive",
        orientation === "horizontal" ? "items-start justify-between gap-5" : "flex-col",
        className,
      )}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<"label">): React.JSX.Element {
  return (
    <label
      data-slot="field-label"
      className={cn(
        "text-sm font-medium leading-none group-data-[disabled=true]/field:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="field-title"
      className={cn("text-sm font-medium leading-none", className)}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">): React.JSX.Element {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

function FieldError({ className, ...props }: React.ComponentProps<"p">): React.JSX.Element {
  return (
    <p
      role="alert"
      data-slot="field-error"
      className={cn("text-xs leading-relaxed text-destructive", className)}
      {...props}
    />
  );
}

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">): React.JSX.Element {
  return (
    <fieldset data-slot="field-set" className={cn("flex flex-col gap-4", className)} {...props} />
  );
}

function FieldLegend({ className, ...props }: React.ComponentProps<"legend">): React.JSX.Element {
  return (
    <legend
      data-slot="field-legend"
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  );
}

export {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
};
