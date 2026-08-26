import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="w-full max-w-md rounded-lg border p-6 text-center">
            <h1 className="mb-2 text-lg font-semibold">Algo ha fallado</h1>
            <p className="mb-4 text-sm text-muted-foreground">
              Ha ocurrido un error inesperado en la aplicación.
            </p>
            {this.state.error && (
              <p className="mb-4 break-words rounded bg-muted p-2 text-xs text-muted-foreground">
                {this.state.error.message}
              </p>
            )}
            <div className="flex justify-center gap-2">
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => window.location.reload()}
              >
                Recargar
              </button>
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => (window.location.href = "/")}
              >
                Volver al inicio
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
