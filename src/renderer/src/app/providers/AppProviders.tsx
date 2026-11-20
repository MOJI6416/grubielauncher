import { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useReducedMotionPreference } from "@/lib/motionPreference";
import { TOASTER_OFFSET, Toaster } from "@/components/ui/sonner";
import { Background } from "@renderer/components/Background";
import ErrorBoundary from "@renderer/components/ErrorBoundary";
import { HintProvider } from "@renderer/components/Hint";
import { EditContextMenu } from "@renderer/features/editMenu/EditContextMenu";
import { useLayoutEditing } from "@renderer/features/layout/useLayout";
import { queryClient } from "./queryClient";

const ABOVE_EDIT_BAR = { ...TOASTER_OFFSET, bottom: 84 };

function AppToaster() {
  const editing = useLayoutEditing();
  return <Toaster offset={editing ? ABOVE_EDIT_BAR : TOASTER_OFFSET} />;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotionPreference();

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
        <HintProvider>
          <Background>
            <ErrorBoundary>{children}</ErrorBoundary>
          </Background>
          <AppToaster />
          <EditContextMenu />
        </HintProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
