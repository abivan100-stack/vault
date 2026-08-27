import type { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusPillVariants = cva(
  // Badge's 1px border is what carries the tone's edge in light mode, so it is
  // kept rather than zeroed. The border tokens are transparent in dark, which
  // leaves the pill looking exactly as it did there.
  "",
  {
    variants: {
      size: {
        sm: "h-5 rounded px-1.5 text-[11px]",
        md: "h-6 rounded-md px-2 text-[11.5px]",
        lg: "h-7 rounded-md px-2.5 text-[12px]",
      },
      weight: {
        medium: "font-medium",
        semibold: "font-semibold",
      },
      tracking: {
        normal: "",
        wide: "tracking-[0.04em]",
      },
    },
    defaultVariants: {
      size: "md",
      tracking: "normal",
    },
  }
);

type StatusPillProps = useRender.ComponentProps<"span"> &
  Omit<VariantProps<typeof statusPillVariants>, "weight"> & {
    tone?: "success" | "warning" | "brand" | "neutral";
    weight?: "medium" | "semibold";
  };

/** The one status chip. Tone carries meaning; size/weight carry density. */
export default function StatusPill({
  className,
  tone = "neutral",
  size = "md",
  weight,
  tracking,
  ...props
}: StatusPillProps) {
  return (
    <Badge
      variant={tone}
      className={cn(
        statusPillVariants({
          size,
          // The small pill reads as a caps micro-label and needs the extra weight.
          weight: weight ?? (size === "sm" ? "semibold" : "medium"),
          tracking,
        }),
        className
      )}
      {...props}
    />
  );
}
