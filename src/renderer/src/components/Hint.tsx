import {
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TITLEBAR_HEIGHT } from "@/shared/titlebar";

const EDGE_PADDING = 8;

const COLLISION_PADDING = {
  top: TITLEBAR_HEIGHT + EDGE_PADDING,
  right: EDGE_PADDING,
  bottom: EDGE_PADDING,
  left: EDGE_PADDING,
};

export const HINT_DELAY = {
  control: 250,
  text: 600,
} as const;

export function HintProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider
      delayDuration={HINT_DELAY.control}
      skipDelayDuration={300}
      disableHoverableContent
    >
      {children}
    </TooltipProvider>
  );
}

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

export function Hint(props: HintProps) {
  const { content, children } = props;
  if (content === undefined || content === null || content === "") {
    return children;
  }
  return <HintTooltip {...props} />;
}

function HintTooltip({
  content,
  children,
  variant = "control",
  side = "top",
  align = "center",
  truncatedOnly = false,
  className,
  wrapperClassName,
}: HintProps) {
  const [open, setOpen] = useState(false);
  const readable = useRef(false);

  const measure = (event: SyntheticEvent<HTMLElement>) => {
    readable.current = !hasClippedText(event.currentTarget);
    if (readable.current) setOpen(false);
  };

  const changeOpen = (next: boolean) => {
    setOpen(next && !(truncatedOnly && readable.current));
  };

  const trigger = children.props.disabled ? (
    <span className={cn("inline-grid", wrapperClassName)}>{children}</span>
  ) : (
    children
  );

  return (
    <Tooltip
      delayDuration={HINT_DELAY[variant]}
      open={open}
      onOpenChange={changeOpen}
    >
      <TooltipTrigger
        asChild
        onPointerEnter={truncatedOnly ? measure : undefined}
        onFocus={truncatedOnly ? measure : undefined}
      >
        {trigger}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={6}
        collisionPadding={COLLISION_PADDING}
        className={cn("max-w-72", className)}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
