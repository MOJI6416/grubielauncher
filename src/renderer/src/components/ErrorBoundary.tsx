import { Component, ErrorInfo, ReactNode } from "react";
import { toast } from "sonner";
import i18n from "../i18n";
import { copyToClipboard } from "../utilities/clipboard";
import { reportLauncherError } from "../utilities/clientErrorReport";
import { recordError } from "../utilities/errorToast";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  summary: string;
  details: string;
}

const EMPTY: ErrorBoundaryState = { hasError: false, summary: "", details: "" };

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = EMPTY;

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      summary: `${error.name}: ${error.message}`,
      details: error.stack || "",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);

    const details = [error.stack, info.componentStack]
      .filter(Boolean)
      .join("\n");
    this.setState({ details });

    try {
      recordError(
        i18n.t("errorBoundary.title"),
        [`${error.name}: ${error.message}`, details].filter(Boolean).join("\n"),
      );
    } catch {}

    try {
      reportLauncherError(
        `${error.name}: ${error.message}`,
        details,
        i18n.language,
      );
    } catch {}
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleCopy = async (): Promise<void> => {
    const text = [this.state.summary, this.state.details]
      .filter(Boolean)
      .join("\n");

    if (!(await copyToClipboard(text))) return;
    toast.success(i18n.t("common.copied"));
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <div className="flex w-full max-w-lg flex-col gap-4 rounded-xl border border-destructive/35 bg-card p-5">
          <div className="flex flex-col gap-1.5">
            <p className="text-base font-semibold text-foreground">
              {i18n.t("errorBoundary.title")}
            </p>
            <p className="text-sm text-muted-foreground">
              {i18n.t("errorBoundary.description")}
            </p>
          </div>

          {this.state.summary && (
            <pre className="max-h-40 overflow-auto rounded-lg bg-surface-1 p-3 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
              {this.state.summary}
            </pre>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void this.handleCopy()}
              className="h-9 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-surface-3"
            >
              {i18n.t("errorBoundary.copy")}
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {i18n.t("errorBoundary.reload")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
