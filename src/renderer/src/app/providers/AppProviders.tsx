import { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { Background } from "@renderer/components/Background";
import ErrorBoundary from "@renderer/components/ErrorBoundary";
import { HintProvider } from "@renderer/components/Hint";
import { EditContextMenu } from "@renderer/features/editMenu/EditContextMenu";
import { queryClient } from "./queryClient";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <HintProvider>
        <Background>
          <ErrorBoundary>{children}</ErrorBoundary>
        </Background>
        <Toaster />
        <EditContextMenu />
      </HintProvider>
    </QueryClientProvider>
  );
}
