import React from 'react';
import { AlertTriangle, House, RefreshCw } from 'lucide-react';

interface Props {
  featureName: string;
  onExit: () => void;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class FeatureErrorBoundary extends React.Component<Props, State> {
  declare readonly props: Readonly<Props>;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`${this.props.featureName} failed to render`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-[2rem] border border-rose-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <AlertTriangle size={26} />
          </div>
          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">Feature isolated safely</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">{this.props.featureName} could not open</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Trellis is still running. Reload this page to retry, or return to Overview while the feature is repaired.
          </p>
          <details className="mt-5 rounded-2xl bg-slate-50 p-4 text-left">
            <summary className="cursor-pointer text-xs font-bold text-slate-600">Technical detail</summary>
            <code className="mt-2 block break-words text-xs text-rose-700">{this.state.error.message || 'Unknown rendering error'}</code>
          </details>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-800">
              <RefreshCw size={15} /> Reload page
            </button>
            <button type="button" onClick={this.props.onExit} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">
              <House size={15} /> Return to Overview
            </button>
          </div>
        </div>
      </section>
    );
  }
}
