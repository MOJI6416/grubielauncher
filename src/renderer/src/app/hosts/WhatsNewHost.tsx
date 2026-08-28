import { Suspense } from "react";
import { useAtomValue } from "jotai";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  dismissWhatsNew,
  whatsNewAtom,
} from "@renderer/features/whatsNew/whatsNewStore";
import { lazyWithPreload } from "@renderer/utilities/lazyPreload";

const LazyWhatsNewModal = lazyWithPreload(() =>
  import("@renderer/components/WhatsNewModal").then((module) => ({
    default: module.WhatsNewModal,
  })),
);

export function WhatsNewHost() {
  const whatsNew = useAtomValue(whatsNewAtom);

  if (!whatsNew) return null;

  return (
    <Suspense fallback={<LazyDialogFallback variant="form" />}>
      <LazyWhatsNewModal
        release={whatsNew.release}
        version={whatsNew.version}
        onClose={() => void dismissWhatsNew()}
      />
    </Suspense>
  );
}
