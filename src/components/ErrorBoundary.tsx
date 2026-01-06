import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// @google/genai-fix: Explicitly extend React.Component to ensure the compiler correctly identifies the base class and provides access to 'props' and 'state' properties.
class ErrorBoundary extends React.Component<Props, State> {
  // @google/genai-fix: Define 'state' as a class property to satisfy strict type checks and provide necessary initial values.
  public state: State = {
    hasError: false,
    error: null
  };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
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

  public render() {
    // @google/genai-fix: Access 'this.state' inherited from the React.Component base class.
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-900/10 min-h-screen flex flex-col items-center justify-center text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Что-то пошло не так</h1>
          <p className="text-gray-700 dark:text-gray-300 mb-4">Приложение столкнулось с критической ошибкой.</p>
          <div className="bg-gray-800 text-red-300 p-4 rounded text-left text-xs overflow-auto max-w-full max-h-60 mb-6 font-mono">
            {/* @google/genai-fix: Safely access and display the error message from the component state. */}
            {this.state.error?.toString()}
          </div>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg"
            onClick={() => window.location.reload()}
          >
            Обновить приложение
          </button>
        </div>
      );
    }

    // @google/genai-fix: Correctly return 'this.props.children', which is now properly recognized through explicit inheritance from React.Component.
    return this.props.children;
  }
}

export default ErrorBoundary;