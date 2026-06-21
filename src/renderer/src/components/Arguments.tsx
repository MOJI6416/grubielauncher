import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, TriangleAlert } from "lucide-react";
import { IArguments } from "@/types/IArguments";
import { useAtom } from "jotai";
import {
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
} from "@renderer/stores/atoms";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function Arguments({
  onClose,
  runArguments,
  setArguments,
}: {
  onClose: () => void;
  runArguments?: IArguments;
  setArguments: (args: IArguments) => void;
}) {
  const { t } = useTranslation();

  const [jvmArguments, setJvmArguments] = useState(runArguments?.jvm || "");
  const [gameArguments, setGameArguments] = useState(runArguments?.game || "");
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);

  const canEdit = !isDownloadedVersion && isOwnerVersion;

  const isChanged = useMemo(() => {
    const baseJvm = (runArguments?.jvm ?? "").trim();
    const baseGame = (runArguments?.game ?? "").trim();
    return jvmArguments.trim() !== baseJvm || gameArguments.trim() !== baseGame;
  }, [jvmArguments, gameArguments, runArguments]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined}
        className="overflow-hidden p-0 sm:max-w-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>{t("arguments.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 px-5 pb-5">
          {canEdit && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>{t("arguments.alert")}</AlertTitle>
            </Alert>
          )}

          <div className="grid gap-3">
            <Card className="gap-3 py-4 shadow-none">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">
                  <Label htmlFor="jvm-arguments">{t("arguments.jvm")}</Label>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <Textarea
                  id="jvm-arguments"
                  rows={3}
                  disabled={!canEdit}
                  value={jvmArguments}
                  onChange={(e) => setJvmArguments(e.target.value)}
                  spellCheck={false}
                  className="min-h-24 resize-y font-mono text-xs leading-relaxed"
                />
              </CardContent>
            </Card>

            <Card className="gap-3 py-4 shadow-none">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">
                  <Label htmlFor="game-arguments">{t("arguments.game")}</Label>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <Textarea
                  id="game-arguments"
                  rows={3}
                  disabled={!canEdit}
                  value={gameArguments}
                  onChange={(e) => setGameArguments(e.target.value)}
                  spellCheck={false}
                  className="min-h-24 resize-y font-mono text-xs leading-relaxed"
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {canEdit && (
          <DialogFooter className="m-0 border-t bg-muted/25 px-5 py-4">
            <Button
              onClick={() => {
                setArguments({
                  jvm: jvmArguments.trim(),
                  game: gameArguments.trim(),
                });
              }}
              disabled={!isChanged}
            >
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
