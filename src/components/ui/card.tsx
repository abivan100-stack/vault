import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@/lib/utils"

/**
 * Card carries no padding of its own — the app's cards sit flush and each
 * region (header / content / footer) owns its own rhythm, so a wrapper padding
 * would double up. `render` keeps the page's semantic element (`<section>`,
 * `<article>`) instead of flattening everything to `<div>`.
 */
function Card({
  className,
  surface = "raised",
  render,
  ...props
}: useRender.ComponentProps<"div"> & { surface?: "raised" | "sunken" }) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "rounded-xl border border-line",
          surface === "sunken" ? "bg-sunken" : "bg-raised shadow-e1",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "card",
      surface,
    },
  })
}

function CardHeader({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      { className: cn("border-b border-line p-5", className) },
      props
    ),
    render,
    state: { slot: "card-header" },
  })
}

function CardContent({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">({ className: cn("p-5", className) }, props),
    render,
    state: { slot: "card-content" },
  })
}

function CardFooter({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      { className: cn("border-t border-line p-5", className) },
      props
    ),
    render,
    state: { slot: "card-footer" },
  })
}

/** Card titles are the global `.eyebrow` label, and are `<h2>` throughout. */
function CardTitle({
  className,
  render,
  ...props
}: useRender.ComponentProps<"h2">) {
  return useRender({
    defaultTagName: "h2",
    props: mergeProps<"h2">({ className: cn("eyebrow", className) }, props),
    render,
    state: { slot: "card-title" },
  })
}

function CardDescription({
  className,
  render,
  ...props
}: useRender.ComponentProps<"p">) {
  return useRender({
    defaultTagName: "p",
    props: mergeProps<"p">(
      { className: cn("mt-1 text-[13.5px] text-ink-muted", className) },
      props
    ),
    render,
    state: { slot: "card-description" },
  })
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
