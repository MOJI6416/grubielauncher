import { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useReducedMotionPreference } from "@/lib/motionPreference";
import { Toaster } from "@/components/ui/sonner";
import { Background } from "@renderer/components/Background";
import ErrorBoundary from "@renderer/components/ErrorBoundary";
import { HintProvider } from "@renderer/components/Hint";
import { EditContextMenu } from "@renderer/features/editMenu/EditContextMenu";
import { queryClient } from "./queryClient";

export function AppProviders({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotionPreference();

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
        <HintProvider>
          <Background>
            <ErrorBoundary>{children}</ErrorBoundary>
          </Background>
          <Toaster />
          <EditContextMenu />
        </HintProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
