import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }

  handleReload = (): void => {
    // Try multiple reload strategies
    try {
      window.location.reload();
    } catch {
      try {
        window.location.href = window.location.href;
      } catch {
        // Last resort: just try again
        window.location.reload();
      }
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          padding: "24px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          textAlign: "center",
          color: "#333",
          background: "#f3f4f8",
        }}>
          <h1 style={{ fontSize: "20px", marginBottom: "12px" }}>出错了</h1>
          <p style={{ fontSize: "14px", color: "#666", marginBottom: "24px", maxWidth: "480px" }}>
            Pi 遇到了一个问题，界面已停止响应。
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: "10px 24px",
              fontSize: "14px",
              borderRadius: "8px",
              border: "none",
              background: "#0078d4",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            重新加载
          </button>
          {this.state.error ? (
            <details style={{ marginTop: "16px", fontSize: "12px", color: "#999" }}>
              <summary>错误详情</summary>
              <pre style={{ marginTop: "8px", maxWidth: "480px", overflow: "auto", whiteSpace: "pre-wrap" }}>
                {this.state.error.message}
              </pre>
            </details>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}
