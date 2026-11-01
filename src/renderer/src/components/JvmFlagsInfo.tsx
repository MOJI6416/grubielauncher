import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TITLEBAR_HEIGHT } from "@/shared/titlebar";
import { Hint } from "@renderer/components/Hint";
import { jvmFlagGroups } from "@renderer/utilities/jvmFlagGuide";

const GROUPS = jvmFlagGroups();

export function JvmFlagsInfo({
  hint,
  children,
}: {
  hint?: string;
  children?: ReactElement;
}) {
  const { t } = useTranslation();

  const trigger = (
    <PopoverTrigger asChild>
      {children ?? (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm text-xs text-primary underline-offset-4 transition-colors hover:underline"
        >
          <Info className="size-3.5" />
          {t("jvmFlags.whatsInside")}
        </button>
      )}
    </PopoverTrigger>
  );

  return (
    <Popover>
      {hint ? <Hint content={hint}>{trigger}</Hint> : trigger}
      <PopoverContent
        align="start"
        collisionPadding={{ top: TITLEBAR_HEIGHT + 8, right: 8, bottom: 8, left: 8 }}
        className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-96 p-0"
      >
        <div className="p-3 select-text">
          <p className="text-sm font-medium text-foreground">
            {t("jvmFlags.title")}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {t("jvmFlags.intro")}
          </p>

          {GROUPS.map((group) => (
            <section key={group.id} className="mt-3">
              <h4 className="text-[0.6875rem] font-medium tracking-wide text-faint uppercase">
                {t(`jvmFlags.groups.${group.id}`)}
              </h4>
              <dl className="mt-1.5 grid gap-2">
                {group.flags.map((note) => (
                  <div key={note.id}>
                    <dt className="font-mono text-[0.7rem] text-foreground">
                      {note.flag}
                    </dt>
                    <dd className="text-xs leading-snug text-muted-foreground">
                      {t(`jvmFlags.flags.${note.id}`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
