import { Suspense } from "react";
import { useAtomValue } from "jotai";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  catalogInstallAtom,
  closeCatalogInstall,
} from "@renderer/features/catalogInstall/catalogInstallStore";
import { lazyWithPreload } from "@renderer/utilities/lazyPreload";

const LazyInstallToInstanceDialog = lazyWithPreload(() =>
  import("@renderer/features/catalogInstall/InstallToInstanceDialog").then(
    (module) => ({ default: module.InstallToInstanceDialog }),
  ),
);

export function CatalogInstallHost() {
  const request = useAtomValue(catalogInstallAtom);

  if (!request) return null;

  return (
    <Suspense fallback={<LazyDialogFallback variant="form" />}>
      <LazyInstallToInstanceDialog
        request={request}
        onClose={closeCatalogInstall}
      />
    </Suspense>
  );
}
