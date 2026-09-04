import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Erreur non gérée dans l\'interface :', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-6">
        <div className="glass-panel rounded-3xl p-8 max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Une erreur est survenue
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            L'application a rencontré un problème inattendu. Vos données locales sont
            intactes ; rechargez la page pour continuer.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-left text-xs bg-slate-200/60 dark:bg-slate-800/60 rounded-xl p-3 overflow-auto max-h-40 text-rose-600 dark:text-rose-400">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Recharger l'application
          </button>
        </div>
      </div>
    );
  }
}
