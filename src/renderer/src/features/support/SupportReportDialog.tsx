import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  FileDown,
  LifeBuoy,
  Loader2,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  SupportReportFailureReason,
  SupportReportPrepared,
} from "@/types/Journal";
import {
  accountAtom,
  authDataAtom,
  selectedVersionAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { uiJournal } from "@renderer/utilities/journal";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { showFailureToast } from "@renderer/utilities/failures";
import { Hint } from "@renderer/components/Hint";
import {
  collectSupportUiState,
  formatReportBytes,
  type SupportDialogRequest,
} from "./supportReport";

const api = window.api;

const NO_INSTANCE = "__none__";
const COMMENT_LIMIT = 2000;
const CONTACT_LIMIT = 200;
const INCLUDED = [
  "journal",
  "system",
  "settings",
  "accounts",
  "instances",
  "gameLogs",
  "connectivity",
] as const;

type Stage =
  | { kind: "form" }
  | { kind: "preparing" }
  | { kind: "sending"; prepared: SupportReportPrepared }
  | {
      kind: "done";
      code: string;
      expiresAt: string;
      replyTo: { contact: string } | { account: true } | null;
    }
  | {
      kind: "failed";
      reason: SupportReportFailureReason | "prepare";
      prepared: SupportReportPrepared | null;
    };

export function SupportReportDialog({
  request,
  onClose,
}: {
  request: SupportDialogRequest;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const selectedVersion = useAtomValue(selectedVersionAtom);
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);

  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [comment, setComment] = useState("");
  const [contact, setContact] = useState("");
  const [checkConnectivity, setCheckConnectivity] = useState(true);
  const [versionName, setVersionName] = useState<string>(
    request.versionName ?? selectedVersion?.version.name ?? NO_INSTANCE,
  );

  const versionNames = useMemo(
    () => versions.map((version) => version.version.name),
    [versions],
  );

  const busy = stage.kind === "preparing" || stage.kind === "sending";
  const token =
    account && account.type !== "plain" ? account.accessToken || null : null;
  const signedIn = Boolean(token && authData);
  const replyContact = contact.trim();
  const contactMissing = !signedIn && replyContact.length === 0;

  const send = async (prepared: SupportReportPrepared) => {
    setStage({ kind: "sending", prepared });
    const result = await api.support
      .send(prepared.id, token, replyContact || null)
      .catch(ignoreFailure);

    if (!result) {
      setStage({ kind: "failed", reason: "network", prepared });
      return;
    }

    if (result.ok) {
      uiJournal.info("support", "report sent", {
        code: result.code,
        contactSaved: result.contactSaved,
      });
      setStage({
        kind: "done",
        code: result.code,
        expiresAt: result.expiresAt,
        replyTo:
          result.contactSaved === true
            ? { contact: replyContact }
            : result.contactSaved === false && signedIn
              ? { account: true }
              : null,
      });
      return;
    }

    uiJournal.warn("support", "report was not sent", { reason: result.reason });
    setStage({
      kind: "failed",
      reason: result.reason,
      prepared: result.reason === "expired" ? null : prepared,
    });
  };

  const start = async () => {
    if (contactMissing) return;
    setStage({ kind: "preparing" });
    const prepared = await api.support
      .prepare({
        trigger: request.trigger,
        comment: comment.trim() || undefined,
        versionName: versionName === NO_INSTANCE ? undefined : versionName,
        runConnectivity: checkConnectivity,
        ui: collectSupportUiState(),
      })
      .catch(ignoreFailure);

    if (!prepared) {
      setStage({ kind: "failed", reason: "prepare", prepared: null });
      return;
    }

    await send(prepared);
  };

  const saveToFile = async (prepared: SupportReportPrepared) => {
    try {
      if (await api.support.save(prepared.id)) {
        toast.success(t("supportReport.saved"));
      }
    } catch (error) {
      showFailureToast(t("supportReport.saveFailed"), error, {
        channels: ["support:save"],
      });
    }
  };

  const copyCode = async (code: string) => {
    await copyWithFeedback(code);
  };

  const expiresLabel =
    stage.kind === "done"
      ? new Date(stage.expiresAt).toLocaleDateString(i18n.language, {
          day: "numeric",
          month: "long",
        })
      : "";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 gap-0 border-b border-border bg-surface-1 px-4 py-3 text-left">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-muted-foreground">
              <LifeBuoy className="size-4" />
            </div>
            <div className="min-w-0 flex-1 pr-8">
              <Hint content={t("supportReport.title")} variant="text" truncatedOnly>
                <DialogTitle className="truncate text-sm">
                  {t("supportReport.title")}
                </DialogTitle>
              </Hint>
              <DialogDescription className="mt-0.5 text-xs">
                {t("supportReport.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
          {stage.kind === "form" && (
            <>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("supportReport.instance")}
                </Label>
                <Select value={versionName} onValueChange={setVersionName}>
                  <SelectTrigger size="sm" className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_INSTANCE}>
                      {t("supportReport.noInstance")}
                    </SelectItem>
                    {versionNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="support-report-comment"
                  className="text-xs text-muted-foreground"
                >
                  {t("supportReport.comment")}
                </Label>
                <Textarea
                  id="support-report-comment"
                  value={comment}
                  maxLength={COMMENT_LIMIT}
                  placeholder={t("supportReport.commentPlaceholder")}
                  onChange={(event) => setComment(event.target.value)}
                  className="min-h-16 resize-none text-sm"
                />
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="support-report-contact"
                  className="text-xs text-muted-foreground"
                >
                  {t("supportReport.contact")}
                </Label>
                <Input
                  id="support-report-contact"
                  value={contact}
                  maxLength={CONTACT_LIMIT}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("supportReport.contactPlaceholder")}
                  onChange={(event) => setContact(event.target.value)}
                  className="h-8 text-sm"
                />
                <p className="text-xs text-faint">
                  {signedIn
                    ? t("supportReport.contactOptional", {
                        nickname: authData?.nickname ?? account?.nickname ?? "",
                      })
                    : t("supportReport.contactRequired")}
                </p>
              </div>

              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  checked={checkConnectivity}
                  onCheckedChange={(value) => setCheckConnectivity(value === true)}
                  className="mt-0.5"
                />
                <span className="grid gap-0.5">
                  <span>{t("supportReport.connectivity")}</span>
                  <span className="text-xs text-faint">
                    {t("supportReport.connectivityHint")}
                  </span>
                </span>
              </label>

              <div className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t("supportReport.includedTitle")}
                </p>
                <ul className="grid gap-1 text-xs text-muted-foreground">
                  {INCLUDED.map((id) => (
                    <li key={id} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 size-3 shrink-0 text-faint" />
                      <span>{t(`supportReport.included.${id}`)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-faint">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-success" />
                  {t("supportReport.privacy")}
                </p>
              </div>
            </>
          )}

          {busy && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-foreground">
                {stage.kind === "preparing"
                  ? t("supportReport.preparing")
                  : t("supportReport.sending", {
                      size: formatReportBytes(stage.prepared.compressedBytes),
                    })}
              </p>
              {stage.kind === "preparing" && checkConnectivity && (
                <p className="text-xs text-faint">
                  {t("supportReport.preparingHint")}
                </p>
              )}
            </div>
          )}

          {stage.kind === "done" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">
                {t("supportReport.codeLabel")}
              </p>
              <button
                type="button"
                onClick={() => void copyCode(stage.code)}
                className="rounded-xl border border-border bg-surface-2 px-5 py-3 font-mono text-2xl tracking-widest text-foreground tabular-nums transition-colors hover:bg-surface-3"
              >
                {stage.code}
              </button>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                {t("supportReport.codeHint", { date: expiresLabel })}
              </p>
              {stage.replyTo && (
                <p className="max-w-sm text-xs leading-relaxed break-words text-muted-foreground">
                  {"contact" in stage.replyTo
                    ? t("supportReport.replyToContact", {
                        contact: stage.replyTo.contact,
                      })
                    : t("supportReport.replyToAccount")}
                </p>
              )}
            </div>
          )}

          {stage.kind === "failed" && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/35 bg-destructive/10 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="grid gap-1">
                <p className="text-sm text-foreground">
                  {t(`supportReport.failed.${stage.reason}`)}
                </p>
                {stage.prepared && (
                  <p className="text-xs text-muted-foreground">
                    {t("supportReport.saveHint")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="m-0 shrink-0 gap-2 border-t border-border bg-surface-2 px-4 py-3">
          {stage.kind === "form" && (
            <>
              {contactMissing && (
                <p className="self-center text-xs text-faint sm:mr-auto">
                  {t("supportReport.contactNeeded")}
                </p>
              )}
              <Button variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button disabled={contactMissing} onClick={() => void start()}>
                <LifeBuoy className="size-4" />
                {t("supportReport.send")}
              </Button>
            </>
          )}

          {busy && (
            <Button disabled>
              <Loader2 className="size-4 animate-spin" />
              {t("supportReport.send")}
            </Button>
          )}

          {stage.kind === "done" && (
            <>
              <Button variant="outline" onClick={() => void copyCode(stage.code)}>
                <Copy className="size-4" />
                {t("supportReport.copyCode")}
              </Button>
              <Button onClick={onClose}>{t("supportReport.close")}</Button>
            </>
          )}

          {stage.kind === "failed" && (
            <>
              {stage.prepared ? (
                <Button
                  variant="outline"
                  onClick={() => void saveToFile(stage.prepared!)}
                >
                  <FileDown className="size-4" />
                  {t("supportReport.saveToFile")}
                </Button>
              ) : (
                <Button variant="ghost" onClick={onClose}>
                  {t("common.cancel")}
                </Button>
              )}
              <Button
                onClick={() =>
                  void (stage.prepared ? send(stage.prepared) : start())
                }
              >
                <RotateCcw className="size-4" />
                {t("supportReport.retry")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
