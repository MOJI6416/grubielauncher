import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { cn } from "@/lib/utils";

function Toaster({
  className,
  position = "bottom-right",
  style,
  toastOptions,
  ...props
}: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position={position}
      className={cn("toaster group", className)}
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--success)]" />,
        info: <InfoIcon className="size-4 text-muted-foreground" />,
        warning: <TriangleAlertIcon className="size-4 text-[var(--warning)]" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--popover-foreground)",
          "--success-border": "var(--border)",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--popover-foreground)",
          "--error-border": "var(--border)",
          "--warning-bg": "var(--popover)",
          "--warning-text": "var(--popover-foreground)",
          "--warning-border": "var(--border)",
          "--info-bg": "var(--popover)",
          "--info-text": "var(--popover-foreground)",
          "--info-border": "var(--border)",
          "--border-radius": "var(--radius)",
          fontFamily: "var(--font-sans)",
          zIndex: 100,
          ...style,
        } as CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn(
            "border-border bg-popover text-popover-foreground font-sans shadow-lg",
            "rounded-xl px-4 py-3",
            toastOptions?.classNames?.toast,
          ),
          title: cn(
            "font-sans text-sm font-medium leading-5 text-popover-foreground",
            toastOptions?.classNames?.title,
          ),
          description: cn(
            "font-sans text-xs leading-5 text-muted-foreground",
            toastOptions?.classNames?.description,
          ),
          icon: cn(
            "text-muted-foreground",
            toastOptions?.classNames?.icon,
          ),
          success: cn(
            "border-l-[3px] border-l-[var(--success)] [&_[data-icon]]:text-[var(--success)]",
            toastOptions?.classNames?.success,
          ),
          error: cn(
            "border-l-[3px] border-l-destructive [&_[data-icon]]:text-destructive",
            toastOptions?.classNames?.error,
          ),
          warning: cn(
            "border-l-[3px] border-l-[var(--warning)] [&_[data-icon]]:text-[var(--warning)]",
            toastOptions?.classNames?.warning,
          ),
          info: cn(
            "border-l-[3px] border-l-muted-foreground/70",
            toastOptions?.classNames?.info,
          ),
          loading: cn(
            "border-l-[3px] border-l-muted-foreground/70",
            toastOptions?.classNames?.loading,
          ),
          actionButton: cn(
            "bg-primary text-primary-foreground hover:bg-primary/90",
            toastOptions?.classNames?.actionButton,
          ),
          cancelButton: cn(
            "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            toastOptions?.classNames?.cancelButton,
          ),
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
