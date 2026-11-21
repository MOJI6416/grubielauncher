import { Component, ErrorInfo, ReactNode } from "react";
import i18n from "../i18n";
import { reportLauncherError } from "../utilities/clientErrorReport";
import { recordError } from "../utilities/errorToast";

interface LocalErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error) => void;
}

interface LocalErrorBoundaryState {
  failed: boolean;
}

export class LocalErrorBoundary extends Component<
  LocalErrorBoundaryProps,
  LocalErrorBoundaryState
> {
  state: LocalErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): LocalErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[LocalErrorBoundary]", error, info.componentStack);

    const summary = `${error.name}: ${error.message}`;
    const details = [error.stack, info.componentStack]
      .filter(Boolean)
      .join("\n");

    try {
      recordError(
        i18n.t("errorBoundary.partTitle"),
        [summary, details].filter(Boolean).join("\n"),
      );
    } catch {}

    try {
      reportLauncherError(summary, details, i18n.language);
    } catch {}

    this.props.onError?.(error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
