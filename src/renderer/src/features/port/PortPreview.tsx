import { useTranslation } from "react-i18next";
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Copy,
  FileBox,
  Library,
  PackageCheck,
  PackagePlus,
  type LucideIcon,
} from "lucide-react";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { type PortItem, type PortStatus, countPort } from "./portPlan";

const GROUPS: { status: PortStatus; icon: LucideIcon; tone: string }[] = [
  { status: "missing", icon: CircleAlert, tone: "text-destructive" },
  { status: "unchecked", icon: CircleHelp, tone: "text-warning" },
  { status: "localMod", icon: FileBox, tone: "text-warning" },
  { status: "updated", icon: CircleCheck, tone: "text-success" },
  { status: "added", icon: PackagePlus, tone: "text-success" },
  { status: "installed", icon: PackageCheck, tone: "text-faint" },
  { status: "kept", icon: Copy, tone: "text-muted-foreground" },
  { status: "library", icon: Library, tone: "text-faint" },
];

export function PortPreview({
  items,
  target,
  emptyText,
  groupsKey = "port.groups",
}: {
  items: PortItem[];
  target: string;
  emptyText: string;
  groupsKey?: string;
}) {
  const { t } = useTranslation();
  const counts = countPort(items);

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="flex max-h-[min(16rem,calc(100vh-27rem))] min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-surface-1 p-2.5">
      {GROUPS.filter((group) => counts[group.status] > 0).map(
        ({ status, icon: Icon, tone }) => (
          <section key={status} className="flex min-w-0 flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Icon className={`size-3.5 shrink-0 ${tone}`} />
              <span className="min-w-0 truncate">
                {t(`${groupsKey}.${status}`, { target })}
              </span>
              <span className="ml-auto shrink-0 font-mono text-faint tabular-nums">
                {counts[status]}
              </span>
            </p>
            <ul className="flex flex-wrap gap-1">
              {items
                .filter((item) => item.status === status)
                .map((item) => (
                  <li
                    key={item.key}
                    className="max-w-full truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground"
                  >
                    {item.title}
                    {item.viaLoader && (
                      <span className="text-faint">
                        {" · "}
                        {getLoaderInfo(item.viaLoader).name}
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
