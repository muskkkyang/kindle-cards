import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Kindle Flomo Cards render failed", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatalState">
        <span aria-hidden="true">
          <TriangleAlert size={28} />
        </span>
        <h1>页面暂时无法显示</h1>
        <p>你的摘录仍保存在本机。重新载入页面通常可以恢复。</p>
        <button
          className="actionButton primary"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={17} />
          重新载入
        </button>
      </main>
    );
  }
}
