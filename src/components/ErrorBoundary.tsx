import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('Erro não tratado capturado pelo ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-sm text-center">
            <div className="w-14 h-14 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-200">
              <span className="text-white text-2xl">!</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h1 className="text-lg font-bold text-slate-800 mb-1">Algo deu errado</h1>
              <p className="text-slate-500 text-sm mb-4">
                Ocorreu um erro inesperado. Tente recarregar a página.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-violet-200"
              >
                Recarregar página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
