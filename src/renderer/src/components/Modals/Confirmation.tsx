import { ReactNode, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  Info,
  Loader2,
  OctagonAlert,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ConfirmationTone,
  ConfirmationToneKind,
  orderButtons,
  resolveTone,
} from "./confirmationLayout";

type Tone = ConfirmationTone;

const ICON: Record<ConfirmationToneKind, typeof Info> = {
  danger: OctagonAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  neutral: Info,
};

const ICON_TONE: Record<ConfirmationToneKind, string> = {
  danger: "bg-destructive/12 text-destructive",
  warning: "bg-warning/12 text-warning",
  success: "bg-success/12 text-success",
  neutral: "bg-surface-3 text-muted-foreground",
};

const LINE_TONE: Record<string, string> = {
  danger: "text-destructive",
  warning: "text-warning",
  success: "text-success",
};

function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-1 rounded border border-border bg-background/40 px-1 font-mono text-[0.6rem] leading-4 text-faint">
      {children}
    </kbd>
  );
}

export function Confirmation({
  onClose,
  title,
  content,
  buttons,
  reversible,
  children,
}: {
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  reversible?: boolean;
  content: {
    text: string;
    color?: Tone;
  }[];
  buttons: {
    text: string;
    color?: Tone;
    loading?: boolean;
    onClick: () => Promise<void> | void;
  }[];
}) {
  const { t } = useTranslation();

  const [activeBtn, setActiveBtn] = useState<number | null>(null);
  const defaultRef = useRef<HTMLButtonElement | null>(null);

  const isBusy = useMemo(
    () => activeBtn !== null || buttons.some((b) => !!b.loading),
    [activeBtn, buttons],
  );

  const tone = useMemo(() => resolveTone(content, buttons), [content, buttons]);
  const slots = useMemo(() => orderButtons(buttons), [buttons]);

  const ToneIcon = ICON[tone];
  const isDangerous = tone === "danger" || tone === "warning";

  const defaultPosition = slots.findIndex((slot, position) =>
    isDangerous ? position === 0 && !slot.isPrimary : slot.isPrimary,
  );

  const press = async (index: number) => {
    if (isBusy) return;

    try {
      setActiveBtn(index);
      await buttons[index].onClick();
    } finally {
      setActiveBtn(null);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (open || isBusy) return;
        onClose();
      }}
    >
      <AlertDialogContent
        className="gap-0 overflow-hidden p-0 data-[size=default]:max-w-sm data-[size=default]:sm:max-w-md"
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          if (!defaultRef.current) return;

          event.preventDefault();
          defaultRef.current.focus();
        }}
      >
        <AlertDialogHeader className="flex flex-row items-start gap-3 px-4 pt-4 pb-3 text-left">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              ICON_TONE[tone],
            )}
          >
            <ToneIcon className="size-4" />
          </span>
          <div className="grid min-w-0 gap-1.5">
            <AlertDialogTitle className="text-sm leading-5">
              {title || t("common.confirmation")}
            </AlertDialogTitle>

            {content.map((item, index) =>
              index === 0 ? (
                <AlertDialogDescription
                  key={index}
                  className={cn(
                    "text-xs leading-4.5 text-wrap",
                    LINE_TONE[item.color ?? ""] ?? "text-foreground",
                  )}
                >
                  {item.text}
                </AlertDialogDescription>
              ) : (
                <p
                  key={index}
                  className={cn(
                    "text-xs leading-4.5",
                    LINE_TONE[item.color ?? ""] ?? "text-muted-foreground",
                  )}
                >
                  {item.text}
                </p>
              ),
            )}
          </div>
        </AlertDialogHeader>

        {(children || reversible !== undefined) && (
          <div className="grid max-h-[52vh] gap-2.5 overflow-y-auto px-4 pb-3">
            {children}

            {reversible !== undefined && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-[0.7rem]",
                  reversible ? "text-faint" : "text-destructive",
                )}
              >
                {reversible ? (
                  <RotateCcw className="size-3 shrink-0" />
                ) : (
                  <TriangleAlert className="size-3 shrink-0" />
                )}
                {t(reversible ? "common.reversible" : "common.irreversible")}
              </p>
            )}
          </div>
        )}

        <AlertDialogFooter className="m-0 gap-2 border-t border-border bg-surface-2 px-4 py-3">
          {slots.map((slot, position) => {
            return (
              <Button
                key={slot.index}
                ref={position === defaultPosition ? defaultRef : undefined}
                variant={slot.variant}
                disabled={isBusy && activeBtn !== slot.index}
                onClick={() => void press(slot.index)}
              >
                {(slot.button.loading || activeBtn === slot.index) && (
                  <Loader2 className="animate-spin" />
                )}
                {slot.button.text}
                {slot.isPrimary
                  ? !isDangerous && <Keycap>↵</Keycap>
                  : position === 0 && <Keycap>Esc</Keycap>}
              </Button>
            );
          })}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
