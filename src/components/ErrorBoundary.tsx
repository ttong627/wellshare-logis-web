import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass rounded-2xl p-8 text-center m-4 anim-in">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-sky-700 font-black text-base mb-2">
            {this.props.fallback ?? '이 영역에서 오류가 발생했습니다.'}
          </p>
          <p className="text-sky-400 text-xs mb-6 font-mono">
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-sky px-6 py-2.5 rounded-xl text-sm font-bold"
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
