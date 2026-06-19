import { Loader2 } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type LazyDialogFallbackVariant =
  | "compact"
  | "form"
  | "chat"
  | "wide"
  | "workspace"
  | "console";

const variantClasses: Record<LazyDialogFallbackVariant, string> = {
  compact: "sm:max-w-sm min-h-[12rem]",
  form: "sm:max-w-lg min-h-[24rem]",
  chat: "sm:max-w-lg min-h-[31.5rem]",
  wide: "sm:max-w-2xl min-h-[28rem]",
  workspace: "sm:max-w-5xl min-h-[34rem]",
  console: "sm:max-w-4xl min-h-[32rem]",
};

export function LazyDialogFallback({
  className,
  variant = "compact",
}: {
  className?: string;
  variant?: LazyDialogFallbackVariant;
}) {
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[calc(100vh-2rem)] items-center justify-center overflow-hidden",
          variantClasses[variant],
          className,
        )}
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </DialogContent>
    </Dialog>
  );
}
