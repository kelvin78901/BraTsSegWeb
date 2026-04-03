import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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

  componentDidCatch(error: Error, info: ErrorInfo) {

    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '1rem', padding: '4rem 2rem',
          color: '#e2e8f0', textAlign: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
            stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Something went wrong</h2>
          <p style={{ margin: 0, color: '#94a3b8', maxWidth: '32rem' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '0.5rem 1.5rem',
              background: '#06b6d4', color: '#fff',
              border: 'none', borderRadius: '0.375rem',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
