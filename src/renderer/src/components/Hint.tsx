import {
  useState,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const HINT_DELAY = {
  control: 250,
  text: 600,
} as const;

type HintProps = {
  content: ReactNode;
  children: ReactElement<{ disabled?: boolean }>;
  variant?: keyof typeof HINT_DELAY;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  truncatedOnly?: boolean;
  className?: string;
  wrapperClassName?: string;
};

const isClipped = (node: HTMLElement) =>
  node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight;

const hasClippedText = (root: HTMLElement) =>
  isClipped(root) ||
  Array.from(root.querySelectorAll<HTMLElement>("*")).some(isClipped);

export function Hint({
  content,
  children,
  variant = "control",
  side = "top",
  align = "center",
  truncatedOnly = false,
  className,
  wrapperClassName,
}: HintProps) {
  const [readable, setReadable] = useState(false);

  if (content === undefined || content === null || content === "") {
    return children;
  }

  const measure = (event: PointerEvent<HTMLElement>) => {
    setReadable(!hasClippedText(event.currentTarget));
  };

  const trigger = children.props.disabled ? (
    <span className={cn("inline-grid", wrapperClassName)}>{children}</span>
  ) : (
    children
  );

  return (
    <Tooltip
      delayDuration={HINT_DELAY[variant]}
      {...(truncatedOnly && readable ? { open: false } : {})}
    >
      <TooltipTrigger
        asChild
        onPointerEnter={truncatedOnly ? measure : undefined}
      >
        {trigger}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className={cn("pointer-events-none max-w-72", className)}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
