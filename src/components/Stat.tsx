import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A stacked label/value pair. The wrapping div is deliberate: callers place
 * these in a grid `<dl>`, where a bare dt+dd pair would become two grid cells
 * instead of one. `<div>` grouping inside `<dl>` is valid HTML.
 */
export default function Stat({
  label,
  value,
  mono = false,
  tone = "default",
  size = "md",
  weight = "medium",
  truncate = false,
  title,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  tone?: "default" | "warning";
  size?: "sm" | "md";
  weight?: "normal" | "medium";
  truncate?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt
        className={cn(
          size === "sm" ? "text-[11px]" : "text-[11.5px]",
          "text-ink-subtle"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          size === "sm" ? "mt-0.5" : "mt-1",
          mono ? "tabular font-mono text-[13px]" : "text-[13.5px]",
          weight === "medium" && "font-medium",
          truncate && "truncate",
          tone === "warning" ? "text-warning" : "text-ink"
        )}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}
