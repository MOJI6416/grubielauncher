import { ReactNode } from "react";
import { SquareTerminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ArgumentsShell({
  embedded,
  title,
  subtitle,
  onClose,
  onEscape,
  headerAction,
  footer,
  children,
}: {
  embedded: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  onEscape?: () => boolean;
  headerAction?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  if (embedded) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
          <SquareTerminal className="size-3.5 shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {title}
          </span>
          {headerAction}
        </header>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        {footer}
      </section>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onClick={(event) => event.stopPropagation()}
        onEscapeKeyDown={(event) => {
          if (onEscape?.()) event.preventDefault();
        }}
      >
        <DialogHeader className="gap-1 border-b border-border px-4 py-3 pr-12">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
            <SquareTerminal className="size-4 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </DialogHeader>

        <div className="flex max-h-[58vh] flex-col overflow-y-auto pt-3">
          {children}
        </div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}
