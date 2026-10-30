import { Suspense } from "react";
import { useAtomValue } from "jotai";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  closePortDialog,
  portSourceAtom,
} from "@renderer/features/port/portStore";
import { lazyWithPreload } from "@renderer/utilities/lazyPreload";

const LazyPortInstanceDialog = lazyWithPreload(() =>
  import("@renderer/features/port/PortInstanceDialog").then((module) => ({
    default: module.PortInstanceDialog,
  })),
);

export function PortHost() {
  const source = useAtomValue(portSourceAtom);

  if (!source) return null;

  return (
    <Suspense fallback={<LazyDialogFallback variant="form" />}>
      <LazyPortInstanceDialog source={source} onClose={closePortDialog} />
    </Suspense>
  );
}
