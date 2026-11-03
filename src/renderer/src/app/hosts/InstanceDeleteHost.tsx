import { Suspense } from "react";
import { useAtomValue } from "jotai";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  closeInstanceDelete,
  instanceToDeleteAtom,
} from "@renderer/features/instances/deleteStore";
import { lazyWithPreload } from "@renderer/utilities/lazyPreload";

const LazyDeleteVersion = lazyWithPreload(() =>
  import("@renderer/features/instances/DeleteVersion").then((module) => ({
    default: module.DeleteVersion,
  })),
);

export function InstanceDeleteHost() {
  const instance = useAtomValue(instanceToDeleteAtom);

  if (!instance) return null;

  return (
    <Suspense fallback={<LazyDialogFallback variant="compact" />}>
      <LazyDeleteVersion
        key={instance.versionPath || instance.version.name}
        instance={instance}
        close={closeInstanceDelete}
      />
    </Suspense>
  );
}
