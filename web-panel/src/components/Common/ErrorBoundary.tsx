import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Wystąpił błąd
            </h1>
            <p className="text-gray-600 mb-4">
              Przepraszamy, coś poszło nie tak. Spróbuj odświeżyć stronę.
            </p>
            <p className="text-sm text-gray-500 mb-6 font-mono bg-gray-100 p-2 rounded">
              {this.state.error?.message}
            </p>
            <div className="space-x-4">
              <button
                onClick={() => window.location.reload()}
                className="btn btn-secondary"
              >
                Odśwież stronę
              </button>
              <button
                onClick={this.handleReset}
                className="btn btn-primary"
              >
                Wróć do strony głównej
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
