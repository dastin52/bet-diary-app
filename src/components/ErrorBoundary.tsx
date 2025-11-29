import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // Attempt to log to backend via the global function defined in index.html
    // @ts-ignore
    if (window.logToBackend) {
        // @ts-ignore
        window.logToBackend('error', 'React ErrorBoundary Catch', { 
            message: error.message, 
            stack: error.stack,
            componentStack: errorInfo.componentStack 
        });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-900/10 min-h-screen flex flex-col items-center justify-center text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Что-то пошло не так</h1>
          <p className="text-gray-700 dark:text-gray-300 mb-4">Приложение столкнулось с критической ошибкой.</p>
          <pre className="bg-gray-800 text-red-300 p-4 rounded text-left text-xs overflow-auto max-w-full max-h-60 mb-6">
            {this.state.error?.toString()}
          </pre>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            onClick={() => window.location.reload()}
          >
            Перезагрузить приложение
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;