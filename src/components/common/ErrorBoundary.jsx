import React from 'react';
import { Button } from '@/components/ui/button';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-10 flex flex-col items-center gap-3">
          <p className="text-[13px] text-slate-500">Something went wrong loading this view.</p>
          <p className="text-[11px] text-slate-400 max-w-lg text-center">{String(this.state.error.message || this.state.error)}</p>
          <Button size="sm" className="h-8 text-xs" onClick={() => this.setState({ error: null })}>Try again</Button>
        </div>
      );
    }
    return this.props.children;
  }
}