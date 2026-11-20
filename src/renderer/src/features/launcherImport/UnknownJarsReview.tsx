import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ProjectType, Provider } from "@/types/ModManager";
import {
  PackContentList,
  type PackContentItem,
} from "@renderer/features/newInstance/PackContentList";
import { answerUnknownJars } from "./importJob";
import type { ImportUnknownJar } from "./unknownJarReview";

export function UnknownJarsReview({
  id,
  jars,
}: {
  id: string;
  jars: ImportUnknownJar[];
}) {
  const { t } = useTranslation();
  const [install, setInstall] = useState<ReadonlySet<string>>(new Set());
  const items: PackContentItem[] = jars.map((jar) => ({
    key: jar.key,
    title: jar.title,
    provider: Provider.LOCAL,
    projectType: ProjectType.MOD,
    unknown: jar.checked ? "unknown" : "unchecked",
    install: install.has(jar.key),
  }));

  return (
    <div className="mx-3 mb-2 flex flex-col gap-2">
      <PackContentList
        title={t("addVersion.preview.content")}
        items={items}
        emptyText={t("packContent.notFound")}
        className="max-h-56 flex-none"
        onToggleInstall={(key, value) =>
          setInstall((previous) => {
            const next = new Set(previous);
            if (value) next.add(key);
            else next.delete(key);
            return next;
          })
        }
        footer={
          <span className="min-w-0 truncate text-2xs text-faint">
            {t("packContent.unknownFooter")}
          </span>
        }
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => answerUnknownJars(id, install)}
        >
          {t("launcherImport.reviewContinue")}
        </Button>
      </div>
    </div>
  );
}
