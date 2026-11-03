import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { THEME_CODE_PREFIX } from "@/shared/themeFile";
import { importThemeFromCode } from "./themeTransfer";

export function ThemeCodeDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [isBusy, setBusy] = useState(false);
  const hasCode = text.includes(THEME_CODE_PREFIX);

  const submit = async () => {
    if (!hasCode || isBusy) return;
    setBusy(true);
    const imported = await importThemeFromCode(text);
    setBusy(false);
    if (imported) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isBusy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("theme.transfer.pasteTitle")}</DialogTitle>
          <DialogDescription>{t("theme.transfer.pasteDescription")}</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={text}
          placeholder={`${THEME_CODE_PREFIX}…`}
          aria-label={t("theme.transfer.pasteTitle")}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="min-h-24 font-mono text-xs break-all"
        />
        <DialogFooter>
          <Button variant="secondary" disabled={isBusy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!hasCode || isBusy} onClick={() => void submit()}>
            {isBusy ? <Loader2 className="animate-spin" /> : <ClipboardPaste />}
            {t("theme.transfer.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
