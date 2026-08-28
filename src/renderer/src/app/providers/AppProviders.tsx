import { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Background } from "@renderer/components/Background";
import ErrorBoundary from "@renderer/components/ErrorBoundary";
import { HINT_DELAY } from "@renderer/components/Hint";
import { queryClient } from "./queryClient";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider
        delayDuration={HINT_DELAY.control}
        skipDelayDuration={300}
        disableHoverableContent
      >
        <Background>
          <ErrorBoundary>{children}</ErrorBoundary>
        </Background>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
