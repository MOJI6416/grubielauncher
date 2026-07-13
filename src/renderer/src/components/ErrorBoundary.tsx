import { Component, ErrorInfo, ReactNode } from 'react'
import i18n from '../i18n'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 p-8 text-center text-foreground">
        <div className="space-y-2">
          <p className="text-lg font-semibold">
            {i18n.t('errorBoundary.title', { defaultValue: 'Something went wrong' })}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {i18n.t('errorBoundary.description', {
              defaultValue: 'The interface crashed unexpectedly. Reloading usually fixes it.'
            })}
          </p>
        </div>
        <button
          onClick={this.handleReload}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {i18n.t('errorBoundary.reload', { defaultValue: 'Reload' })}
        </button>
      </div>
    )
  }
}

export default ErrorBoundary
